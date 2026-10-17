import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { AgentPerf, AgentStats, LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentPerformanceRepository } from '../src/modules/agent-performance/repository.js';
import { AgentPerformanceService } from '../src/modules/agent-performance/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance] Docker not available — skipping integration tests.');
}

const NOW = new Date('2026-10-17T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

/**
 * Agent Performance over a real Postgres. The rule itself is unit-tested in
 * `agent-performance-rules.test.ts`; what only a database can break is the SQL:
 * the window bounds, the status filter, and above all the findings join, which
 * must be tenancy-scoped through `reviews.workspace_id` (AC-26).
 *
 * Most cases run on a FRESH workspace driven through the service (with a fixed
 * clock) so nothing the seed created can leak into the figures; the HTTP-level
 * cases (422, 404, spies, route precedence) use the app.
 */
d('agent performance', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;
  const service = () => new AgentPerformanceService(new AgentPerformanceRepository(db()), () => NOW);

  function makeApp(overrides: Record<string, unknown> = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: db(),
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), ...overrides },
    });
  }

  let counter = 0;
  async function freshWorkspace() {
    counter += 1;
    const [ws] = await db().insert(t.workspaces).values({ name: `perf-${counter}` }).returning();
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'o', name: `r${counter}`, fullName: `o/r${counter}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 1,
        title: 'pr',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    return { wsId: ws!.id, prId: pr!.id };
  }

  async function addAgent(wsId: string, name: string, enabled = true) {
    const [a] = await db()
      .insert(t.agents)
      .values({
        workspaceId: wsId,
        name,
        provider: 'openrouter',
        model: 'm',
        systemPrompt: 'x',
        enabled,
      })
      .returning();
    return a!.id;
  }

  async function addRun(
    wsId: string,
    agentId: string | null,
    over: Partial<typeof t.agentRuns.$inferInsert> = {},
  ) {
    const [r] = await db()
      .insert(t.agentRuns)
      .values({
        workspaceId: wsId,
        agentId,
        ranAt: ago(2 * HOUR),
        status: 'done',
        source: 'local',
        ...over,
      })
      .returning();
    return r!.id;
  }

  async function addReview(wsId: string, prId: string, runId: string, createdAt = ago(HOUR)) {
    const [rv] = await db()
      .insert(t.reviews)
      .values({ workspaceId: wsId, prId, runId, kind: 'review', createdAt })
      .returning();
    return rv!.id;
  }

  async function addFindings(
    reviewId: string,
    n: { accepted?: number; dismissed?: number; untriaged?: number },
  ) {
    const mk = (i: number, extra: Partial<typeof t.findings.$inferInsert>) => ({
      reviewId,
      file: 'a.ts',
      startLine: i,
      endLine: i,
      severity: 'warning',
      category: 'bug',
      title: `f${i}`,
      rationale: 'r',
      confidence: 0.5,
      ...extra,
    });
    const rows = [
      ...Array.from({ length: n.accepted ?? 0 }, (_, i) => mk(i, { acceptedAt: ago(HOUR) })),
      ...Array.from({ length: n.dismissed ?? 0 }, (_, i) => mk(100 + i, { dismissedAt: ago(HOUR) })),
      ...Array.from({ length: n.untriaged ?? 0 }, (_, i) => mk(200 + i, {})),
    ];
    if (rows.length) await db().insert(t.findings).values(rows);
  }

  const rowOf = (perf: AgentPerf, id: string) => perf.agents.find((a) => a.agent_id === id)!;

  // ------------------------------------------------------------------ rule

  it('AC-1/AC-2: only done runs in the window count; failed + cancelled go to failed_runs', async () => {
    const { wsId, prId } = await freshWorkspace();
    const a = await addAgent(wsId, 'A');
    const [parent] = await db().insert(t.multiAgentRuns).values({ workspaceId: wsId, prId }).returning();
    await addRun(wsId, a, { multiAgentRunId: parent!.id }); // multi-agent child, done
    await addRun(wsId, a); // done local
    await addRun(wsId, a, { status: 'failed', costUsd: 9, durationMs: 9999 });
    await addRun(wsId, a, { status: 'cancelled', costUsd: 9, durationMs: 9999 });
    await addRun(wsId, a, { status: 'running' });
    await addRun(wsId, a, { source: 'ci', model: null, costUsd: 0.01 }); // CI succeeded
    await addRun(wsId, a, { source: 'ci', model: null }); // CI skipped
    await addRun(wsId, a, { source: 'ci', status: null }); // CI with null status
    await addRun(wsId, a, { ranAt: new Date(NOW.getTime() - 30 * DAY - 1000) }); // 1 s outside
    const perf = await service().performance(wsId, { days: 30 });
    const row = rowOf(perf, a);
    expect(row.runs).toBe(4);
    expect(row.failed_runs).toBe(2);
    expect(row.total_cost_usd).toBeCloseTo(0.01, 12);
    expect(row.avg_duration_ms).toBeNull();
  });

  it('AC-3: out-of-range CI costs count as runs but not as priced, and show null in recent_runs', async () => {
    const { wsId } = await freshWorkspace();
    const a = await addAgent(wsId, 'A');
    await addRun(wsId, a, { source: 'ci', costUsd: -0.5 });
    await addRun(wsId, a, { source: 'ci', costUsd: 5000 });
    await addRun(wsId, a, { costUsd: 0.04 });
    const row = rowOf(await service().performance(wsId, { days: 30 }), a);
    expect(row.runs).toBe(3);
    expect(row.priced_runs).toBe(1);
    expect(row.total_cost_usd).toBeCloseTo(0.04, 12);
    expect(row.recent_runs.filter((r) => r.cost_usd === null)).toHaveLength(2);
  });

  it('AC-8: findings count only through counted runs (a failed run review adds nothing)', async () => {
    const { wsId, prId } = await freshWorkspace();
    const a = await addAgent(wsId, 'A');
    const r1 = await addRun(wsId, a);
    const r2 = await addRun(wsId, a);
    const failed = await addRun(wsId, a, { status: 'failed' });
    await addFindings(await addReview(wsId, prId, r1), { accepted: 2, dismissed: 1, untriaged: 2 });
    await addFindings(await addReview(wsId, prId, r2), { accepted: 1, dismissed: 1, untriaged: 2 });
    await addFindings(await addReview(wsId, prId, failed), { accepted: 4, untriaged: 4 });
    const row = rowOf(await service().performance(wsId, { days: 30 }), a);
    expect(row.findings).toBe(9);
    expect(row.accepted).toBe(3);
    expect(row.dismissed).toBe(2);
    expect(row.accept_rate).toBeCloseTo(0.6, 12);
    expect(row.small_sample).toBe(false);
  });

  it('AC-11: last_run_at ignores the window; a never-run agent has null', async () => {
    const { wsId } = await freshWorkspace();
    const a = await addAgent(wsId, 'Old');
    const never = await addAgent(wsId, 'Never');
    const old = ago(40 * DAY);
    await addRun(wsId, a, { ranAt: old });
    const perf = await service().performance(wsId, { days: 30 });
    expect(rowOf(perf, a).runs).toBe(0);
    expect(rowOf(perf, a).last_run_at).toBe(old.toISOString());
    expect(rowOf(perf, never).last_run_at).toBeNull();
  });

  it('AC-12: 7 counted runs give the 5 newest descending; 2 give 2', async () => {
    const { wsId } = await freshWorkspace();
    const a = await addAgent(wsId, 'Seven');
    const b = await addAgent(wsId, 'Two');
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await addRun(wsId, a, { ranAt: ago((i + 1) * HOUR) }));
    await addRun(wsId, b);
    await addRun(wsId, b, { ranAt: ago(5 * HOUR) });
    const perf = await service().performance(wsId, { days: 30 });
    expect(rowOf(perf, a).recent_runs.map((r) => r.run_id)).toEqual(ids.slice(0, 5));
    expect(rowOf(perf, b).recent_runs).toHaveLength(2);
  });

  it('AC-13: nothing is cached — a dismissal between two requests shows up', async () => {
    const { wsId, prId } = await freshWorkspace();
    const a = await addAgent(wsId, 'A');
    const run = await addRun(wsId, a);
    const review = await addReview(wsId, prId, run);
    await addFindings(review, { untriaged: 2 });
    const svc = service();
    const before = rowOf(await svc.performance(wsId, { days: 30 }), a);
    const [f] = await db().select().from(t.findings).where(eq(t.findings.reviewId, review)).limit(1);
    await db().update(t.findings).set({ dismissedAt: NOW }).where(eq(t.findings.id, f!.id));
    const after = rowOf(await svc.performance(wsId, { days: 30 }), a);
    expect(after.dismissed).toBe(before.dismissed + 1);
  });

  it('AC-14: a dashboard row equals the Stats `agent` field for field (days and explicit window)', async () => {
    const { wsId, prId } = await freshWorkspace();
    const a = await addAgent(wsId, 'Mixed');
    const never = await addAgent(wsId, 'Never', false);
    const r1 = await addRun(wsId, a, { costUsd: 0.05, durationMs: 6000, model: 'm1' });
    await addRun(wsId, a, { source: 'ci', costUsd: 5000 });
    await addRun(wsId, a, { status: 'failed' });
    await addFindings(await addReview(wsId, prId, r1), { accepted: 3, dismissed: 1, untriaged: 2 });
    const svc = service();
    const explicit = {
      from: ago(3 * DAY).toISOString(),
      to: new Date(NOW.getTime() + HOUR).toISOString(),
    };
    for (const q of [{ days: 30 as const }, { days: 1 as const }, explicit, {}]) {
      const perf = await svc.performance(wsId, q);
      for (const id of [a, never]) {
        const stats = await svc.stats(wsId, id, q);
        expect(stats?.agent).toEqual(rowOf(perf, id));
        expect(stats?.window).toEqual(perf.window);
      }
    }
  });

  it('AC-15: days=1 counts 23 h not 25 h; the window start is inclusive, the end exclusive; none = 30 days', async () => {
    const { wsId } = await freshWorkspace();
    const a = await addAgent(wsId, 'A');
    await addRun(wsId, a, { ranAt: ago(23 * HOUR) });
    await addRun(wsId, a, { ranAt: ago(25 * HOUR) });
    const svc = service();
    expect(rowOf(await svc.performance(wsId, { days: 1 }), a).runs).toBe(1);
    expect(rowOf(await svc.performance(wsId, {}), a).runs).toBe(2);

    const from = ago(10 * DAY);
    const to = ago(9 * DAY);
    await addRun(wsId, a, { ranAt: from });
    await addRun(wsId, a, { ranAt: to });
    const custom = await svc.performance(wsId, { from: from.toISOString(), to: to.toISOString() });
    expect(rowOf(custom, a).runs).toBe(1);
    expect(custom.window).toEqual({ from: from.toISOString(), to: to.toISOString(), days: null });
  });

  it('AC-17: days=30 echoes a 30 x 24 h window ending now', async () => {
    const { wsId } = await freshWorkspace();
    const perf = await service().performance(wsId, { days: 30 });
    expect(perf.window.days).toBe(30);
    expect(perf.window.to).toBe(NOW.toISOString());
    expect(Date.parse(perf.window.to) - Date.parse(perf.window.from)).toBe(30 * DAY);
  });

  it('AC-18/AC-19: one row per agent (disabled and never-run included); summary is the row sums', async () => {
    const { wsId } = await freshWorkspace();
    const a = await addAgent(wsId, 'A');
    const b = await addAgent(wsId, 'B', false);
    await addAgent(wsId, 'C');
    await addRun(wsId, a, { costUsd: 0.1 });
    await addRun(wsId, a, { status: 'failed' });
    await addRun(wsId, b, { costUsd: 0.2 });
    await addRun(wsId, b);
    const perf = await service().performance(wsId, { days: 30 });
    expect(perf.agents).toHaveLength(3);
    expect(perf.summary.runs).toBe(3);
    expect(perf.summary.failed_runs).toBe(1);
    expect(perf.summary.priced_runs).toBe(2);
    expect(perf.summary.total_cost_usd).toBeCloseTo(0.3, 12);
    expect(perf.summary.most_active?.agent_id).toBe(b);
    expect(perf.cost_basis).toBe('estimate');
    expect(perf.min_decisions).toBe(5);
  });

  it('AC-22: a CI run written like the CI ingest (no model) lands in the null segment', async () => {
    const { wsId } = await freshWorkspace();
    const a = await addAgent(wsId, 'A');
    await addRun(wsId, a, { model: 'm1', costUsd: 0.04 });
    await addRun(wsId, a, { source: 'ci', provider: 'openrouter', model: null, costUsd: 0.01 });
    const perf = await service().performance(wsId, { days: 30 });
    expect(perf.cost_by_model.map((s) => s.model)).toEqual(['m1', null]);
    const sum = perf.cost_by_model.reduce((s, x) => s + x.cost_usd, 0);
    expect(Math.abs(sum - (perf.summary.total_cost_usd ?? 0))).toBeLessThan(1e-9);
  });

  it('AC-26: workspaces are isolated, and a foreign review pointing at our run id adds nothing', async () => {
    const A = await freshWorkspace();
    const B = await freshWorkspace();
    const agentA = await addAgent(A.wsId, 'A');
    const agentB = await addAgent(B.wsId, 'B');
    const runA = await addRun(A.wsId, agentA, { costUsd: 0.1 });
    const runB = await addRun(B.wsId, agentB, { costUsd: 0.2 });
    await addFindings(await addReview(A.wsId, A.prId, runA), { accepted: 1 });
    await addFindings(await addReview(B.wsId, B.prId, runB), { dismissed: 2 });
    // A review in workspace B that names A's run id, with decided findings.
    await addFindings(await addReview(B.wsId, B.prId, runA), { accepted: 7, dismissed: 7 });

    const svc = service();
    const perfA = await svc.performance(A.wsId, { days: 30 });
    expect(perfA.agents.map((r) => r.agent_id)).toEqual([agentA]);
    expect(perfA.agents[0]!.accepted).toBe(1);
    expect(perfA.agents[0]!.dismissed).toBe(0);
    expect(perfA.summary.total_cost_usd).toBeCloseTo(0.1, 12);

    const perfB = await svc.performance(B.wsId, { days: 30 });
    expect(perfB.agents.map((r) => r.agent_id)).toEqual([agentB]);
    expect(perfB.agents[0]!.dismissed).toBe(2);
    expect(perfB.agents[0]!.accepted).toBe(0);
    expect(await svc.stats(A.wsId, agentB, { days: 30 })).toBeUndefined();
  });

  // ------------------------------------------------------------------ HTTP

  it('GET /agents/performance answers 200 (not the 422 the uuid IdParams would give) with cost_basis', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/agents/performance' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AgentPerf;
    expect(body.cost_basis).toBe('estimate');
    expect(body.window.days).toBe(30);
    await app.close();
  });

  it('AC-14/AC-25 over HTTP: the Stats agent equals the dashboard row for an explicit window', async () => {
    const app = await makeApp();
    const [ws] = await db().select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const a = await addAgent(ws!.id, `http-${Date.now()}`);
    await addRun(ws!.id, a, { ranAt: new Date('2020-05-05T12:00:00Z'), costUsd: 0.03 });
    const q = 'from=2020-05-01T00:00:00%2B03:00&to=2020-06-01T00:00:00%2B03:00';
    const perf = (await app.inject({ method: 'GET', url: `/agents/performance?${q}` })).json() as AgentPerf;
    const stats = (await app.inject({ method: 'GET', url: `/agents/${a}/stats?${q}` })).json() as AgentStats;
    expect(stats.cost_basis).toBe('estimate');
    expect(stats.agent).toEqual(rowOf(perf, a));
    expect(stats.agent.runs).toBe(1);
    expect(stats.window.days).toBeNull();
    expect(stats.window.from).toBe('2020-04-30T21:00:00.000Z');
    await app.close();
  });

  it('AC-16: each of the six invalid windows answers 422 on both endpoints', async () => {
    const app = await makeApp();
    const [ws] = await db().select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const a = await addAgent(ws!.id, `v-${Date.now()}`);
    const F = '2026-01-01T00:00:00Z';
    const T = '2026-02-01T00:00:00Z';
    const queries = [
      'days=7',
      `days=1&from=${F}&to=${T}`,
      `from=${F}`,
      'from=garbage&to=2026-02-01T00:00:00Z',
      `from=${T}&to=${F}`,
      'from=2026-01-01T00:00:00Z&to=2027-01-02T00:00:00.001Z', // 366 d + 1 ms
    ];
    for (const q of queries) {
      for (const url of [`/agents/performance?${q}`, `/agents/${a}/stats?${q}`]) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode, url).toBe(422);
      }
    }
    // `+` percent-encoded as %2B is a valid offset.
    const ok = await app.inject({
      method: 'GET',
      url: '/agents/performance?from=2026-10-01T00:00:00%2B03:00&to=2026-10-08T00:00:00%2B03:00',
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it('AC-27: an unknown agent and another workspace agent answer the identical 404', async () => {
    const app = await makeApp();
    const other = await freshWorkspace();
    const foreign = await addAgent(other.wsId, 'Foreign');
    const unknown = '00000000-0000-4000-8000-000000000000';
    const r1 = await app.inject({ method: 'GET', url: `/agents/${unknown}/stats` });
    const r2 = await app.inject({ method: 'GET', url: `/agents/${foreign}/stats` });
    expect(r1.statusCode).toBe(404);
    expect(r2.statusCode).toBe(404);
    expect(r2.body).toBe(r1.body);
    await app.close();
  });

  it('AC-28: no LLM call, no job, no write — counts and max(ran_at) unchanged', async () => {
    const llm = {
      id: 'openrouter',
      listModels: vi.fn(),
      complete: vi.fn(),
      completeStructured: vi.fn(),
      embed: vi.fn(),
    } as unknown as LLMProvider;
    const app = await makeApp({ llm: { openrouter: llm, openai: llm, anthropic: llm } });
    const enqueue = vi.spyOn(app.container.jobs, 'enqueue');
    const [ws] = await db().select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const a = await addAgent(ws!.id, `ro-${Date.now()}`);
    await addRun(ws!.id, a);

    const snapshot = async () => {
      const [r] = await db().execute(sql`
        select (select count(*) from agent_runs) as runs,
               (select count(*) from reviews) as reviews,
               (select count(*) from findings) as findings,
               (select max(ran_at) from agent_runs) as latest`);
      return JSON.stringify(r);
    };
    const before = await snapshot();
    for (const url of [
      '/agents/performance',
      '/agents/performance?days=1',
      '/agents/performance?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z',
      `/agents/${a}/stats`,
      `/agents/${a}/stats?days=1`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect(await snapshot()).toBe(before);
    expect(enqueue).not.toHaveBeenCalled();
    for (const fn of [llm.listModels, llm.complete, llm.completeStructured, llm.embed]) {
      expect(fn).not.toHaveBeenCalled();
    }
    await app.close();
  });
});
