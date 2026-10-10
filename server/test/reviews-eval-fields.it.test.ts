import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[reviews-eval-fields] Docker not available — skipping integration tests.');
}

const PATCH = ['@@ -1,2 +1,3 @@', ' const a = 1;', "+const k = 'sk_live_xxx';", ' const b = 2;'].join('\n');

/**
 * SPEC-04 AC-25: `GET /pulls/:id/reviews` carries `eval_case_id` and
 * `eval_ineligible_reason` on every finding, so the client can decide the "Turn into
 * eval case" button from one response.
 */
d('GET /pulls/:id/reviews eval fields (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('reports the case id or the reason per finding', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const agents = new AgentsRepository(db);
    const live = await agents.insert({
      workspaceId,
      name: 'Live agent',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'p',
    });

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'rev-eval', fullName: 'acme/rev-eval' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', patch: PATCH });

    async function review(agentId: string | null) {
      const [r] = await db
        .insert(t.reviews)
        .values({
          workspaceId,
          prId: pr!.id,
          agentId,
          kind: 'review',
          verdict: 'comment',
          summary: 's',
          score: 80,
          model: 'm',
        })
        .returning();
      return r!.id;
    }
    async function finding(reviewId: string, title: string, triaged: boolean) {
      const [f] = await db
        .insert(t.findings)
        .values({
          reviewId,
          file: 'src/a.ts',
          startLine: 2,
          endLine: 2,
          severity: 'WARNING',
          category: 'bug',
          title,
          rationale: 'r',
          confidence: 0.8,
          acceptedAt: triaged ? new Date() : null,
        })
        .returning();
      return f!.id;
    }

    const liveReview = await review(live.id);
    const triagedUncased = await finding(liveReview, 'triaged-uncased', true);
    const untriaged = await finding(liveReview, 'untriaged', false);
    const cased = await finding(liveReview, 'cased', true);
    const noAgentReview = await review(null);
    const noAgent = await finding(noAgentReview, 'no-agent', true);
    // `reviews.agent_id` has no FK: an id nobody owns stands for a deleted agent.
    const goneReview = await review(randomUUID());
    const agentGone = await finding(goneReview, 'agent-gone', true);

    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: `/findings/${cased}/eval-case` });
    expect(created.statusCode).toBe(201);
    const caseId = created.json().id as string;

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/reviews` });
    expect(res.statusCode).toBe(200);
    const byId = new Map<string, { eval_case_id: unknown; eval_ineligible_reason: unknown }>();
    for (const r of res.json() as { findings: { id: string }[] }[]) {
      for (const f of r.findings) byId.set(f.id, f as never);
    }

    const pick = (id: string) => {
      const f = byId.get(id)!;
      return { eval_case_id: f.eval_case_id, eval_ineligible_reason: f.eval_ineligible_reason };
    };
    expect(pick(triagedUncased)).toEqual({ eval_case_id: null, eval_ineligible_reason: null });
    expect(pick(untriaged)).toEqual({ eval_case_id: null, eval_ineligible_reason: 'not_triaged' });
    expect(pick(cased)).toEqual({ eval_case_id: caseId, eval_ineligible_reason: null });
    expect(pick(noAgent)).toEqual({
      eval_case_id: null,
      eval_ineligible_reason: 'not_agent_finding',
    });
    expect(pick(agentGone)).toEqual({
      eval_case_id: null,
      eval_ineligible_reason: 'agent_missing',
    });
    await app.close();
  });

  it('an empty PR (no reviews) still answers an empty list', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'rev-eval-empty', fullName: 'acme/rev-eval-empty' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 2,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/reviews` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });
});
