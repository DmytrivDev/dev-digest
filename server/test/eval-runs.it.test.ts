import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { Finding, LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { EvalService } from '../src/modules/eval/service.js';
import { buildCaseDiff } from '../src/modules/eval/helpers/case-diff.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-runs] Docker not available — skipping integration tests.');
}

/**
 * SPEC-04 suite runs: start, progress, finish, reaping, and the isolation guarantees
 * (AC-35, AC-46…AC-60, AC-76, AC-103…AC-105). The review engine is a stub LLM injected
 * through the container overrides; fixtures use `sk_live_xxx` placeholders only (NFR-1).
 */

// Hunk 1 covers new-side lines 1-4 (+2 added); hunk 2 covers 21-23 (+22 added).
const PATCH = [
  '@@ -1,3 +1,4 @@',
  ' const a = 1;',
  "+const stripeKey = 'sk_live_xxx';",
  ' const b = 2;',
  ' const c = 3;',
  '@@ -20,2 +21,3 @@',
  ' function f() {',
  '+  return run(input);',
  ' }',
].join('\n');
const FILE = 'src/config.ts';

function hit(start = 2): Finding {
  return {
    id: `f-${start}`,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded Stripe secret key',
    file: FILE,
    start_line: start,
    end_line: start,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
  };
}

interface Stub {
  llm: LLMProvider;
  /** The full prompt text of every call so far. */
  calls: string[];
  /** Let call `i` (0-based) finish. */
  release(i: number): void;
  /** Let every current and future call finish. */
  releaseAll(): void;
}

/** A stub engine LLM. `gated` calls wait until released, so a test can observe a run mid-flight. */
function stubLlm(opts: { gated?: boolean; findings?: (call: number) => Finding[] } = {}): Stub {
  const calls: string[] = [];
  const gates: { promise: Promise<void>; open: () => void }[] = [];
  let released = false;
  const gate = (i: number) => {
    while (gates.length <= i) {
      let open!: () => void;
      const promise = new Promise<void>((resolve) => (open = resolve));
      gates.push({ promise, open });
    }
    return gates[i]!;
  };
  const unexpected = () => {
    throw new Error('only completeStructured is expected during an eval run');
  };
  const llm = {
    id: 'openrouter',
    listModels: unexpected,
    complete: unexpected,
    async completeStructured(req: { model: string; messages: { content: string }[] }) {
      const i = calls.length;
      calls.push(req.messages.map((m) => m.content).join('\n'));
      if (opts.gated && !released) await gate(i).promise;
      return {
        data: {
          verdict: 'comment',
          summary: 's',
          score: 80,
          findings: opts.findings ? opts.findings(i) : [],
        },
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.01,
        raw: '{}',
        attempts: 1,
      };
    },
  };
  return {
    llm: llm as unknown as LLMProvider,
    calls,
    release: (i) => gate(i).open(),
    releaseAll: () => {
      released = true;
      for (const g of gates) g.open();
    },
  };
}

async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 10_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

d('eval suite runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prSeq = 300;
  const stubs: Stub[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'eval-runs', fullName: 'acme/eval-runs' })
      .returning();
    repoId = repo!.id;
  });

  afterEach(async () => {
    // Never leave a run executing into the next test: a later buildApp reaps `running` rows.
    for (const s of stubs.splice(0)) s.releaseAll();
    await waitFor(async () => {
      const running = await pg.handle.db
        .select({ id: t.evalSuiteRuns.id })
        .from(t.evalSuiteRuns)
        .where(eq(t.evalSuiteRuns.status, 'running'));
      return running.length === 0;
    });
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(stub?: Stub, extra: { secrets?: MockSecretsProvider } = {}) {
    if (stub) stubs.push(stub);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        ...(stub ? { llm: { openrouter: stub.llm } } : {}),
        ...(extra.secrets ? { secrets: extra.secrets } : {}),
      },
    });
  }

  async function newAgent(provider: 'openrouter' | 'anthropic' = 'openrouter'): Promise<string> {
    const agent = await new AgentsRepository(pg.handle.db).insert({
      workspaceId,
      name: `Runs ${Math.random().toString(36).slice(2, 8)}`,
      provider,
      model: 'test-model',
      systemPrompt: 'Review the diff.',
    });
    return agent.id;
  }

  async function addCase(
    agentId: string,
    name: string,
    kind: 'must_find' | 'must_not_flag' = 'must_find',
    line = 2,
  ): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.evalCases)
      .values({
        workspaceId,
        agentId,
        sourceFindingId: null,
        sourcePrNumber: 9,
        sourceRepo: 'acme/eval-runs',
        labels: { severity: 'CRITICAL', category: 'security', title: name },
        name,
        inputDiff: buildCaseDiff(FILE, PATCH),
        inputMeta: { pr_number: 9, title: 'Add stripe config', body: 'Wires the payment config.' },
        expectedOutput: { kind, file: FILE, start_line: line, end_line: line },
      })
      .returning();
    return row!.id;
  }

  async function agentWithCases(n: number, provider: 'openrouter' | 'anthropic' = 'openrouter') {
    const agentId = await newAgent(provider);
    const caseIds: string[] = [];
    for (let i = 0; i < n; i++) caseIds.push(await addCase(agentId, `case-${i + 1}`));
    return { agentId, caseIds };
  }

  type App = Awaited<ReturnType<typeof makeApp>>;
  const start = (app: App, agentId: string) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/eval/runs` });
  const getRun = async (app: App, runId: string) =>
    (await app.inject({ method: 'GET', url: `/eval/runs/${runId}` })).json();
  const waitStatus = (app: App, runId: string, status: string) =>
    waitFor(async () => {
      const run = await getRun(app, runId);
      return run.status === status ? run : undefined;
    });

  const runRows = (agentId: string) =>
    pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agentId));

  // ===========================================================================

  it('answers 202 with the run id while the model has not finished any case (AC-46)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { agentId } = await agentWithCases(3);

    const res = await start(app, agentId);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body).toMatchObject({ status: 'running', cases_total: 3 });

    const rows = await runRows(agentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: body.run_id, status: 'running', casesTotal: 3, casesDone: 0 });

    const run = await getRun(app, body.run_id);
    expect(run).toMatchObject({ status: 'running', cases_done: 0, cases_total: 3 });
    expect(run.outcomes).toEqual([]);

    stub.releaseAll();
    await waitStatus(app, body.run_id, 'completed');
    await app.close();
  });

  it('records the agent version and effective config at start, enabled skills only (AC-47)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { agentId } = await agentWithCases(1);

    const [on, off] = await pg.handle.db
      .insert(t.skills)
      .values([
        { workspaceId, name: 'rule-on', description: '', type: 'rubric', source: 'manual', body: 'ENABLED-RULE-BODY', enabled: true, version: 3 },
        { workspaceId, name: 'rule-off', description: '', type: 'rubric', source: 'manual', body: 'DISABLED-RULE-BODY', enabled: false, version: 1 },
      ])
      .returning();
    await pg.handle.db.insert(t.agentSkills).values([
      { agentId, skillId: off!.id, order: 0 },
      { agentId, skillId: on!.id, order: 1 },
    ]);

    const { run_id } = (await start(app, agentId)).json();
    const [before] = await runRows(agentId);
    expect(before!.agentVersion).toBe(1);
    expect(before!.config).toEqual({
      system_prompt: 'Review the diff.',
      model: 'test-model',
      provider: 'openrouter',
      strategy: 'single-pass',
      skills: [{ name: 'rule-on', version: 3 }],
    });

    // Edit the agent after the start: the run keeps what it started with.
    await pg.handle.db
      .update(t.agents)
      .set({ systemPrompt: 'Changed later.', model: 'other-model', version: 2 })
      .where(eq(t.agents.id, agentId));
    const [after] = await runRows(agentId);
    expect(after!.agentVersion).toBe(1);
    expect(after!.config).toEqual(before!.config);

    stub.releaseAll();
    const done = await waitStatus(app, run_id, 'completed');
    expect(done.agent_version).toBe(1);
    expect(done.config.system_prompt).toBe('Review the diff.');
    // The prompt carried the enabled skill and not the disabled one.
    expect(stub.calls[0]).toContain('ENABLED-RULE-BODY');
    expect(stub.calls[0]).not.toContain('DISABLED-RULE-BODY');
    expect(stub.calls[0]).toContain('Review the diff.');
    await app.close();
  });

  it('rejects a second start while one is running with 409 run_in_progress (AC-51)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { agentId } = await agentWithCases(2);

    const first = await start(app, agentId);
    expect(first.statusCode).toBe(202);
    const second = await start(app, agentId);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('run_in_progress');
    expect(await runRows(agentId)).toHaveLength(1);

    stub.releaseAll();
    await waitStatus(app, first.json().run_id, 'completed');
    await app.close();
  });

  it('rejects an agent with no cases with 422 no_cases and creates no run (AC-52)', async () => {
    const app = await makeApp(stubLlm());
    const agentId = await newAgent();
    const res = await start(app, agentId);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('no_cases');
    expect(await runRows(agentId)).toHaveLength(0);
    await app.close();
  });

  it('rejects a provider without a key with 422 provider_key_missing and creates no run (AC-53)', async () => {
    // No llm override and an empty secrets store: the container cannot build the provider.
    const app = await makeApp(undefined, { secrets: new MockSecretsProvider({}) });
    const { agentId } = await agentWithCases(1, 'anthropic');
    const res = await start(app, agentId);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('provider_key_missing');
    expect(await runRows(agentId)).toHaveLength(0);
    await app.close();
  });

  it('answers 404 for an unknown agent', async () => {
    const app = await makeApp(stubLlm());
    const res = await start(app, '00000000-0000-4000-8000-000000000000');
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('completes with metrics, finished_at and duration_ms = finished - started (AC-56, AC-76)', async () => {
    // Case 1 (must_find, line 2) is found; case 2 (must_not_flag, line 2) is flagged -> fails.
    const stub = stubLlm({ findings: () => [hit(2)] });
    const app = await makeApp(stub);
    const agentId = await newAgent();
    await addCase(agentId, 'finds-it', 'must_find');
    await addCase(agentId, 'stays-quiet', 'must_not_flag');

    const { run_id } = (await start(app, agentId)).json();
    const run = await waitStatus(app, run_id, 'completed');

    expect(run).toMatchObject({
      error_reason: null,
      cases_total: 2,
      cases_done: 2,
      cases_scored: 2,
      cases_passed: 1,
      cases_errored: 0,
      recall: 1,
      precision: 0.5,
      citation_accuracy: 1,
    });
    expect(run.cost_usd).toBeCloseTo(0.02);
    expect(run.finished_at).not.toBeNull();
    expect(run.duration_ms).toBe(Date.parse(run.finished_at) - Date.parse(run.started_at));
    expect(run.outcomes.map((o: { case_name: string; pass: boolean }) => [o.case_name, o.pass])).toEqual([
      ['finds-it', true],
      ['stays-quiet', false],
    ]);
    await app.close();
  });

  it('ends failed: all_cases_errored when every case errors', async () => {
    const llm = {
      id: 'openrouter',
      listModels: async () => [],
      complete: async () => {
        throw new Error('no');
      },
      completeStructured: async () => {
        throw new Error('provider down');
      },
    } as unknown as LLMProvider;
    const stub: Stub = { llm, calls: [], release: () => {}, releaseAll: () => {} };
    const app = await makeApp(stub);
    const { agentId } = await agentWithCases(2);
    const { run_id } = (await start(app, agentId)).json();
    const run = await waitStatus(app, run_id, 'failed');
    expect(run).toMatchObject({ error_reason: 'all_cases_errored', cases_errored: 2, cases_scored: 0 });
    expect(run.outcomes.map((o: { error_reason: string }) => o.error_reason)).toEqual([
      'llm_error',
      'llm_error',
    ]);
    await app.close();
  });

  it('reports cases_done climbing between cases (AC-59)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { agentId } = await agentWithCases(2);
    const { run_id } = (await start(app, agentId)).json();

    await waitFor(async () => stub.calls.length >= 1);
    expect((await getRun(app, run_id)).cases_done).toBe(0);

    stub.release(0);
    await waitFor(async () => (await getRun(app, run_id)).cases_done === 1);
    expect((await getRun(app, run_id)).status).toBe('running');

    stub.release(1);
    const run = await waitStatus(app, run_id, 'completed');
    expect(run.cases_done).toBe(2);
    await app.close();
  });

  it('keeps running to a final status when nobody polls (AC-60)', async () => {
    const stub = stubLlm();
    const app = await makeApp(stub);
    const { agentId } = await agentWithCases(2);
    const { run_id } = (await start(app, agentId)).json();

    // No HTTP read until the DB says it is over.
    await waitFor(async () => {
      const [row] = await pg.handle.db
        .select()
        .from(t.evalSuiteRuns)
        .where(eq(t.evalSuiteRuns.id, run_id));
      return row?.status === 'completed';
    });
    await app.close();
  });

  describe('reaping (AC-58)', () => {
    const baseRun = (agentId: string, startedAt: Date) => ({
      workspaceId,
      agentId,
      agentVersion: 1,
      config: {
        system_prompt: 'p',
        model: 'm',
        provider: 'openrouter',
        strategy: 'single-pass',
        skills: [],
      },
      caseIds: [],
      casesTotal: 1,
      status: 'running' as const,
      startedAt,
    });

    it('fails a run still running 15+ minutes after its start when it is read', async () => {
      const app = await makeApp(stubLlm());
      const agentId = await newAgent();
      const [stale] = await pg.handle.db
        .insert(t.evalSuiteRuns)
        .values(baseRun(agentId, new Date(Date.now() - 16 * 60_000)))
        .returning();

      const run = await getRun(app, stale!.id);
      expect(run).toMatchObject({ status: 'failed', error_reason: 'interrupted' });
      expect(run.finished_at).not.toBeNull();
      await app.close();
    });

    it('leaves a younger running run alone', async () => {
      const app = await makeApp(stubLlm());
      const agentId = await newAgent();
      const [young] = await pg.handle.db
        .insert(t.evalSuiteRuns)
        .values(baseRun(agentId, new Date(Date.now() - 14 * 60_000)))
        .returning();

      expect((await getRun(app, young!.id)).status).toBe('running');
      await pg.handle.db.delete(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, young!.id));
      await app.close();
    });

    it('a stale run does not block the next start', async () => {
      const stub = stubLlm();
      const app = await makeApp(stub);
      const { agentId } = await agentWithCases(1);
      await pg.handle.db
        .insert(t.evalSuiteRuns)
        .values(baseRun(agentId, new Date(Date.now() - 20 * 60_000)));

      const res = await start(app, agentId);
      expect(res.statusCode).toBe(202);
      await waitStatus(app, res.json().run_id, 'completed');
      await app.close();
    });

    it('fails every running run at boot', async () => {
      const agentId = await newAgent();
      const [orphan] = await pg.handle.db
        .insert(t.evalSuiteRuns)
        .values(baseRun(agentId, new Date()))
        .returning();

      const app = await makeApp(stubLlm());
      const [row] = await pg.handle.db
        .select()
        .from(t.evalSuiteRuns)
        .where(eq(t.evalSuiteRuns.id, orphan!.id));
      expect(row).toMatchObject({ status: 'failed', errorReason: 'interrupted' });
      expect(row!.finishedAt).not.toBeNull();
      await app.close();
    });
  });

  it('leaves stored outcomes byte-identical when a case is edited or deleted (AC-35)', async () => {
    const app = await makeApp(stubLlm({ findings: () => [hit(2)] }));
    const { agentId, caseIds } = await agentWithCases(2);
    const { run_id } = (await start(app, agentId)).json();
    await waitStatus(app, run_id, 'completed');
    const before = await getRun(app, run_id);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/eval/cases/${caseIds[0]}`,
      payload: {
        name: 'renamed',
        expectation: { kind: 'must_not_flag', file: FILE, start_line: 22, end_line: 22 },
      },
    });
    expect(patch.statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/eval/cases/${caseIds[1]}` })).statusCode).toBe(204);

    const after = await getRun(app, run_id);
    expect(after).toEqual(before);
    expect(after.outcomes.map((o: { case_name: string }) => o.case_name)).toEqual(['case-1', 'case-2']);
    await app.close();
  });

  it('removes the cases and runs of a deleted agent (AC-104)', async () => {
    const app = await makeApp(stubLlm());
    const { agentId } = await agentWithCases(2);
    const { run_id } = (await start(app, agentId)).json();
    await waitStatus(app, run_id, 'completed');

    const res = await app.inject({ method: 'DELETE', url: `/agents/${agentId}` });
    expect(res.statusCode).toBe(200);

    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agentId))).toHaveLength(0);
    expect(await runRows(agentId)).toHaveLength(0);
    expect(
      await pg.handle.db.select().from(t.evalCaseOutcomes).where(eq(t.evalCaseOutcomes.runId, run_id)),
    ).toHaveLength(0);
    await app.close();
  });

  it('still runs a case whose source review was deleted, and marks the source unavailable (AC-105)', async () => {
    const app = await makeApp(stubLlm({ findings: () => [hit(2)] }));
    const agentId = await newAgent();
    const db = pg.handle.db;

    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: prSeq++,
        title: 'Add stripe config',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        body: 'Wires the payment config.',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: FILE, patch: PATCH });
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        agentId,
        kind: 'review',
        verdict: 'request_changes',
        summary: 's',
        score: 50,
        model: 'test-model',
      })
      .returning();
    const [finding] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: FILE,
        startLine: 2,
        endLine: 2,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: new Date(),
      })
      .returning();

    const created = await app.inject({ method: 'POST', url: `/findings/${finding!.id}/eval-case` });
    expect(created.statusCode).toBe(201);
    const caseId = created.json().id as string;
    expect(created.json().source.available).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/reviews/${review!.id}` })).statusCode).toBeLessThan(300);

    const { run_id } = (await start(app, agentId)).json();
    const run = await waitStatus(app, run_id, 'completed');
    expect(run.outcomes).toHaveLength(1);
    expect(run.outcomes[0]).toMatchObject({ case_id: caseId, status: 'scored', pass: true });

    const c = (await app.inject({ method: 'GET', url: `/eval/cases/${caseId}` })).json();
    expect(c.source).toMatchObject({ finding_id: null, available: false });
    expect(c.last_outcome).toMatchObject({ case_id: caseId, pass: true });
    await app.close();
  });

  describe('workspace scoping (AC-103)', () => {
    it('answers not-found to a caller in another workspace for start, get and list', async () => {
      const stub = stubLlm();
      const app = await makeApp(stub);
      const { agentId } = await agentWithCases(1);
      const { run_id } = (await start(app, agentId)).json();
      await waitStatus(app, run_id, 'completed');

      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
      const otherWs = other!.id;
      const service = new EvalService({
        repo: new EvalRepository(pg.handle.db),
        agents: new AgentsRepository(pg.handle.db),
        parseDiff: parseUnifiedDiff,
        resolveLlm: async () => stub.llm,
      });

      await expect(service.startRun(otherWs, agentId)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.getRun(otherWs, run_id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.listRuns(otherWs, agentId)).rejects.toMatchObject({ statusCode: 404 });
      expect(await runRows(agentId)).toHaveLength(1);

      // The other workspace's own reads never include these rows.
      const ids = (
        await pg.handle.db
          .select({ id: t.evalSuiteRuns.id })
          .from(t.evalSuiteRuns)
          .where(inArray(t.evalSuiteRuns.workspaceId, [otherWs]))
      ).map((r) => r.id);
      expect(ids).toEqual([]);
      await app.close();
    });
  });
});
