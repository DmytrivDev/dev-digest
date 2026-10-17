import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { AgentPerformanceRepository } from '../src/modules/agent-performance/repository.js';
import { AgentPerformanceService } from '../src/modules/agent-performance/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance-nfr] Docker not available — skipping integration tests.');
}

const AGENTS = 50;
const RUNS = 10_000;
const FINDINGS_PER_RUN = 3;
const CHUNK = 1000;
const DAY = 86_400_000;

async function chunked<T>(rows: T[], insert: (c: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

/** NFR-1 (dashboard < 2 s) and NFR-2 (stats < 1 s) at 50 agents / 10k runs / 30k findings. */
d('agent performance NFR timing', () => {
  let pg: PgFixture;
  let wsId: string;
  let busiest: string;
  const now = new Date();

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: 'nfr' }).returning();
    wsId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'o', name: 'r', fullName: 'o/r' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId,
        repoId: repo!.id,
        number: 1,
        title: 'p',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'x',
      })
      .returning();
    const agents = await db
      .insert(t.agents)
      .values(
        Array.from({ length: AGENTS }, (_, i) => ({
          workspaceId: wsId,
          name: `agent-${String(i).padStart(2, '0')}`,
          provider: 'openrouter' as const,
          model: 'm',
          systemPrompt: 'x',
        })),
      )
      .returning();
    busiest = agents[0]!.id;

    // Skewed: agent 0 takes a third of the runs, the rest are spread evenly.
    const runRows = Array.from({ length: RUNS }, (_, i) => ({
      workspaceId: wsId,
      agentId: i % 3 === 0 ? busiest : agents[(i % (AGENTS - 1)) + 1]!.id,
      ranAt: new Date(now.getTime() - ((i % 29) + 0.5) * DAY),
      status: 'done',
      source: 'local' as const,
      model: i % 2 ? 'm1' : 'm2',
      costUsd: 0.01 + (i % 7) / 100,
      durationMs: 1000 + (i % 50) * 100,
    }));
    const runIds: string[] = [];
    await chunked(runRows, async (c) => {
      const out = await db.insert(t.agentRuns).values(c).returning({ id: t.agentRuns.id });
      runIds.push(...out.map((r) => r.id));
    });

    const reviewIds: string[] = [];
    await chunked(runIds, async (c) => {
      const out = await db
        .insert(t.reviews)
        .values(c.map((runId) => ({ workspaceId: wsId, prId: pr!.id, runId, kind: 'review' as const })))
        .returning({ id: t.reviews.id });
      reviewIds.push(...out.map((r) => r.id));
    });

    const findingRows = reviewIds.flatMap((reviewId, r) =>
      Array.from({ length: FINDINGS_PER_RUN }, (_, k) => ({
        reviewId,
        file: 'a.ts',
        startLine: k + 1,
        endLine: k + 1,
        severity: 'warning',
        category: 'bug',
        title: `f${k}`,
        rationale: 'r',
        confidence: 0.5,
        acceptedAt: (r + k) % 3 === 0 ? now : null,
        dismissedAt: (r + k) % 3 === 1 ? now : null,
      })),
    );
    await chunked(findingRows, (c) => db.insert(t.findings).values(c));
  }, 300_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it('NFR-1: GET /agents/performance?days=30 < 2000 ms; NFR-2: stats < 1000 ms', async () => {
    const svc = new AgentPerformanceService(new AgentPerformanceRepository(pg.handle.db), () => now);
    await svc.performance(wsId, { days: 30 }); // warm-up
    await svc.stats(wsId, busiest, { days: 30 });

    let t0 = performance.now();
    const perf = await svc.performance(wsId, { days: 30 });
    const dashboardMs = performance.now() - t0;
    t0 = performance.now();
    const stats = await svc.stats(wsId, busiest, { days: 30 });
    const statsMs = performance.now() - t0;

    expect(perf.summary.runs).toBe(RUNS);
    expect(stats?.agent.runs).toBeGreaterThan(3000);
    expect(dashboardMs).toBeLessThan(2000);
    expect(statsMs).toBeLessThan(1000);
  });
});
