/**
 * Onboarding Tour (SPEC-02), core routes against a real Postgres and a real git clone.
 *
 * Covers what no unit test can: readiness from a real clone directory (AC-5, AC-6), the
 * 409 refusals that happen before any model call (AC-13, AC-14, AC-15), the in-flight
 * flag (AC-19), the per-workspace 429 (AC-16), one stored row per repo (AC-20), and
 * tenancy (AC-105). The degradation / failure / usage matrix is the other integration file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { LLMProvider, OnboardingTourResponse, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import type { GraphSnapshot, IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

// ---- A tiny real repository: one commit, three TypeScript files -------------------------

const FIXTURE_FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'tour-fixture',
    scripts: { dev: 'node src/a.js', test: 'vitest' },
    dependencies: { zod: '^3.0.0' },
  }),
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  '.env.example': 'STRIPE_KEY=sk_live_abc\n',
  'README.md': '# Tour fixture\n\nA small repository for the onboarding tour tests.\n',
  'src/a.ts': "import { b } from './b';\nimport { c } from './c';\nexport const a = b + c;\n",
  'src/b.ts': "import { c } from './c';\nexport const b = c + 1;\n",
  'src/c.ts': 'export const c = 1;\n',
};

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_AUTHOR_DATE: '2026-06-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-06-01T00:00:00Z',
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

// ---- Test doubles ---------------------------------------------------------------------------

const MODEL_FIXTURE = {
  architecture: {
    body: 'A tiny TypeScript package: `a` uses `b` and `c`.',
    diagram: 'flowchart LR\n  A["a"] --> B["b"]\n  B --> C["c"]',
  },
  critical_paths: [{ path: 'src/c.ts', reason: 'Imported by both other files.' }],
  reading_path: [{ path: 'src/c.ts', why: 'The leaf everything depends on.' }],
  run_steps: [
    { command: 'pnpm install', note: null },
    { command: 'pnpm run dev', note: 'Starts the app.' },
  ],
  first_tasks: [{ title: 'Document c', scope: 'src/c.ts', complexity: 'Low' }],
};

/** Records every structured call; can be held open until `release()`. */
class StubLlm implements LLMProvider {
  readonly id = 'openrouter' as const;
  calls: StructuredRequest<unknown>[] = [];
  private gate: { promise: Promise<void>; open: () => void } | null = null;

  hold(): void {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    this.gate = { promise, open };
  }
  release(): void {
    this.gate?.open();
    this.gate = null;
  }
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('complete is not used by the tour');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    await this.gate?.promise;
    return {
      data: MODEL_FIXTURE as unknown as T,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.002,
      raw: JSON.stringify(MODEL_FIXTURE),
      attempts: 1,
    };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

/** A repo-intel facade whose index state and graph the test can set. */
class FakeIntel {
  state!: IndexState;
  snapshot: GraphSnapshot = { files: [], edges: [], endpoints: [] };
  async getIndexState() {
    return this.state;
  }
  async getGraphSnapshot() {
    return this.snapshot;
  }
}

const indexedState = (sha: string): IndexState => ({
  repoId: 'fake',
  status: 'full',
  filesIndexed: 3,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: sha,
  indexerVersion: 1,
  updatedAt: new Date(),
  walkTotal: null,
});

const neverIndexed = (): IndexState => ({
  repoId: 'fake',
  status: 'degraded',
  filesIndexed: 0,
  filesSkipped: 0,
  durationMs: 0,
  reason: 'no_data',
  lastIndexedSha: '',
  indexerVersion: 1,
  updatedAt: new Date(0),
  degraded: true,
  degradedReason: 'no_data',
});

const GRAPH: GraphSnapshot = {
  files: [
    { path: 'src/a.ts', pagerank: 0.2 },
    { path: 'src/b.ts', pagerank: 0.3 },
    { path: 'src/c.ts', pagerank: 0.5 },
  ],
  edges: [
    { from: 'src/a.ts', to: 'src/b.ts' },
    { from: 'src/a.ts', to: 'src/c.ts' },
    { from: 'src/b.ts', to: 'src/c.ts' },
  ],
  endpoints: [],
};

async function waitFor(cond: () => boolean, label: string, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

d('onboarding tour — core routes', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;
  let templateDir: string;
  let headSha: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    cloneRoot = await mkdtemp(join(tmpdir(), 'devdigest-onboarding-'));
    templateDir = join(cloneRoot, '_template');
    await mkdir(templateDir, { recursive: true });
    for (const [path, text] of Object.entries(FIXTURE_FILES)) {
      const abs = join(templateDir, path);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, text);
    }
    git(templateDir, 'init', '-q', '-b', 'main');
    git(templateDir, 'add', '-A');
    git(templateDir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
    headSha = git(templateDir, 'rev-parse', 'HEAD');
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
    if (cloneRoot) await rm(cloneRoot, { recursive: true, force: true });
  });

  /** A repo row; `clone` true copies the real git fixture to where the adapter looks. */
  async function makeRepo(opts: { clone: boolean; clonePath?: string | null } = { clone: true }) {
    const name = `tour-${repoSeq++}`;
    const clonePath =
      opts.clonePath !== undefined ? opts.clonePath : join(cloneRoot, 'acme', name);
    if (opts.clone) {
      await mkdir(join(cloneRoot, 'acme'), { recursive: true });
      await cp(templateDir, join(cloneRoot, 'acme', name), { recursive: true });
    }
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  function makeApp(opts: { intel: FakeIntel; stub?: StubLlm; repoIntelEnabled?: boolean }) {
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      REPO_INTEL_ENABLED: opts.repoIntelEnabled === false ? 'false' : 'true',
    } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        git: new SimpleGitClient(cloneRoot),
        repoIntel: opts.intel as unknown as RepoIntel,
        llm: opts.stub ? { openrouter: opts.stub } : undefined,
      },
    });
  }

  const readyIntel = () => {
    const intel = new FakeIntel();
    intel.state = indexedState(headSha);
    intel.snapshot = GRAPH;
    return intel;
  };

  const get = (app: Awaited<ReturnType<typeof makeApp>>, repoId: string) =>
    app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
  const post = (app: Awaited<ReturnType<typeof makeApp>>, repoId: string) =>
    app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

  // ---- AC-4 / AC-5 / AC-6: readiness ----------------------------------------------------

  it('a cloned, indexed repo with no tour is ready, idle and has no tour (AC-4)', async () => {
    const app = await makeApp({ intel: readyIntel(), stub: new StubLlm() });
    const repo = await makeRepo();
    const res = await get(app, repo.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ readiness: 'ready', generating: false, tour: null });
    await app.close();
  });

  it('is not_cloned when the repo has no clone path, or its directory is missing (AC-5)', async () => {
    const app = await makeApp({ intel: readyIntel(), stub: new StubLlm() });
    const noPath = await makeRepo({ clone: false, clonePath: null });
    const missingDir = await makeRepo({ clone: false });

    for (const repo of [noPath, missingDir]) {
      const res = await get(app, repo.id);
      expect(res.statusCode).toBe(200);
      expect((res.json() as OnboardingTourResponse).readiness).toBe('not_cloned');
    }
    await app.close();
  });

  it('is not_cloned when the index itself reports no_clone (AC-5)', async () => {
    const intel = readyIntel();
    intel.state = { ...neverIndexed(), reason: 'no_clone', degradedReason: undefined };
    const app = await makeApp({ intel, stub: new StubLlm() });
    const repo = await makeRepo();
    const res = await get(app, repo.id);
    expect((res.json() as OnboardingTourResponse).readiness).toBe('not_cloned');
    await app.close();
  });

  it('is not_indexed with no indexed commit, and when REPO_INTEL_ENABLED is false (AC-6)', async () => {
    const never = new FakeIntel();
    never.state = neverIndexed();
    const appNever = await makeApp({ intel: never, stub: new StubLlm() });
    const repo = await makeRepo();
    expect(((await get(appNever, repo.id)).json() as OnboardingTourResponse).readiness).toBe(
      'not_indexed',
    );
    await appNever.close();

    const appOff = await makeApp({
      intel: readyIntel(),
      stub: new StubLlm(),
      repoIntelEnabled: false,
    });
    expect(((await get(appOff, repo.id)).json() as OnboardingTourResponse).readiness).toBe(
      'not_indexed',
    );
    await appOff.close();
  });

  // ---- AC-13 / AC-14: refusals before any model call ----------------------------------------

  it('refuses to generate without a clone or an index, and never calls the model (AC-13, AC-14)', async () => {
    const stub = new StubLlm();
    const noClone = await makeRepo({ clone: false, clonePath: null });
    const appA = await makeApp({ intel: readyIntel(), stub });
    const a = await post(appA, noClone.id);
    expect(a.statusCode).toBe(409);
    expect(a.json().error.code).toBe('repo_not_cloned');
    await appA.close();

    const never = new FakeIntel();
    never.state = neverIndexed();
    const appB = await makeApp({ intel: never, stub });
    const cloned = await makeRepo();
    const b = await post(appB, cloned.id);
    expect(b.statusCode).toBe(409);
    expect(b.json().error.code).toBe('repo_not_indexed');
    await appB.close();

    expect(stub.calls).toHaveLength(0);
  });

  // ---- AC-15 / AC-19: one generation at a time -----------------------------------------------

  it('reports generating while a generation runs and refuses a second one (AC-15, AC-19)', async () => {
    const stub = new StubLlm();
    stub.hold();
    const app = await makeApp({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    const first = post(app, repo.id);
    await waitFor(() => stub.calls.length === 1, 'the model call');

    const during = (await get(app, repo.id)).json() as OnboardingTourResponse;
    expect(during.generating).toBe(true);

    const second = await post(app, repo.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('generation_in_progress');

    stub.release();
    const done = await first;
    expect(done.statusCode).toBe(200);
    expect(stub.calls).toHaveLength(1);

    const after = (await get(app, repo.id)).json() as OnboardingTourResponse;
    expect(after.generating).toBe(false);
    expect(after.tour?.status).toBe('narrative');
    await app.close();
  });

  // ---- AC-16: per-workspace budget -----------------------------------------------------------

  it('answers the 4th generate request of a minute with 429, whatever the first three were (AC-16)', async () => {
    const stub = new StubLlm();
    const app = await makeApp({ intel: readyIntel(), stub });
    // Not cloned → each request is a cheap 409, and still counts toward the budget.
    const repo = await makeRepo({ clone: false, clonePath: null });

    for (let i = 0; i < 3; i += 1) {
      expect((await post(app, repo.id)).statusCode).toBe(409);
    }
    const limited = await post(app, repo.id);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('rate_limited');
    expect(stub.calls).toHaveLength(0);
    await app.close();
  });

  // ---- AC-37 / AC-20: a narrative tour, one row per repo ----------------------------------

  it('stores a narrative tour, and a second generation replaces it in the same row (AC-37, AC-20)', async () => {
    const stub = new StubLlm();
    const app = await makeApp({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    const first = await post(app, repo.id);
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as OnboardingTourResponse;
    expect(firstBody.tour?.status).toBe('narrative');
    expect(firstBody.tour?.indexed_sha).toBe(headSha);
    expect(firstBody.tour?.branch).toBe('main');
    expect(firstBody.tour?.sections.map((s) => s.kind)).toEqual([
      'architecture_overview',
      'critical_paths',
      'how_to_run',
      'guided_reading',
      'first_tasks',
    ]);

    await new Promise((r) => setTimeout(r, 15));
    const second = (await (await post(app, repo.id)).json()) as OnboardingTourResponse;
    expect(second.tour?.generated_at).not.toBe(firstBody.tour?.generated_at);

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as { generated_at: string }).generated_at).toBe(second.tour?.generated_at);

    const read = (await (await get(app, repo.id)).json()) as OnboardingTourResponse;
    expect(read.tour?.generated_at).toBe(second.tour?.generated_at);
    expect(read.tour?.stale).toBe(false);
    await app.close();
  });

  // ---- AC-105: tenancy -----------------------------------------------------------------------------

  it("answers 404 for another workspace's repo on both routes, with no tour and no model call (AC-105)", async () => {
    const stub = new StubLlm();
    const app = await makeApp({ intel: readyIntel(), stub });
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'someone-else' })
      .returning();
    const [foreign] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: other!.id,
        owner: 'acme',
        name: 'foreign',
        fullName: 'acme/foreign',
        clonePath: join(cloneRoot, 'acme', 'foreign'),
      })
      .returning();
    // Even a stored tour of the foreign repo must stay invisible.
    await pg.handle.db.insert(t.onboarding).values({ repoId: foreign!.id, json: { secret: 'x' } });

    const g = await get(app, foreign!.id);
    expect(g.statusCode).toBe(404);
    expect(g.json()).not.toHaveProperty('tour');
    expect(JSON.stringify(g.json())).not.toContain('secret');

    const p = await post(app, foreign!.id);
    expect(p.statusCode).toBe(404);
    expect(p.json()).not.toHaveProperty('tour');
    expect(stub.calls).toHaveLength(0);
    await app.close();
  });
});
