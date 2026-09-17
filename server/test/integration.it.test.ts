import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integration] Docker not available — skipping Testcontainers integration tests.',
  );
}

d('Testcontainers: pg + pgvector', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('migrations applied: every table exists', async () => {
    const rows = await pg.handle.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM information_schema.tables
      WHERE table_schema = 'public'`;
    // 35 domain tables + drizzle migration bookkeeping
    expect(rows[0]!.count).toBeGreaterThanOrEqual(35);
  });

  it('pgvector extension is enabled', async () => {
    const rows = await pg.handle.sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    expect(rows).toHaveLength(1);
  });

  it('vector insert + similarity query round-trips', async () => {
    const { db } = pg.handle;
    const { workspaceId } = await seed(db);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'v', name: 'vec', fullName: 'v/vec' })
      .returning();
    const vec = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    await db.insert(t.codeChunks).values({
      workspaceId,
      repoId: repo!.id,
      path: 'a.ts',
      content: 'hello',
      embedding: vec,
      source: 'code',
    });
    // cosine distance query against the same vector → distance ~0
    const literal = `[${vec.join(',')}]`;
    const rows = await pg.handle.sql<{ dist: number }[]>`
      SELECT embedding <=> ${literal}::vector AS dist
      FROM code_chunks WHERE repo_id = ${repo!.id}`;
    expect(rows[0]!.dist).toBeLessThan(0.0001);
  });

  it('seed is idempotent (re-run does not duplicate workspace)', async () => {
    await seed(pg.handle.db);
    await seed(pg.handle.db);
    const ws = await pg.handle.db.select().from(t.workspaces);
    expect(ws.filter((w) => w.name === 'default')).toHaveLength(1);
  });
});

d('Testcontainers: DB-backed routes via app.inject', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('POST /repos persists + enqueues a clone (mock git) and GET /repos lists it', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const git = new MockGitClient();
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git, github: new MockGitHubClient() },
    });

    const create = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/acme/widgets' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().full_name).toBe('acme/widgets');

    await app.container.jobs.onIdle();
    expect(git.cloned.some((c) => c.repo.name === 'widgets')).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/repos' });
    expect(list.json().some((r: { full_name: string }) => r.full_name === 'acme/widgets')).toBe(
      true,
    );
    await app.close();
  });

  it('GET /repos/:id/pulls imports PRs (mock GitHub) idempotently', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repos = await app.inject({ method: 'GET', url: '/repos' });
    const repoId = repos.json()[0]!.id;

    const first = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(first.statusCode).toBe(200);
    expect(first.json().length).toBeGreaterThan(0);
    // import again → still idempotent (unique repo_id+number)
    const second = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(second.json().length).toBe(first.json().length);
    await app.close();
  });

  it('GET /repos/:id/pulls serializes cost_usd = the sum of all successful runs', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repoId = (await app.inject({ method: 'GET', url: '/repos' })).json()[0]!.id;
    const before = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const target = before.json()[0]!;
    // No priced run yet → the key is present and null ("—" in the UI, not "$0.00").
    expect(target).toHaveProperty('cost_usd');
    expect(target.cost_usd).toBeNull();

    const [pull] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, target.id));
    const now = Date.now();
    const run = (msAgo: number, costUsd: number | null, status = 'done') => ({
      workspaceId: pull!.workspaceId,
      prId: pull!.id,
      ranAt: new Date(now - msAgo),
      status,
      costUsd,
      tokensIn: 100,
      tokensOut: 10,
    });
    await pg.handle.db.insert(t.agentRuns).values([
      run(0, 0.0013),                  // this review: three agents fanned out
      run(20_000, 0.0014),
      run(40_000, 0.0012),
      run(600_000, 0.002),             // an earlier review — counted too
      run(1_000, null),                // un-priced run — contributes nothing
      run(2_000, 99, 'failed'),        // failed run — never counted
    ]);

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const priced = after.json().find((p: { id: string }) => p.id === target.id)!;
    expect(priced.cost_usd).toBeCloseTo(0.0059, 6);
    await app.close();
  });

  it("GET /repos/:id/pulls serializes the LATEST review's findings breakdown", async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repoId = (await app.inject({ method: 'GET', url: '/repos' })).json()[0]!.id;
    const before = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    // The seeded review on PR #482 found 1 CRITICAL + 1 WARNING and no SUGGESTION.
    const seeded = before.json().find((p: { number: number }) => p.number === 482)!;
    expect(seeded.findings).toEqual({ critical: 1, warning: 1, suggestion: 0 });

    const [pull] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, seeded.id));

    // A PR nobody has reviewed serializes null — "—" in the UI, NOT a row of zeros.
    await pg.handle.db.insert(t.pullRequests).values({
      workspaceId: pull!.workspaceId,
      repoId: pull!.repoId,
      number: 999,
      title: 'Never reviewed',
      author: 'deepak.r',
      branch: 'chore/noop',
      base: 'main',
      headSha: 'deadbee',
    });
    const withUnreviewed = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const unreviewed = withUnreviewed.json().find((p: { number: number }) => p.number === 999)!;
    expect(unreviewed).toHaveProperty('findings');
    expect(unreviewed.findings).toBeNull();

    // A NEWER review REPLACES the breakdown — unlike cost_usd, it is not a running total.
    const [newer] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId: pull!.workspaceId,
        prId: pull!.id,
        kind: 'review',
        verdict: 'comment',
        score: 80,
        model: 'test',
        createdAt: new Date(Date.now() + 60_000),
      })
      .returning();
    await pg.handle.db.insert(t.findings).values(
      ['SUGGESTION', 'SUGGESTION'].map((severity, i) => ({
        reviewId: newer!.id,
        file: 'src/util/time.ts',
        startLine: 8 + i,
        endLine: 8 + i,
        severity,
        category: 'style',
        title: `Extract magic number ${i}`,
        rationale: 'Unexplained constant repeated twice.',
        confidence: 0.62,
      })),
    );

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const rereviewed = after.json().find((p: { number: number }) => p.number === 482)!;
    expect(rereviewed.findings).toEqual({ critical: 0, warning: 0, suggestion: 2 });
    await app.close();
  });

  it('POST /repos/:id/poll syncs PR list and does NOT trigger a review', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repoId = (await app.inject({ method: 'GET', url: '/repos' })).json()[0]!.id;
    const poll = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(poll.json().reviewTriggered).toBe(false);
    expect(poll.json().synced).toBeGreaterThan(0);
    await app.close();
  });
});
