import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

/**
 * GET /pulls/:id/smart-diff — reads persisted pr_files/reviews/findings only
 * (no LLM, no GitHub call). Covers: a summary review does not shadow a review
 * kind, only the newest review's findings show, cross-workspace 404, the
 * empty-review shape, and the HTTP response parses as SmartDiffResponse.
 */
d('GET /pulls/:id/smart-diff', () => {
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

  let repoSeq = 0;
  async function setupRepoAndPr(workspaceId: string) {
    const name = `smart-diff-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 999,
        title: 'Smart diff fixture',
        author: 'octocat',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 2,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/a.ts', additions: 2, deletions: 0, patch: null },
      { prId: pr!.id, path: 'README.md', additions: 0, deletions: 1, patch: null },
    ]);
    return { repo: repo!, pr: pr! };
  }

  async function insertReview(
    workspaceId: string,
    prId: string,
    kind: 'summary' | 'review',
    createdAt: Date,
    findings: { file: string; startLine: number }[] = [],
  ) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId: null,
        runId: null,
        kind,
        verdict: null,
        summary: null,
        score: null,
        model: null,
        createdAt,
      })
      .returning();
    if (findings.length > 0) {
      await pg.handle.db.insert(t.findings).values(
        findings.map((f) => ({
          reviewId: review!.id,
          file: f.file,
          startLine: f.startLine,
          endLine: f.startLine,
          severity: 'WARNING',
          category: 'bug',
          title: 'x',
          rationale: 'x',
          confidence: 0.5,
        })),
      );
    }
    return review!;
  }

  it('(i) a summary review inserted AFTER a review review does not shadow it', async () => {
    const app = await makeApp();
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const { pr } = await setupRepoAndPr(workspaceId);

    await insertReview(workspaceId, pr.id, 'review', new Date('2026-01-01T00:00:00Z'), [
      { file: 'src/a.ts', startLine: 1 },
    ]);
    await insertReview(workspaceId, pr.id, 'summary', new Date('2026-01-02T00:00:00Z'));

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    expect(core.files.find((f: { path: string }) => f.path === 'src/a.ts').finding_lines).toEqual([1]);
    await app.close();
  });

  it('(ii) only the newest of two review rows shows its findings', async () => {
    const app = await makeApp();
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const { pr } = await setupRepoAndPr(workspaceId);

    await insertReview(workspaceId, pr.id, 'review', new Date('2026-01-01T00:00:00Z'), [
      { file: 'src/a.ts', startLine: 1 },
    ]);
    await insertReview(workspaceId, pr.id, 'review', new Date('2026-01-03T00:00:00Z'), [
      { file: 'src/a.ts', startLine: 2 },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    const body = res.json();
    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    expect(core.files.find((f: { path: string }) => f.path === 'src/a.ts').finding_lines).toEqual([2]);
    await app.close();
  });

  it('(iii) a PR in workspace B requested from workspace A returns 404', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-smart-diff' })
      .returning();
    // The PR belongs to otherWs; the request is resolved under the seeded
    // default workspace (LocalNoAuthProvider always resolves to it).
    const { pr } = await setupRepoAndPr(otherWs!.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('(iv) a PR with no review returns five groups with empty finding_lines', async () => {
    const app = await makeApp();
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const { pr } = await setupRepoAndPr(workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);
    for (const g of body.groups as { files: { finding_lines: number[] }[] }[]) {
      for (const f of g.files) expect(f.finding_lines).toEqual([]);
    }
    await app.close();
  });

  it('(v) the HTTP response is 200 and parses as SmartDiffResponse', async () => {
    const app = await makeApp();
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const { pr } = await setupRepoAndPr(workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    expect(() => SmartDiffResponse.parse(res.json())).not.toThrow();
    await app.close();
  });
});
