/**
 * PR Brief (SPEC-03), the routes against a real Postgres: what GET reads and never calls
 * (AC-43 … AC-46, NFR-4), the refusals raised before any model call (AC-48, AC-91, AC-92,
 * AC-93), the one model call and its request (AC-64 … AC-66), the stored result and its
 * envelope (AC-83 … AC-85), and every failure code (AC-70, AC-86 … AC-90).
 *
 * Route-level cases go through `buildApp` + `app.inject()`. The cases that need the log line or
 * a short deadline build `BriefService` directly with a captured logger — the app logger is
 * silent under test. Every test owns its repo, its PR and its app; a test that writes workspace
 * settings deletes them again (server INSIGHTS 2026-09-24).
 */
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { GitHubClient, PrBriefResponse, SecretsProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import {
  CapturedLog,
  FAKE_USAGE,
  FakeBlastIntel,
  FakeLlm,
  GOOD_OUTPUT,
  makeForeignPr,
  makePr,
  providerError,
  sampleBrief,
  waitFor,
} from './helpers/brief.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { BriefService } from '../src/modules/brief/service.js';
import { BriefRepository } from '../src/modules/brief/repository.js';
import { ProjectContextRepository } from '../src/modules/project-context/repository.js';
import { MODEL_MAX_TOKENS } from '../src/modules/brief/constants.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

/** A GitHub double that records any use and fails it: GET must never reach GitHub (NFR-4). */
function untouchableGitHub(): { client: GitHubClient; touched: string[] } {
  const touched: string[] = [];
  const client = new Proxy(
    {},
    {
      get: (_target, prop) => () => {
        touched.push(String(prop));
        throw new Error('GitHub must not be called');
      },
    },
  ) as GitHubClient;
  return { client, touched };
}

d('PR brief — routes', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const apps: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  async function makeApp(
    opts: {
      llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', FakeLlm>>;
      intel?: FakeBlastIntel;
      github?: GitHubClient;
      secrets?: SecretsProvider;
    } = {},
  ) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        github: opts.github ?? new MockGitHubClient(),
        git: new MockGitClient(),
        repoIntel: (opts.intel ?? new FakeBlastIntel()) as unknown as RepoIntel,
        llm: opts.llm,
        secrets: opts.secrets,
      },
    });
    apps.push(app);
    return app;
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  const getBrief = (app: App, prId: string) =>
    app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
  const postBrief = (app: App, prId: string) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
  const briefRows = (prId: string) =>
    pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

  // ---- GET: what is stored, and nothing else -------------------------------------------------

  it('AC-44: a PR with no stored brief reads as brief null, not generating, not stale', async () => {
    const app = await makeApp();
    const { pr } = await makePr(pg.handle.db, workspaceId);
    const res = await getBrief(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, generating: false, stale: false });
  });

  it('AC-43, NFR-4: GET returns the stored brief with no model call and no GitHub call', async () => {
    const fake = new FakeLlm('openai');
    const { client, touched } = untouchableGitHub();
    const app = await makeApp({ llm: { openai: fake }, github: client });
    const { pr } = await makePr(pg.handle.db, workspaceId);
    const stored = sampleBrief({ summary: 'Stored earlier.' });
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: stored });

    const res = await getBrief(app, pr.id);
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrBriefResponse;
    expect(body.brief?.summary).toBe('Stored earlier.');
    expect(body.generating).toBe(false);
    expect(fake.calls).toHaveLength(0);
    expect(touched).toEqual([]);
  });

  it('AC-45: a brief for an older head reads as stale; an unchanged head does not', async () => {
    const app = await makeApp();
    const { pr: moved } = await makePr(pg.handle.db, workspaceId, { headSha: 'bbb222' });
    const { pr: same } = await makePr(pg.handle.db, workspaceId, { headSha: 'aaa111' });
    await pg.handle.db.insert(t.prBrief).values([
      { prId: moved.id, json: sampleBrief({ head_sha: 'aaa111' }) },
      { prId: same.id, json: sampleBrief({ head_sha: 'aaa111' }) },
    ]);
    expect(((await getBrief(app, moved.id)).json() as PrBriefResponse).stale).toBe(true);
    expect(((await getBrief(app, same.id)).json() as PrBriefResponse).stale).toBe(false);
  });

  // ---- In flight: AC-46, AC-91 ---------------------------------------------------------------

  it('AC-46, AC-91: while a generation runs GET says generating and a second POST is a 409', async () => {
    const fake = new FakeLlm('openai');
    fake.hold();
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    const first = postBrief(app, pr.id);
    await waitFor(() => fake.calls.length === 1, 'the first model call');

    expect(((await getBrief(app, pr.id)).json() as PrBriefResponse).generating).toBe(true);
    const second = await postBrief(app, pr.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('generation_in_progress');
    expect(fake.calls).toHaveLength(1);

    fake.release();
    expect((await first).statusCode).toBe(200);
    expect(((await getBrief(app, pr.id)).json() as PrBriefResponse).generating).toBe(false);
  });

  it('AC-48: a PR with no stored files is a 422 files_unavailable and calls nothing', async () => {
    const fake = new FakeLlm('openai');
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId, { files: [], filesCount: 0 });
    const res = await postBrief(app, pr.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('files_unavailable');
    expect(fake.calls).toHaveLength(0);
    expect(await briefRows(pr.id)).toHaveLength(0);
  });

  // ---- The call and the stored result ---------------------------------------------------------

  it('AC-64, AC-66, AC-83, AC-84, AC-85: one call with fixed limits; the stored brief equals the envelope and the next GET', async () => {
    const fake = new FakeLlm('openai');
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId, { headSha: 'aaa111' });

    const res = await postBrief(app, pr.id);
    expect(res.statusCode).toBe(200);
    const post = res.json() as PrBriefResponse;

    expect(fake.calls).toHaveLength(1);
    const req = fake.calls[0]!;
    expect(req.maxRetries).toBe(0);
    expect(req.disableReasoning).toBe(true);
    expect(req.maxTokens).toBe(8000);
    expect(req.maxTokens).toBe(MODEL_MAX_TOKENS);
    expect(req.model).toBe('gpt-4.1');

    expect(post.generating).toBe(false);
    expect(post.stale).toBe(false);
    expect(post.brief?.usage).toEqual({
      llm_calls: 1,
      tokens_in: FAKE_USAGE.tokensIn,
      tokens_out: FAKE_USAGE.tokensOut,
      cost_usd: FAKE_USAGE.costUsd,
      duration_ms: expect.any(Number),
    });
    expect(post.brief?.model).toBe('openai/gpt-4.1');
    expect(post.brief?.head_sha).toBe('aaa111');
    expect(post.brief?.review_focus).toEqual(GOOD_OUTPUT.review_focus);

    const rows = await briefRows(pr.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.json).toEqual(post.brief);
    expect((await getBrief(app, pr.id)).json()).toEqual(post);
  });

  it('AC-65: the model is the workspace risk_brief choice, else the feature default', async () => {
    const openai = new FakeLlm('openai');
    const openrouter = new FakeLlm('openrouter');
    const app = await makeApp({ llm: { openai, openrouter } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.settings).values({
      workspaceId,
      key: 'feature_models',
      value: { risk_brief: { provider: 'openrouter', model: 'x/y' } },
    });
    try {
      const res = await postBrief(app, pr.id);
      expect(res.statusCode).toBe(200);
      expect(openrouter.calls).toHaveLength(1);
      expect(openrouter.calls[0]!.model).toBe('x/y');
      expect(openai.calls).toHaveLength(0);
      expect((res.json() as PrBriefResponse).brief?.model).toBe('openrouter/x/y');
    } finally {
      // Later tests assert the DEFAULT model — never leak the override.
      await pg.handle.db
        .delete(t.settings)
        .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    }
  });

  it('AC-83: a second generation replaces the stored brief — one row per PR, the newer generated_at', async () => {
    const app = await makeApp({ llm: { openai: new FakeLlm('openai') } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    const first = ((await postBrief(app, pr.id)).json() as PrBriefResponse).brief!;
    await new Promise((r) => setTimeout(r, 15));
    const second = ((await postBrief(app, pr.id)).json() as PrBriefResponse).brief!;

    expect(second.generated_at).not.toBe(first.generated_at);
    const rows = await briefRows(pr.id);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as { generated_at: string }).generated_at).toBe(second.generated_at);
  });

  it('AC-72: a focus item on a file the PR does not have is dropped and counted', async () => {
    const fake = new FakeLlm('openai');
    fake.succeed({
      ...GOOD_OUTPUT,
      review_focus: [
        { file: 'src/invented.ts', line: 3, reason: 'Made up.' },
        { file: 'src/config.ts', line: 11, reason: 'Real.' },
      ],
    });
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    const brief = ((await postBrief(app, pr.id)).json() as PrBriefResponse).brief!;
    expect(brief.review_focus.map((f) => f.file)).toEqual(['src/config.ts']);
    expect(brief.dropped.review_focus).toBe(1);
  });

  // ---- Failures: nothing is stored, the stored brief is untouched ---------------------------------

  it('AC-70, AC-90: an answer that fails the schema is a 502 llm_invalid_output and the stored brief is unchanged', async () => {
    const fake = new FakeLlm('openai');
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    // Nothing stored before: nothing stored after.
    fake.succeed({ summary: 5 });
    const bad = await postBrief(app, pr.id);
    expect(bad.statusCode).toBe(502);
    expect(bad.json().error.code).toBe('llm_invalid_output');
    expect(await briefRows(pr.id)).toHaveLength(0);

    // A stored brief survives the next failure byte for byte.
    fake.succeed();
    expect((await postBrief(app, pr.id)).statusCode).toBe(200);
    const [before] = await briefRows(pr.id);
    fake.succeed({ summary: 5 });
    expect((await postBrief(app, pr.id)).statusCode).toBe(502);
    const [after] = await briefRows(pr.id);
    expect(after!.json).toEqual(before!.json);
  });

  it('AC-86: with no API key for the provider the POST is a 422 naming the provider and Settings → Models', async () => {
    // No `llm` override and a secrets store with nothing in it: the real container path.
    const app = await makeApp({ secrets: { get: async () => undefined } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    const res = await postBrief(app, pr.id);
    expect(res.statusCode).toBe(422);
    const error = res.json().error as { code: string; message: string };
    expect(error.code).toBe('llm_not_configured');
    expect(error.message).toContain('openai');
    expect(error.message).toContain('Settings → Models');
    expect(await briefRows(pr.id)).toHaveLength(0);
  });

  it('AC-87: a provider 4xx is a 422 llm_request_rejected naming the model', async () => {
    const fake = new FakeLlm('openai');
    fake.fail(providerError(404));
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    const res = await postBrief(app, pr.id);
    expect(res.statusCode).toBe(422);
    const error = res.json().error as { code: string; message: string };
    expect(error.code).toBe('llm_request_rejected');
    expect(error.message).toContain('gpt-4.1');
    expect(fake.calls).toHaveLength(1);
  });

  it('AC-89: any other provider failure is a 502 llm_failed', async () => {
    const fake = new FakeLlm('openai');
    fake.fail(providerError(503));
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    const res = await postBrief(app, pr.id);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('llm_failed');
  });

  // ---- Rate limit and tenancy ------------------------------------------------------------------------

  it('AC-92: the 4th POST within a minute is a 429 rate_limited, and the model is not called for it', async () => {
    const fake = new FakeLlm('openai');
    const app = await makeApp({ llm: { openai: fake } });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    for (let i = 0; i < 3; i++) expect((await postBrief(app, pr.id)).statusCode).toBe(200);
    const fourth = await postBrief(app, pr.id);
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.code).toBe('rate_limited');
    expect(fake.calls).toHaveLength(3);
  });

  it('AC-93: a PR of another workspace is a 404 on GET and POST, with no read and no call', async () => {
    const fake = new FakeLlm('openai');
    const { client, touched } = untouchableGitHub();
    const app = await makeApp({ llm: { openai: fake }, github: client });
    const { pr: foreign } = await makeForeignPr(pg.handle.db);
    await pg.handle.db.insert(t.prBrief).values({ prId: foreign.id, json: sampleBrief() });

    const get = await getBrief(app, foreign.id);
    expect(get.statusCode).toBe(404);
    expect(JSON.stringify(get.json())).not.toContain('A stored brief.');
    expect((await postBrief(app, foreign.id)).statusCode).toBe(404);
    expect(fake.calls).toHaveLength(0);
    expect(touched).toEqual([]);

    const unknown = '00000000-0000-0000-0000-000000000000';
    expect((await getBrief(app, unknown)).statusCode).toBe(404);
  });

  // ---- Service level: the deadline and the log line -------------------------------------------------------

  function makeService(opts: { fake: FakeLlm; modelDeadlineMs?: number }) {
    const log = new CapturedLog();
    const contextRepo = new ProjectContextRepository(pg.handle.db);
    const service = new BriefService({
      repo: new BriefRepository(pg.handle.db),
      git: new MockGitClient(),
      enabledAgentDocs: (ws, repoId) => contextRepo.enabledAgentDocs(ws, repoId),
      github: async () => new MockGitHubClient(),
      repoIntel: new FakeBlastIntel(),
      resolveModel: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
      llm: async () => opts.fake,
      countTokens: (s) => Math.ceil(s.length / 4),
      systemPrompt: async () => 'You write PR briefs.',
      log,
      inFlight: new Set<string>(),
      modelDeadlineMs: opts.modelDeadlineMs,
    });
    return { service, log };
  }

  it('AC-88, AC-90, AC-94: a model that never answers is a 502 llm_timeout, the stored brief is byte-identical, and each generation logs one line', async () => {
    const fake = new FakeLlm('openai');
    const { service, log } = makeService({ fake, modelDeadlineMs: 50 });
    const { pr } = await makePr(pg.handle.db, workspaceId);

    const ok = await service.generate(workspaceId, pr.id);
    expect(ok?.brief).not.toBeNull();
    const [before] = await briefRows(pr.id);

    fake.hang();
    await expect(service.generate(workspaceId, pr.id)).rejects.toMatchObject({
      code: 'llm_timeout',
      statusCode: 502,
    });
    const [after] = await briefRows(pr.id);
    expect(after!.json).toEqual(before!.json);

    expect(log.lines).toHaveLength(2);
    expect(log.lines[0]).toContain(`brief: pr=${pr.id} llm_calls=1 model=openai/gpt-4.1`);
    expect(log.lines[0]).toContain('status=ok reason=none');
    expect(log.lines[1]).toContain('llm_calls=1');
    expect(log.lines[1]).toContain('status=failed reason=llm_timeout');
    // Ids, counts and the model name only — never a secret or PR content.
    expect(log.lines.join('\n')).not.toContain('Adds a limiter.');
  });
});
