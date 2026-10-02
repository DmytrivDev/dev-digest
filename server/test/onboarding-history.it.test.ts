/**
 * Onboarding Tour (SPEC-02), history and clone safety against REAL git and a real Postgres.
 *
 * The origin is a local repository with three dated commits; every test gets its own
 * `--depth 1` clone of it under `<cloneDir>/acme/<name>` (through a `file:///` URL — a
 * plain path ignores `--depth`) and the real `SimpleGitClient` and `RepoIntelService`
 * read it. What is asserted: the history window is fetched into a shallow clone and
 * changes the reading order (AC-56), the clone is left exactly as it was (AC-24), no job
 * is enqueued (AC-25), the index facts come from the latest indexed commit (AC-26), the
 * branch is the clone's (AC-32), an unreachable origin degrades to PageRank order
 * (AC-57), no credential is written (AC-58), the rank other features read is untouched
 * (AC-59), and the whole request is bounded when both the origin and the model hang (NFR-1).
 *
 * Rank fixture: pagerank a=0.27, b=0.30, c=0.39. History: C1 (root) touches a, b, c;
 * C2 touches a, b; C3 touches a. With all three counted hotness is a=1, b=2/3, c=1/3 and the
 * reading order is [a, c, b]; with no history it is the PageRank order [c, b, a]; with
 * only C1 and C2 reachable it is [b, c, a]. Each scenario below lands on a different order,
 * so an order that is right proves WHICH commits were counted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import type { GitClient, LLMProvider, OnboardingTour } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { FakeIntel, StubLlm, git, indexedState } from './helpers/onboarding.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding-history] Docker not available — skipping integration tests.');
}

const TOKEN = 'tok-SECRET-123';
const PAGERANK: Record<string, number> = { 'src/a.ts': 0.27, 'src/b.ts': 0.3, 'src/c.ts': 0.39 };
const PATHS = Object.keys(PAGERANK);
const HOT_ORDER = ['src/a.ts', 'src/c.ts', 'src/b.ts']; // all three commits counted
const PAGERANK_ORDER = ['src/c.ts', 'src/b.ts', 'src/a.ts']; // no history
const C2_ORDER = ['src/b.ts', 'src/c.ts', 'src/a.ts']; // only C1 and C2 reachable

const readingOrder = (tour: OnboardingTour): string[] => {
  const section = tour.sections.find((s) => s.kind === 'guided_reading');
  if (!section || section.kind !== 'guided_reading') throw new Error('no guided_reading section');
  return section.items.map((i) => i.path);
};

d('onboarding tour — history, clone safety, rank isolation', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let cloneRoot: string;
  let originUrl: string;
  let shas: string[]; // [C1, C2, C3]
  let seq = 0;

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  async function commit(origin: string, files: Record<string, string>, date: string) {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(join(origin, path, '..'), { recursive: true });
      await writeFile(join(origin, path), text);
    }
    git(origin, ['add', '-A']);
    git(origin, ['commit', '-q', '-m', `commit ${date}`], date);
    return git(origin, ['rev-parse', 'HEAD']);
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    base = await mkdtemp(join(tmpdir(), 'devdigest-onboarding-hist-'));
    cloneRoot = join(base, 'clones');
    const origin = join(base, 'origin');
    await mkdir(origin, { recursive: true });
    originUrl = pathToFileURL(origin).href;
    // `master` on purpose: the repo row says `main` (AC-32).
    git(origin, ['init', '-q', '-b', 'master']);
    shas = [
      await commit(
        origin,
        {
          'package.json': JSON.stringify({ name: 'hist', scripts: { dev: 'node src/a.js' } }),
          'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
          'src/b.ts': "import { c } from './c';\nexport const b = c;\n",
          'src/c.ts': 'export const c = 1;\n',
        },
        '2026-07-01T00:00:00Z',
      ),
      await commit(
        origin,
        {
          'src/a.ts': "import { b } from './b';\nexport const a = b + 1;\n",
          'src/b.ts': "import { c } from './c';\nexport const b = c + 1;\n",
        },
        '2026-08-01T00:00:00Z',
      ),
      await commit(
        origin,
        { 'src/a.ts': "import { b } from './b';\nexport const a = b + 2;\n" },
        '2026-09-01T00:00:00Z',
      ),
    ];
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  /** A repo row plus its own depth-1 clone of the origin, indexed at `sha` with the rank fixture. */
  async function makeIndexedRepo(sha: string = shas[2]!) {
    const name = `hist-${seq++}`;
    const clone = join(cloneRoot, 'acme', name);
    await mkdir(join(cloneRoot, 'acme'), { recursive: true });
    git(base, ['clone', '-q', '--depth', '1', '--branch', 'master', originUrl, clone]);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: clone,
        // defaultBranch stays at its schema default, 'main'
      })
      .returning();
    const db = pg.handle.db;
    await db.insert(t.repoIndexState).values({
      repoId: repo!.id,
      lastIndexedSha: sha,
      indexerVersion: 1,
      status: 'full',
      filesIndexed: PATHS.length,
    });
    await db.insert(t.fileRank).values(
      PATHS.map((filePath, i) => ({
        repoId: repo!.id,
        filePath,
        pagerank: PAGERANK[filePath]!,
        hotness: 0,
        rank: PAGERANK[filePath]!,
        percentile: 33 * (i + 1),
      })),
    );
    await db.insert(t.fileEdges).values([
      { repoId: repo!.id, fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { repoId: repo!.id, fromFile: 'src/b.ts', toFile: 'src/c.ts' },
    ]);
    return { repo: repo!, clone, name };
  }

  /** The real repo-intel facade over the seeded rows, and the real git adapter. */
  function realDeps(tokenProvider?: () => Promise<string | undefined>) {
    const gitClient = new SimpleGitClient(cloneRoot, tokenProvider);
    const container = new Container(config(), pg.handle.db, { git: gitClient });
    return { gitClient, intel: new RepoIntelService(container) as RepoIntel };
  }

  /** No model: the tour is a skeleton, so the reading path shows the rank order itself. */
  function makeService(opts: {
    git: GitClient;
    intel: RepoIntel | FakeIntel;
    llm?: LLMProvider | null;
    historyTimeoutMs?: number;
    modelDeadlineMs?: number;
  }) {
    return new OnboardingService({
      repo: new OnboardingRepository(pg.handle.db),
      git: opts.git,
      repoIntel: opts.intel as RepoIntel,
      repoIntelEnabled: true,
      resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
      llm: async () => opts.llm ?? null,
      systemPrompt: async () => 'You write onboarding tours.',
      log: { info: () => {} },
      inFlight: new Set<string>(),
      historyTimeoutMs: opts.historyTimeoutMs,
      modelDeadlineMs: opts.modelDeadlineMs,
    });
  }

  const generated = async (run: Promise<{ tour: OnboardingTour | null } | undefined>) => {
    const res = await run;
    expect(res?.tour).toBeTruthy();
    return res!.tour!;
  };
  const jobCount = async () => (await pg.handle.db.select().from(t.jobs)).length;
  const commitsIn = (clone: string) => Number(git(clone, ['rev-list', '--count', 'HEAD']));

  // ---- AC-56, AC-24, AC-25, AC-32 -----------------------------------------------------------

  it('AC-56, AC-24, AC-25, AC-32: a depth-1 clone gets its window fetched and is otherwise left alone', async () => {
    const { repo, clone } = await makeIndexedRepo();
    const { gitClient, intel } = realDeps();
    const service = makeService({ git: gitClient, intel });

    expect(commitsIn(clone)).toBe(1); // precondition: really shallow
    const headBefore = git(clone, ['rev-parse', 'HEAD']);
    const fileBefore = await readFile(join(clone, 'src/a.ts'), 'utf8');
    const jobsBefore = await jobCount();

    const tour = await generated(service.generate(workspaceId, repo.id));

    // AC-56: all three commits of the window were counted — only that order puts a first, c second.
    expect(commitsIn(clone)).toBe(3);
    expect(tour.reasons).not.toContain('no_history');
    expect(readingOrder(tour)).toEqual(HOT_ORDER);

    // AC-24: same commit, same bytes, clean tree.
    expect(git(clone, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(await readFile(join(clone, 'src/a.ts'), 'utf8')).toBe(fileBefore);
    expect(git(clone, ['status', '--porcelain'])).toBe('');

    // AC-25: no clone / index / refresh / resync job was enqueued.
    expect(await jobCount()).toBe(jobsBefore);

    // AC-32: the clone's branch, not repos.default_branch.
    expect(repo.defaultBranch).toBe('main');
    expect(tour.branch).toBe('master');
  });

  // ---- AC-26 ---------------------------------------------------------------------------------

  it('AC-26: after the index moves to another commit the next tour stores that commit and counts up to it', async () => {
    const { repo } = await makeIndexedRepo(shas[2]!);
    const { gitClient, intel } = realDeps();
    const service = makeService({ git: gitClient, intel });

    const first = await generated(service.generate(workspaceId, repo.id)); // fetches the history
    expect(first.indexed_sha).toBe(shas[2]);
    expect(readingOrder(first)).toEqual(HOT_ORDER);

    await pg.handle.db
      .update(t.repoIndexState)
      .set({ lastIndexedSha: shas[1]! })
      .where(eq(t.repoIndexState.repoId, repo.id));

    const second = await generated(service.generate(workspaceId, repo.id));
    expect(second.indexed_sha).toBe(shas[1]);
    // C3 is not reachable from C2, so a is touched twice, not three times.
    expect(readingOrder(second)).toEqual(C2_ORDER);
  });

  // ---- AC-57 ---------------------------------------------------------------------------------

  it('AC-57: an unreachable origin gives no_history and a reading path in pure PageRank order', async () => {
    const { repo, clone } = await makeIndexedRepo();
    git(clone, ['remote', 'set-url', 'origin', pathToFileURL(join(base, 'does-not-exist')).href]);
    const { gitClient, intel } = realDeps();

    const tour = await generated(makeService({ git: gitClient, intel }).generate(workspaceId, repo.id));

    expect(tour.reasons).toContain('no_history');
    expect(readingOrder(tour)).toEqual(PAGERANK_ORDER);
    expect(commitsIn(clone)).toBe(1); // nothing was fetched
  });

  // ---- AC-58 ---------------------------------------------------------------------------------

  it('AC-58: a history fetch with a token configured writes no credential into the clone', async () => {
    const { repo, clone } = await makeIndexedRepo();
    const { gitClient, intel } = realDeps(async () => TOKEN);

    const tour = await generated(makeService({ git: gitClient, intel }).generate(workspaceId, repo.id));
    expect(commitsIn(clone)).toBe(3); // the fetch really ran

    const config = await readFile(join(clone, '.git', 'config'), 'utf8');
    expect(config).not.toContain(TOKEN);
    expect(config).not.toContain(Buffer.from(`x-access-token:${TOKEN}`).toString('base64'));
    expect(config).not.toContain('extraHeader');
    expect(git(clone, ['config', '--get', 'remote.origin.url'])).not.toContain(TOKEN);
    expect(JSON.stringify(tour)).not.toContain(TOKEN);
  });

  it('AC-58: a credential an older clone left in remote.origin.url is scrubbed, not kept, by the history fetch', async () => {
    const { repo, clone } = await makeIndexedRepo();
    // Nothing listens on port 1: the fetch fails at once, after the scrub has run.
    git(clone, [
      'remote',
      'set-url',
      'origin',
      `http://x-access-token:${TOKEN}@127.0.0.1:1/acme/app.git`,
    ]);
    expect(git(clone, ['config', '--get', 'remote.origin.url'])).toContain(TOKEN); // precondition
    const { gitClient, intel } = realDeps(async () => TOKEN);

    const tour = await generated(makeService({ git: gitClient, intel }).generate(workspaceId, repo.id));

    expect(tour.reasons).toContain('no_history');
    expect(git(clone, ['config', '--get', 'remote.origin.url'])).not.toContain(TOKEN);
    expect(await readFile(join(clone, '.git', 'config'), 'utf8')).not.toContain(TOKEN);
  });

  // ---- AC-59 ---------------------------------------------------------------------------------

  it('AC-59: generating a tour leaves the file rank every other feature reads exactly as it was', async () => {
    const { repo } = await makeIndexedRepo();
    const { gitClient, intel } = realDeps();
    const rankRows = async () =>
      (await pg.handle.db.select().from(t.fileRank).where(eq(t.fileRank.repoId, repo.id))).sort(
        (x, y) => (x.filePath < y.filePath ? -1 : 1),
      );
    const percentiles = async () =>
      (await intel.getFileRank(repo.id, PATHS)).sort((x, y) => (x.path < y.path ? -1 : 1));

    const rowsBefore = await rankRows();
    const percentilesBefore = await percentiles();
    expect(percentilesBefore).toHaveLength(PATHS.length);

    const tour = await generated(makeService({ git: gitClient, intel }).generate(workspaceId, repo.id));
    expect(readingOrder(tour)).toEqual(HOT_ORDER); // hotness WAS applied to the tour...

    // ...and none of it leaked into what the rest of the app reads.
    expect(await percentiles()).toEqual(percentilesBefore);
    expect(await rankRows()).toEqual(rowsBefore);
  });

  // ---- NFR-1 ---------------------------------------------------------------------------------

  it('NFR-1: with a model that never answers and an origin that never responds, generate returns within the bound', async () => {
    // Real deadlines are 30 s (history) + 120 s (model) inside a 180 s bound; scaled alike.
    const HISTORY_MS = 300;
    const MODEL_MS = 600;
    const BOUND_MS = 1500;
    const sha = 'abc123';
    const name = `nfr-${seq++}`;
    const repo = (
      await pg.handle.db
        .insert(t.repos)
        .values({
          workspaceId,
          owner: 'acme',
          name,
          fullName: `acme/${name}`,
          clonePath: `/mock/clones/acme/${name}`,
        })
        .returning()
    )[0]!;
    const intel = new FakeIntel();
    intel.state = indexedState(sha);
    intel.snapshot = {
      files: PATHS.map((path) => ({ path, pagerank: PAGERANK[path]! })),
      edges: [{ from: 'src/a.ts', to: 'src/b.ts' }],
      endpoints: [],
    };
    // A shallow boundary inside the window forces the history fetch, which then never settles.
    const mock = new MockGitClient({
      docs: { 'src/a.ts': '', 'src/b.ts': '', 'src/c.ts': '' },
      commitDates: { [sha]: '2026-09-01T00:00:00Z' },
      touches: [{ sha, committedAt: '2026-09-01T00:00:00Z', parents: [], boundary: true, files: [] }],
      historyFetch: 'hang',
    });
    const model = new StubLlm();
    model.hang();
    const service = makeService({
      git: mock,
      intel,
      llm: model,
      historyTimeoutMs: HISTORY_MS,
      modelDeadlineMs: MODEL_MS,
    });

    const started = performance.now();
    const tour = await generated(service.generate(workspaceId, repo.id));
    const elapsed = performance.now() - started;

    // Both hangs were entered, and each was cut by its own deadline.
    expect(mock.historyFetches).toHaveLength(1);
    expect(model.calls).toHaveLength(1);
    expect(tour.status).toBe('skeleton');
    expect([...tour.reasons].sort()).toEqual(['llm_timeout', 'no_history']);
    // Sequential deadlines add up (so neither was skipped) and stay inside the scaled bound.
    expect(elapsed).toBeGreaterThanOrEqual(HISTORY_MS + MODEL_MS - 50);
    expect(elapsed).toBeLessThan(BOUND_MS);
  });
});
