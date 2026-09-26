import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast] Docker not available — skipping integration tests.');
}

function stubRepoIntel(): RepoIntel {
  return {
    async indexRepo() {
      return { status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
    },
    async refreshIndex() {
      return { status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
    },
    async getIndexState() {
      return {
        repoId: 'r',
        status: 'full',
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 1,
        lastIndexedSha: 'sha1',
        indexerVersion: 1,
        updatedAt: new Date(0),
      };
    },
    async getBlastRadius(_repoId: string, changedFiles: string[]) {
      return {
        changedSymbols: changedFiles.map((f) => ({ file: f, name: 'sym', kind: 'function' })),
        callers: [],
        impactedEndpoints: [],
        degraded: false,
      };
    },
    async getRepoMap() {
      return { text: '', tokens: 0, cached: false };
    },
    async getFileRank() {
      return [];
    },
    async getSymbolsInFiles() {
      return [];
    },
    async getCallerSignatures() {
      return [];
    },
    async getUnresolvedReferences() {
      return [];
    },
    async getConventionSamples() {
      return [];
    },
    async getTopFilesByRank() {
      return [];
    },
    async getCriticalPaths() {
      return [];
    },
  };
}

/**
 * GET /pulls/:id/blast — reads persisted `pr_files` (or falls back to one
 * GitHub call), always calling `repoIntel.getBlastRadius` exactly once.
 */
d('GET /pulls/:id/blast', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(githubOpts: ConstructorParameters<typeof MockGitHubClient>[0] = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient({
          detail: {
            files: [{ path: 'src/mock-file.ts', additions: 1, deletions: 0 }],
          },
          ...githubOpts,
        }),
        repoIntel: stubRepoIntel(),
      },
    });
  }

  let repoSeq = 0;
  async function setupRepoAndPr(workspaceId: string, withFiles: boolean) {
    const name = `blast-${repoSeq++}`;
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
        title: 'Blast fixture',
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
    if (withFiles) {
      await pg.handle.db.insert(t.prFiles).values([
        { prId: pr!.id, path: 'src/a.ts', additions: 2, deletions: 0, patch: null },
      ]);
    }
    return { repo: repo!, pr: pr! };
  }

  it('200 + schema-valid body for a seeded PR with pr_files', async () => {
    const app = await makeApp();
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const { pr } = await setupRepoAndPr(workspaceId, true);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    expect(() => BlastRadius.parse(res.json())).not.toThrow();
    await app.close();
  });

  it('a PR with no pr_files → the stub receives the mock GitHub client\'s file paths', async () => {
    const app = await makeApp();
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const { pr } = await setupRepoAndPr(workspaceId, false);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.changed_symbols.map((s: { file: string }) => s.file)).toContain(
      'src/mock-file.ts',
    );
    await app.close();
  });

  it('a PR id from another workspace → 404', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-blast' })
      .returning();
    const { pr } = await setupRepoAndPr(otherWs!.id, true);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

d('GET /pulls/:id/history', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(githubOpts: ConstructorParameters<typeof MockGitHubClient>[0] = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(githubOpts),
        repoIntel: stubRepoIntel(),
      },
    });
  }

  let repoSeq = 0;
  async function setupRepoAndPr(workspaceId: string) {
    const name = `blast-history-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 998,
        title: 'History fixture',
        author: 'octocat',
        branch: 'feat/y',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/a.ts', additions: 1, deletions: 0, patch: null },
    ]);
    return { repo: repo!, pr: pr! };
  }

  it('200 + schema-valid with a MockGitHubClient({ pathPulls }) stub', async () => {
    const app = await makeApp({
      pathPulls: {
        'src/a.ts': [
          { number: 5, title: 'Earlier PR', author: 'octocat', merged_at: '2026-01-01T00:00:00Z' },
        ],
      },
    });
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const { pr } = await setupRepoAndPr(ws!.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(200);
    expect(() => PrHistory.parse(res.json())).not.toThrow();
    const body = res.json() as PrHistory;
    expect(body.history.map((h) => h.pr_number)).toContain(5);
    await app.close();
  });
});
