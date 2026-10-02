/**
 * Onboarding Tour (SPEC-02), the generation matrix against a real Postgres: when a tour
 * is generated at all, which degradation it falls back to, how a model failure is
 * stored, which model is used, what is logged and what leaves the clone for the prompt.
 *
 * Route-level cases go through `buildApp` + `app.inject()` (one real HTTP case, for the
 * client disconnect). Cases that need the log line or a short deadline build
 * `OnboardingService` directly with a captured logger — the app logger is silent under
 * test, so `app.log` could never be asserted on. Every test owns its repo and its app;
 * a test that writes workspace settings deletes them again (server INSIGHTS 2026-09-24).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type {
  FeatureModelChoice,
  GitClient,
  OnboardingReason,
  OnboardingTourResponse,
  SecretsProvider,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import {
  FIXTURE_FILES,
  FakeIntel,
  GRAPH,
  STUB_USAGE,
  StubLlm,
  git,
  indexedState,
  waitFor,
} from './helpers/onboarding.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding-generation] Docker not available — skipping integration tests.');
}

const DEFAULT_MODEL: FeatureModelChoice = {
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
};
/** A sha no clone holds: `git show` fails, so the history read fails (→ `no_history`). */
const UNKNOWN_SHA = '0'.repeat(40);

d('onboarding tour — generation matrix', () => {
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

    cloneRoot = await mkdtemp(join(tmpdir(), 'devdigest-onboarding-gen-'));
    templateDir = join(cloneRoot, '_template');
    await mkdir(templateDir, { recursive: true });
    for (const [path, text] of Object.entries(FIXTURE_FILES)) {
      const abs = join(templateDir, path);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, text);
    }
    git(templateDir, ['init', '-q', '-b', 'main']);
    git(templateDir, ['add', '-A']);
    git(templateDir, ['commit', '-q', '-m', 'init'], '2026-06-01T00:00:00Z');
    headSha = git(templateDir, ['rev-parse', 'HEAD']);
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
    if (cloneRoot) await rm(cloneRoot, { recursive: true, force: true });
  });

  /** A repo row backed by a real git clone (a copy of the template). */
  async function makeRepo() {
    const name = `gen-${repoSeq++}`;
    await mkdir(join(cloneRoot, 'acme'), { recursive: true });
    await cp(templateDir, join(cloneRoot, 'acme', name), { recursive: true });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: join(cloneRoot, 'acme', name),
      })
      .returning();
    return repo!;
  }

  const readyIntel = (over: Parameters<typeof indexedState>[1] = {}) => {
    const intel = new FakeIntel();
    intel.state = indexedState(headSha, over);
    intel.snapshot = GRAPH;
    return intel;
  };

  function makeApp(opts: {
    intel: FakeIntel;
    stub?: StubLlm;
    git?: GitClient;
    secrets?: SecretsProvider;
  }) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        git: opts.git ?? new SimpleGitClient(cloneRoot),
        repoIntel: opts.intel as unknown as RepoIntel,
        llm: opts.stub ? { openrouter: opts.stub } : undefined,
        secrets: opts.secrets,
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  const getTour = (app: App, repoId: string) =>
    app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
  const generate = (app: App, repoId: string) =>
    app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
  const tourRows = (repoId: string) =>
    pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));

  /** The service without the HTTP layer: a captured logger and injectable deadlines. */
  function makeService(opts: {
    intel: FakeIntel;
    stub: StubLlm | null;
    model?: FeatureModelChoice;
    modelDeadlineMs?: number;
  }) {
    const log = { info: vi.fn<(msg: string) => void>() };
    const service = new OnboardingService({
      repo: new OnboardingRepository(pg.handle.db),
      git: new SimpleGitClient(cloneRoot),
      repoIntel: opts.intel as unknown as RepoIntel,
      repoIntelEnabled: true,
      resolveModel: async () => opts.model ?? DEFAULT_MODEL,
      llm: async () => opts.stub,
      systemPrompt: async () => 'You write onboarding tours.',
      log,
      inFlight: new Set<string>(),
      modelDeadlineMs: opts.modelDeadlineMs,
    });
    return { service, log };
  }

  const generated = async (
    run: Promise<OnboardingTourResponse | undefined>,
  ): Promise<NonNullable<OnboardingTourResponse['tour']>> => {
    const res = await run;
    expect(res).toBeDefined();
    expect(res!.tour).not.toBeNull();
    return res!.tour!;
  };

  // ---- AC-12: generation only on request ---------------------------------------------------

  it('AC-12: importing, cloning and indexing a repo stores no tour; only a generate request does', async () => {
    const stub = new StubLlm();
    const app = await makeApp({
      intel: readyIntel(),
      stub,
      git: new MockGitClient({ docs: { 'src/a.ts': '' }, files: {} }),
    });

    const created = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/acme/widgets' },
    });
    expect(created.statusCode).toBe(201);
    const repoId = created.json().id as string;
    await app.container.jobs.onIdle(); // clone (+ index follow-up) have run

    const [row] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    expect(row!.clonePath).not.toBeNull(); // really cloned
    expect(await tourRows(repoId)).toHaveLength(0);
    const read = (await getTour(app, repoId)).json() as OnboardingTourResponse;
    expect(read).toEqual({ readiness: 'ready', generating: false, tour: null });
    expect(stub.calls).toHaveLength(0);

    expect((await generate(app, repoId)).statusCode).toBe(200);
    expect(await tourRows(repoId)).toHaveLength(1);
    await app.close();
  });

  // ---- AC-18: a disconnected client does not stop the generation ---------------------------

  it('AC-18: a client that disconnects mid-generation still gets its tour stored', async () => {
    const stub = new StubLlm();
    stub.hold();
    const app = await makeApp({ intel: readyIntel(), stub });
    const repo = await makeRepo();
    let disconnects = 0;
    app.server.on('connection', (socket) =>
      socket.once('close', () => {
        disconnects += 1;
      }),
    );
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;

    const abort = new AbortController();
    const request = fetch(`http://127.0.0.1:${port}/repos/${repo.id}/onboarding/generate`, {
      method: 'POST',
      signal: abort.signal,
    });
    request.catch(() => {}); // the abort rejects it; asserted below
    await waitFor(() => stub.calls.length === 1, 'the model call');

    abort.abort();
    await expect(request).rejects.toThrow();
    await waitFor(() => disconnects === 1, 'the server to see the disconnect');

    // Nobody is listening any more, yet the generation is still running...
    expect(((await getTour(app, repo.id)).json() as OnboardingTourResponse).generating).toBe(true);
    expect(await tourRows(repo.id)).toHaveLength(0);

    // ...and finishes and stores its result once the model answers.
    stub.release();
    await waitFor(async () => (await tourRows(repo.id)).length === 1, 'the tour to be stored');
    const read = (await getTour(app, repo.id)).json() as OnboardingTourResponse;
    expect(read.generating).toBe(false);
    expect(read.tour?.status).toBe('narrative');
    expect(stub.calls).toHaveLength(1);
    await app.close();
  });

  // ---- AC-21: a failed regeneration keeps the narrative ------------------------------------

  it('AC-21: a regeneration that fails keeps the stored narrative and records last_failure', async () => {
    const stub = new StubLlm();
    const app = await makeApp({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    const first = (await generate(app, repo.id)).json() as OnboardingTourResponse;
    expect(first.tour?.status).toBe('narrative');
    expect(first.tour?.last_failure).toBeNull();

    stub.fail(new Error('upstream provider returned 500'));
    const second = await generate(app, repo.id);
    expect(second.statusCode).toBe(200);
    const body = second.json() as OnboardingTourResponse;
    // The earlier narrative, untouched...
    expect(body.tour?.status).toBe('narrative');
    expect(body.tour?.generated_at).toBe(first.tour?.generated_at);
    expect(body.tour?.sections).toEqual(first.tour?.sections);
    // ...plus the failure and when it happened.
    expect(body.tour?.last_failure?.reason).toBe('llm_failed');
    expect(Number.isNaN(Date.parse(body.tour!.last_failure!.at))).toBe(false);

    const read = (await getTour(app, repo.id)).json() as OnboardingTourResponse;
    expect(read.tour?.status).toBe('narrative');
    expect(read.tour?.last_failure?.reason).toBe('llm_failed');
    expect(await tourRows(repo.id)).toHaveLength(1);
    await app.close();
  });

  // ---- AC-23: a repo deleted mid-generation stores nothing ---------------------------------

  it('AC-23: a repository deleted while the model is answering leaves no tour behind', async () => {
    const stub = new StubLlm();
    stub.hold();
    const app = await makeApp({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    const pending = generate(app, repo.id);
    await waitFor(() => stub.calls.length === 1, 'the model call');
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo.id));
    stub.release();

    const res = await pending;
    expect(res.statusCode).toBe(404);
    expect(await tourRows(repo.id)).toHaveLength(0);
    await app.close();
  });

  // ---- AC-27: which model ---------------------------------------------------------------------

  it('AC-27: the model is the workspace onboarding choice, else the feature default', async () => {
    const stub = new StubLlm();
    const app = await makeApp({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    await generate(app, repo.id);
    expect(stub.calls[0]!.model).toBe('deepseek/deepseek-v4-flash');

    await pg.handle.db.insert(t.settings).values({
      workspaceId,
      key: 'feature_models',
      value: { onboarding: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } },
    });
    try {
      const res = await generate(app, repo.id);
      expect(res.statusCode).toBe(200);
      expect(stub.calls).toHaveLength(2);
      expect(stub.calls[1]!.model).toBe('z-ai/glm-4.7-flash');
      expect((res.json() as OnboardingTourResponse).tour?.usage.model).toBe('z-ai/glm-4.7-flash');
    } finally {
      // Later tests assert the DEFAULT model — never leak the override.
      await pg.handle.db
        .delete(t.settings)
        .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    }
    await app.close();
  });

  // ---- AC-45: no API key ----------------------------------------------------------------------

  it('AC-45: with no API key for the provider the tour is a skeleton, without a model call', async () => {
    // No `llm` override and a secrets store with nothing in it: the real container path.
    const app = await makeApp({
      intel: readyIntel(),
      secrets: { get: async () => undefined },
    });
    const repo = await makeRepo();

    const res = await generate(app, repo.id);
    expect(res.statusCode).toBe(200);
    const tour = (res.json() as OnboardingTourResponse).tour!;
    expect(tour.status).toBe('skeleton');
    expect(tour.reasons).toContain('llm_not_configured');
    expect(tour.usage.llm_calls).toBe(0);
    expect(tour.usage.cost_usd).toBe(0);
    await app.close();
  });

  // ---- AC-33: staleness ---------------------------------------------------------------------

  it('AC-33: after the index moves to a new commit the stored tour reads as stale', async () => {
    const intel = readyIntel();
    const app = await makeApp({ intel, stub: new StubLlm() });
    const repo = await makeRepo();

    const first = (await generate(app, repo.id)).json() as OnboardingTourResponse;
    expect(first.tour?.stale).toBe(false);
    expect(((await getTour(app, repo.id)).json() as OnboardingTourResponse).tour?.stale).toBe(false);

    intel.state = indexedState('f'.repeat(40));
    const after = (await getTour(app, repo.id)).json() as OnboardingTourResponse;
    expect(after.tour?.stale).toBe(true);
    expect(after.tour?.indexed_sha).toBe(headSha); // the tour itself is unchanged
    await app.close();
  });

  // ---- AC-76: no .env value leaves the clone --------------------------------------------------

  it('AC-76: the prompt carries the .env.example key name; neither it nor the stored tour carries the value', async () => {
    const stub = new StubLlm();
    const { service } = makeService({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    await generated(service.generate(workspaceId, repo.id));

    const prompt = JSON.stringify(stub.calls[0]!.messages);
    expect(prompt).toContain('STRIPE_KEY');
    expect(prompt).not.toContain('sk_live_abc');
    const [row] = await tourRows(repo.id);
    expect(JSON.stringify(row!.json)).not.toContain('sk_live_abc');
  });

  // ---- AC-38 / AC-47: partial index, unreachable history -----------------------------------

  it('AC-38, AC-47: a partial index adds index_partial, and soft reasons still get the one model call', async () => {
    const stubA = new StubLlm();
    const a = makeService({ intel: readyIntel({ status: 'partial', filesIndexed: 10 }), stub: stubA });
    const healthy = await generated(a.service.generate(workspaceId, (await makeRepo()).id));
    expect(healthy.reasons).toEqual(['index_partial']);
    expect(healthy.status).toBe('narrative');
    expect(stubA.calls).toHaveLength(1);

    // The same index, but the indexed commit's history cannot be read.
    const intel = readyIntel({ status: 'partial', filesIndexed: 10, lastIndexedSha: UNKNOWN_SHA });
    const stubB = new StubLlm();
    const b = makeService({ intel, stub: stubB });
    const degraded = await generated(b.service.generate(workspaceId, (await makeRepo()).id));
    expect([...degraded.reasons].sort()).toEqual(['index_partial', 'no_history']);
    expect(degraded.status).toBe('narrative');
    expect(stubB.calls).toHaveLength(1);
  });

  // ---- AC-39 / AC-30 (server half): truncation ---------------------------------------------

  it('AC-39, AC-30: an index that dropped files adds index_truncated and records the walk total', async () => {
    const stub = new StubLlm();
    const { service } = makeService({
      intel: readyIntel({ filesIndexed: 5000, walkTotal: 8000 }),
      stub,
    });
    const tour = await generated(service.generate(workspaceId, (await makeRepo()).id));
    expect(tour.reasons).toEqual(['index_truncated']);
    expect(tour.indexed_files).toBe(5000);
    expect(tour.walk_total).toBe(8000);
    expect(tour.status).toBe('narrative');
    expect(stub.calls).toHaveLength(1);
  });

  // ---- AC-41: no import graph -----------------------------------------------------------------

  it('AC-41: an index without import edges adds no_import_graph, and the model is still called', async () => {
    const intel = readyIntel();
    intel.snapshot = { ...GRAPH, edges: [] };
    const stub = new StubLlm();
    const { service } = makeService({ intel, stub });
    const tour = await generated(service.generate(workspaceId, (await makeRepo()).id));
    expect(tour.reasons).toEqual(['no_import_graph']);
    expect(tour.status).toBe('narrative');
    expect(stub.calls).toHaveLength(1);
  });

  // ---- AC-40 / AC-44: nothing to explain → skeleton, no call ------------------------------

  it('AC-40, AC-44: zero indexed files and zero edges store a skeleton and spend no model call', async () => {
    const intel = new FakeIntel();
    intel.state = indexedState(headSha, { filesIndexed: 0 });
    intel.snapshot = { files: [], edges: [], endpoints: [] };
    const stub = new StubLlm();
    const { service, log } = makeService({ intel, stub });
    const repo = await makeRepo();

    const tour = await generated(service.generate(workspaceId, repo.id));
    expect([...tour.reasons].sort()).toEqual(['no_import_graph', 'unsupported_language']);
    expect(tour.status).toBe('skeleton');
    expect(tour.usage.llm_calls).toBe(0);
    expect(stub.calls).toHaveLength(0);
    expect(log.info.mock.calls[0]![0]).toContain('llm_calls=0 model=none');
    expect(await tourRows(repo.id)).toHaveLength(1);
  });

  // ---- AC-48 .. AC-51, AC-104: a model that fails ---------------------------------------------

  it.each([
    {
      ac: 'AC-48',
      reason: 'llm_timeout',
      arrange: (stub: StubLlm) => stub.hang(),
      deadline: 150,
    },
    {
      ac: 'AC-49',
      reason: 'llm_failed',
      arrange: (stub: StubLlm) => stub.fail(new Error('upstream provider returned 500')),
      deadline: undefined,
    },
    {
      ac: 'AC-50',
      reason: 'llm_invalid_output',
      arrange: (stub: StubLlm) =>
        stub.fail(new Error('OpenRouter structured output failed schema validation for OnboardingTour')),
      deadline: undefined,
    },
  ] as const)(
    '$ac: a model that ends in $reason leaves a skeleton after exactly one call (AC-51, AC-104)',
    async ({ reason, arrange, deadline }) => {
      const stub = new StubLlm();
      arrange(stub);
      const { service } = makeService({ intel: readyIntel(), stub, modelDeadlineMs: deadline });

      const tour = await generated(service.generate(workspaceId, (await makeRepo()).id));

      expect(tour.status).toBe('skeleton');
      expect(tour.reasons).toContain(reason as OnboardingReason);
      // AC-51: one call, and the request itself forbids a schema-repair retry.
      expect(stub.calls).toHaveLength(1);
      expect(stub.calls[0]!.maxRetries).toBe(0);
      // AC-104: a failed call is reported as one attempt, with nothing known about its cost.
      expect(tour.usage.llm_calls).toBe(1);
      expect(tour.usage.cost_usd).toBeNull();
      expect(tour.usage.tokens_in).toBeNull();
      expect(tour.usage.tokens_out).toBeNull();
    },
  );

  // ---- AC-37, AC-51, AC-102, AC-103, AC-104: a successful generation ------------------------

  it('AC-37, AC-103, AC-104, AC-102: a successful call is a narrative with the stub usage and one log line', async () => {
    const stub = new StubLlm();
    const { service, log } = makeService({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    const res = await service.generate(workspaceId, repo.id);
    const tour = res!.tour!;

    expect(tour.status).toBe('narrative');
    expect(tour.reasons).toEqual([]);
    expect(stub.calls).toHaveLength(1); // AC-51
    // AC-103 / AC-104: the stub's own numbers, and the engine's attempt count.
    expect(tour.usage).toEqual({
      llm_calls: 1,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: STUB_USAGE.tokensIn,
      tokens_out: STUB_USAGE.tokensOut,
      cost_usd: STUB_USAGE.costUsd,
      duration_ms: expect.any(Number),
    });
    // ...and the stored document carries the same usage.
    const [row] = await tourRows(repo.id);
    expect((row!.json as { usage: unknown }).usage).toEqual(tour.usage);

    // AC-102: exactly one line for this generation, built from that same usage.
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0]![0]).toBe(
      `onboarding: repo=${repo.id} llm_calls=1 model=openrouter/deepseek/deepseek-v4-flash` +
        ` tokens_in=100 tokens_out=50 cost_usd=0.002 duration_ms=${tour.usage.duration_ms}` +
        ` status=narrative reasons=none`,
    );
  });

  it('AC-102: a failed generation also logs exactly one line, with unknown tokens and cost', async () => {
    const stub = new StubLlm();
    stub.fail(new Error('upstream provider returned 500'));
    const { service, log } = makeService({ intel: readyIntel(), stub });
    const repo = await makeRepo();

    const tour = await generated(service.generate(workspaceId, repo.id));

    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0]![0]).toBe(
      `onboarding: repo=${repo.id} llm_calls=1 model=openrouter/deepseek/deepseek-v4-flash` +
        ` tokens_in=unknown tokens_out=unknown cost_usd=unknown duration_ms=${tour.usage.duration_ms}` +
        ` status=skeleton reasons=llm_failed`,
    );
  });
});
