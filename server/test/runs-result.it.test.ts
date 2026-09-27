import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

/**
 * `GET /runs/:id/result` (W1 / D2): a run's status, its PR, and its review
 * (or null while running/failed) from a bare run id. Covers the 4 cases the
 * plan names — a running run, a done run's review (ignoring a `kind='summary'`
 * row), cross-tenant 404 (IDOR guard), and findings scoped to the right
 * review when the same PR carries more than one.
 *
 * Every HTTP call goes through `LocalNoAuthProvider`, which always resolves
 * the single seeded default workspace (`server/src/adapters/auth/local.ts`) —
 * so the IDOR case is exercised by inserting a run under a SECOND, manually
 * created workspace and confirming the route (scoped to the default one)
 * cannot see it.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `runs-result-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 501 + repoSeq,
      title: 'Add caching layer',
      author: 'jamie.fox',
      branch: 'feat/cache',
      base: 'main',
      headSha: 'deadbeef',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('GET /runs/:id/result (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    return buildApp({ config: config(), db: pg.handle.db });
  }

  it('(a) a running run gives review:null', async () => {
    const app = await appWith();
    const { db } = pg.handle;
    const { repo, pr } = await setupRepoAndPr(db, workspaceId);
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'running' })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}/result` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.run.run_id).toBe(run!.id);
    expect(body.run.status).toBe('running');
    expect(body.pr).toEqual({
      id: pr.id,
      number: pr.number,
      repo_id: pr.repoId,
      repo_full_name: repo.fullName,
    });
    expect(body.review).toBeNull();

    await app.close();
  });

  it("(b) a done run gives its review with findings, ignoring a kind='summary' row for the same PR", async () => {
    const app = await appWith();
    const { db } = pg.handle;
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done' })
      .returning();

    // A summary row for the same PR/run — must be ignored (`kind='review'` only).
    await db.insert(t.reviews).values({
      workspaceId,
      prId: pr.id,
      agentId: null,
      runId: run!.id,
      kind: 'summary',
      verdict: null,
      summary: 'A one-line PR summary, not the review.',
      score: null,
      model: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: null,
        runId: run!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'Needs a fix.',
        score: 65,
        model: 'gpt-4.1',
        createdAt: new Date('2026-01-01T00:00:01Z'),
      })
      .returning();

    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/cache.ts',
      startLine: 10,
      endLine: 12,
      severity: 'WARNING',
      category: 'bug',
      title: 'Missing cache invalidation',
      rationale: 'The cache is never invalidated on write.',
      confidence: 0.8,
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}/result` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.review).not.toBeNull();
    expect(body.review.kind).toBe('review');
    expect(body.review.verdict).toBe('request_changes');
    expect(body.review.findings).toHaveLength(1);
    expect(body.review.findings[0].file).toBe('src/cache.ts');

    await app.close();
  });

  it("(c) another workspace's run id gives 404 — IDOR guard", async () => {
    const app = await appWith();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'runs-result-other' }).returning();
    const { pr } = await setupRepoAndPr(db, otherWs!.id);
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId: otherWs!.id, prId: pr.id, status: 'done' })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}/result` });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('not_found');

    // Sanity: a wholly unknown id also 404s.
    const unknown = await app.inject({ method: 'GET', url: `/runs/${randomUUID()}/result` });
    expect(unknown.statusCode).toBe(404);

    await app.close();
  });

  it('(d) findings of a different review on the same PR are not included', async () => {
    const app = await appWith();
    const { db } = pg.handle;
    const { pr } = await setupRepoAndPr(db, workspaceId);

    // An older run + review on the SAME PR, with its own finding.
    const [otherRun] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done' })
      .returning();
    const [otherReview] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: null,
        runId: otherRun!.id,
        kind: 'review',
        verdict: 'approve',
        summary: 'Fine.',
        score: 100,
        model: 'gpt-4.1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
      .returning();
    await db.insert(t.findings).values({
      reviewId: otherReview!.id,
      file: 'src/other.ts',
      startLine: 1,
      endLine: 1,
      severity: 'SUGGESTION',
      category: 'style',
      title: 'From a different review',
      rationale: "Must not leak into this run's result.",
      confidence: 0.5,
    });

    // The run under test, with its own review + finding.
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done' })
      .returning();
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: null,
        runId: run!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'Needs work.',
        score: 40,
        model: 'gpt-4.1',
        createdAt: new Date('2026-01-01T00:00:02Z'),
      })
      .returning();
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/this-one.ts',
      startLine: 3,
      endLine: 3,
      severity: 'CRITICAL',
      category: 'security',
      title: "This run's own finding",
      rationale: 'Belongs to this run only.',
      confidence: 0.9,
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}/result` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.review.findings).toHaveLength(1);
    expect(body.review.findings[0].file).toBe('src/this-one.ts');
    expect(body.review.findings.some((f: { file: string }) => f.file === 'src/other.ts')).toBe(false);

    await app.close();
  });
});
