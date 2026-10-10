import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
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
  console.warn('[eval-case-runs] Docker not available — skipping integration tests.');
}

/**
 * SPEC-07 single-case runs over HTTP: the start, the lock shared with suite runs, reaping,
 * the final status, and the suite-only aggregates (runs list, dashboard, overview, compare).
 * The review engine is a stub LLM injected through the container overrides; fixtures use
 * `sk_live_xxx` placeholders only.
 */

const PATCH = [
  '@@ -1,3 +1,4 @@',
  ' const a = 1;',
  "+const stripeKey = 'sk_live_xxx';",
  ' const b = 2;',
  ' const c = 3;',
].join('\n');
const FILE = 'src/config.ts';
const MIN = 60_000;

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
  /** Let every current and future call finish. */
  releaseAll(): void;
}

/** A stub engine LLM. `gated` calls wait until released, so a test can observe a run mid-flight. */
function stubLlm(opts: { gated?: boolean; findings?: (call: number) => Finding[] } = {}): Stub {
  const calls: string[] = [];
  const waiters: (() => void)[] = [];
  let released = false;
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
      if (opts.gated && !released) await new Promise<void>((resolve) => waiters.push(resolve));
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
    releaseAll: () => {
      released = true;
      for (const w of waiters.splice(0)) w();
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

d('eval case runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const stubs: Stub[] = [];
  /** `running` rows inserted by a test with no executor behind them; removed after the test. */
  const fixtureRunning: string[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });

  afterEach(async () => {
    // Never leave a run executing into the next test: a later buildApp reaps `running` rows.
    for (const s of stubs.splice(0)) s.releaseAll();
    const orphans = fixtureRunning.splice(0);
    if (orphans.length > 0) {
      await pg.handle.db.delete(t.evalSuiteRuns).where(inArray(t.evalSuiteRuns.id, orphans));
    }
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

  function makeService(stub: Stub) {
    return new EvalService({
      repo: new EvalRepository(pg.handle.db),
      agents: new AgentsRepository(pg.handle.db),
      parseDiff: parseUnifiedDiff,
      resolveLlm: async () => stub.llm,
    });
  }

  async function newAgent(provider: 'openrouter' | 'anthropic' = 'openrouter'): Promise<string> {
    const agent = await new AgentsRepository(pg.handle.db).insert({
      workspaceId,
      name: `CaseRun ${Math.random().toString(36).slice(2, 8)}`,
      provider,
      model: 'test-model',
      systemPrompt: 'Review the diff.',
    });
    return agent.id;
  }

  async function addCase(agentId: string, name: string, kind: 'must_find' | 'must_not_flag' = 'must_find') {
    const [row] = await pg.handle.db
      .insert(t.evalCases)
      .values({
        workspaceId,
        agentId,
        sourceFindingId: null,
        sourcePrNumber: 9,
        sourceRepo: 'acme/eval-case-runs',
        labels: { severity: 'CRITICAL', category: 'security', title: name },
        name,
        inputDiff: buildCaseDiff(FILE, PATCH),
        inputMeta: { pr_number: 9, title: 'Add stripe config', body: 'Wires the payment config.' },
        expectedOutput: { kind, file: FILE, start_line: 2, end_line: 2 },
      })
      .returning();
    return row!.id;
  }

  async function agentWithCase(provider: 'openrouter' | 'anthropic' = 'openrouter') {
    const agentId = await newAgent(provider);
    const caseId = await addCase(agentId, 'case-1');
    return { agentId, caseId };
  }

  type App = Awaited<ReturnType<typeof makeApp>>;
  const startCase = (app: App, caseId: string) =>
    app.inject({ method: 'POST', url: `/eval/cases/${caseId}/runs` });
  const startSuite = (app: App, agentId: string) =>
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

  interface RunFixture {
    agentId: string;
    scope?: 'suite' | 'case';
    caseId?: string | null;
    startedAt: Date;
    status?: 'running' | 'completed' | 'failed';
    recall?: number | null;
    precision?: number | null;
  }

  /** A run inserted directly; a `running` one is queued for removal after the test. */
  async function insertRun(o: RunFixture): Promise<string> {
    const status = o.status ?? 'completed';
    const scope = o.scope ?? 'suite';
    const [row] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: o.agentId,
        agentVersion: 1,
        status,
        errorReason: status === 'failed' ? 'all_cases_errored' : null,
        config: {
          system_prompt: 'p',
          model: 'm',
          provider: 'openrouter',
          strategy: 'single-pass',
          skills: [],
        },
        caseIds: [],
        startedAt: o.startedAt,
        finishedAt: status === 'running' ? null : new Date(o.startedAt.getTime() + MIN),
        casesTotal: 1,
        casesDone: status === 'running' ? 0 : 1,
        recall: o.recall ?? null,
        precision: o.precision ?? null,
        citationAccuracy: status === 'completed' ? 1 : null,
        durationMs: status === 'running' ? null : MIN,
        ...(scope === 'case' ? { scope, caseId: o.caseId ?? randomUUID() } : {}),
      })
      .returning();
    if (status === 'running') fixtureRunning.push(row!.id);
    return row!.id;
  }

  async function insertOutcome(runId: string, caseId: string, pass: boolean) {
    await pg.handle.db.insert(t.evalCaseOutcomes).values({
      runId,
      caseId,
      caseName: 'c',
      kind: 'must_find',
      expectation: { kind: 'must_find', file: FILE, start_line: 2, end_line: 2 },
      status: 'scored',
      pass,
      errorReason: null,
      findingsMatched: pass ? 1 : 0,
      findingsTotal: pass ? 1 : 0,
      groundingKept: pass ? 1 : 0,
      groundingTotal: pass ? 1 : 0,
      durationMs: 10,
      costUsd: 0.01,
      actual: [],
    });
  }

  const ago = (min: number) => new Date(Date.now() - min * MIN);

  // ===========================================================================

  it('answers 202 while the model is still working and writes a running case row (AC-26)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { agentId, caseId } = await agentWithCase();

    const res = await startCase(app, caseId);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body).toEqual({ run_id: expect.any(String), status: 'running', cases_total: 1 });

    const rows = await runRows(agentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: body.run_id,
      status: 'running',
      scope: 'case',
      caseId,
      casesTotal: 1,
    });
    expect(await getRun(app, body.run_id)).toMatchObject({
      status: 'running',
      scope: 'case',
      case_id: caseId,
      cases_total: 1,
    });
    await app.close();
  });

  it('records the agent version and config at the start (AC-27)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { agentId, caseId } = await agentWithCase();

    const { run_id } = (await startCase(app, caseId)).json();
    await pg.handle.db
      .update(t.agents)
      .set({ systemPrompt: 'Changed later.', model: 'other-model', version: 2 })
      .where(eq(t.agents.id, agentId));

    stub.releaseAll();
    const run = await waitStatus(app, run_id, 'completed');
    expect(run.agent_version).toBe(1);
    expect(run.config).toEqual({
      system_prompt: 'Review the diff.',
      model: 'test-model',
      provider: 'openrouter',
      strategy: 'single-pass',
      skills: [],
    });
    expect(stub.calls[0]).toContain('Review the diff.');
    await app.close();
  });

  it('a scored case ends completed with finished_at set and one outcome; duration = finished - started (AC-32, AC-41)', async () => {
    const stub = stubLlm({ findings: () => [hit(2)] });
    const app = await makeApp(stub);
    const { caseId } = await agentWithCase();

    const { run_id } = (await startCase(app, caseId)).json();
    const run = await waitStatus(app, run_id, 'completed');

    expect(run.finished_at).not.toBeNull();
    expect(run.outcomes).toHaveLength(1);
    expect(run.outcomes[0]).toMatchObject({ case_id: caseId, status: 'scored', pass: true });
    expect(run.duration_ms).toBe(Date.parse(run.finished_at) - Date.parse(run.started_at));
    await app.close();
  });

  it('answers 409 run_in_progress while the agent has any running run and writes no row (AC-34)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);

    // A running SUITE run.
    const a = await agentWithCase();
    const suite = await startSuite(app, a.agentId);
    expect(suite.statusCode).toBe(202);
    const blockedBySuite = await startCase(app, a.caseId);
    expect(blockedBySuite.statusCode).toBe(409);
    expect(blockedBySuite.json().error.code).toBe('run_in_progress');
    expect(await runRows(a.agentId)).toHaveLength(1);

    // A running CASE run of ANOTHER case of the same agent.
    const b = await agentWithCase();
    const second = await addCase(b.agentId, 'case-2');
    expect((await startCase(app, b.caseId)).statusCode).toBe(202);
    const blockedByCase = await startCase(app, second);
    expect(blockedByCase.statusCode).toBe(409);
    expect(blockedByCase.json().error.code).toBe('run_in_progress');
    expect(await runRows(b.agentId)).toHaveLength(1);
    await app.close();
  });

  it('a running case run blocks a suite-run start with 409 and writes no suite run (AC-35)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { agentId, caseId } = await agentWithCase();

    expect((await startCase(app, caseId)).statusCode).toBe(202);
    const res = await startSuite(app, agentId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('run_in_progress');

    const rows = await runRows(agentId);
    expect(rows).toHaveLength(1);
    expect(rows.filter((r) => r.scope === 'suite')).toHaveLength(0);
    await app.close();
  });

  it('a provider without a key answers 422 provider_key_missing and writes no row (AC-36)', async () => {
    const app = await makeApp(undefined, { secrets: new MockSecretsProvider({}) });
    const { agentId, caseId } = await agentWithCase('anthropic');

    const res = await startCase(app, caseId);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('provider_key_missing');
    expect(await runRows(agentId)).toHaveLength(0);
    await app.close();
  });

  it('a case of another workspace, or an unknown id, answers 404 with no row and no model call (AC-37)', async () => {
    const stub = stubLlm();
    const app = await makeApp(stub);
    const { agentId, caseId } = await agentWithCase();

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
    const otherWs = other!.id;
    const service = makeService(stub);

    await expect(service.startCaseRun(otherWs, caseId)).rejects.toMatchObject({ statusCode: 404 });
    const unknown = await startCase(app, randomUUID());
    expect(unknown.statusCode).toBe(404);

    expect(await runRows(agentId)).toHaveLength(0);
    const otherRows = await pg.handle.db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.workspaceId, otherWs));
    expect(otherRows).toEqual([]);
    expect(stub.calls).toHaveLength(0);
    await app.close();
  });

  describe('reaping (AC-38)', () => {
    it('a case run still running 15+ minutes after its start fails interrupted when it is read', async () => {
      const app = await makeApp(stubLlm());
      const { agentId, caseId } = await agentWithCase();
      const runId = await insertRun({
        agentId,
        scope: 'case',
        caseId,
        status: 'running',
        startedAt: ago(16),
      });

      const run = await getRun(app, runId);
      expect(run).toMatchObject({ status: 'failed', error_reason: 'interrupted', scope: 'case' });
      expect(run.finished_at).not.toBeNull();
      await app.close();
    });

    it('a case run still running at boot fails interrupted', async () => {
      const { agentId, caseId } = await agentWithCase();
      const runId = await insertRun({
        agentId,
        scope: 'case',
        caseId,
        status: 'running',
        startedAt: new Date(),
      });

      const app = await makeApp(stubLlm());
      const [row] = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, runId));
      expect(row).toMatchObject({ status: 'failed', errorReason: 'interrupted' });
      expect(row!.finishedAt).not.toBeNull();
      await app.close();
    });
  });

  it('keeps running to a final status when nobody polls (AC-39)', async () => {
    const stub = stubLlm();
    const app = await makeApp(stub);
    const { caseId } = await agentWithCase();
    const { run_id } = (await startCase(app, caseId)).json();

    // No HTTP read until the DB says it is over.
    await waitFor(async () => {
      const [row] = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, run_id));
      return row?.status === 'completed';
    });
    await app.close();
  });

  it('deleting the case mid-run lets the run finish and keeps its outcome (AC-40)', async () => {
    const stub = stubLlm({ gated: true });
    const app = await makeApp(stub);
    const { caseId } = await agentWithCase();
    const { run_id } = (await startCase(app, caseId)).json();
    await waitFor(async () => stub.calls.length >= 1);

    expect((await app.inject({ method: 'DELETE', url: `/eval/cases/${caseId}` })).statusCode).toBe(204);
    stub.releaseAll();

    const run = await waitFor(async () => {
      const [row] = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, run_id));
      return row && row.status !== 'running' ? row : undefined;
    });
    expect(['completed', 'failed']).toContain(run.status);
    const outcomes = await pg.handle.db
      .select()
      .from(t.evalCaseOutcomes)
      .where(eq(t.evalCaseOutcomes.runId, run_id));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.caseId).toBe(caseId);
    await app.close();
  });

  it("the case's last_outcome is the newest outcome of either scope (AC-42)", async () => {
    // Call 0 (suite) finds nothing -> fail; call 1 (case) finds it -> pass; call 2 (suite) -> fail.
    const stub = stubLlm({ findings: (i) => (i === 1 ? [hit(2)] : []) });
    const app = await makeApp(stub);
    const { agentId, caseId } = await agentWithCase();

    const lastPass = async () => {
      const one = (await app.inject({ method: 'GET', url: `/eval/cases/${caseId}` })).json();
      const list = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/cases` })).json();
      expect(list.find((c: { id: string }) => c.id === caseId).last_outcome.pass).toBe(one.last_outcome.pass);
      return one.last_outcome.pass as boolean;
    };

    await waitStatus(app, (await startSuite(app, agentId)).json().run_id, 'completed');
    expect(await lastPass()).toBe(false);
    await waitStatus(app, (await startCase(app, caseId)).json().run_id, 'completed');
    expect(await lastPass()).toBe(true);
    await waitStatus(app, (await startSuite(app, agentId)).json().run_id, 'completed');
    expect(await lastPass()).toBe(false);
    await app.close();
  });

  it('GET /eval/runs/:id of a case run carries scope, case_id and one outcome (AC-43)', async () => {
    const stub = stubLlm();
    const app = await makeApp(stub);
    const { caseId } = await agentWithCase();
    const { run_id } = (await startCase(app, caseId)).json();

    const run = await waitStatus(app, run_id, 'completed');
    expect(run).toMatchObject({ scope: 'case', case_id: caseId });
    expect(run.outcomes).toHaveLength(1);
    await app.close();
  });

  it('every suite run reports scope "suite" and case_id null, pre-existing rows included (AC-44)', async () => {
    const stub = stubLlm();
    const app = await makeApp(stub);
    const { agentId } = await agentWithCase();

    // A row written the way a pre-SPEC-07 row was: no scope, no case_id -> the column defaults.
    const [legacy] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId,
        agentVersion: 1,
        status: 'completed',
        config: { system_prompt: 'p', model: 'm', provider: 'openrouter', strategy: 'single-pass', skills: [] },
        caseIds: [],
        startedAt: ago(60),
        finishedAt: ago(59),
        casesTotal: 1,
      })
      .returning();
    const fresh = (await startSuite(app, agentId)).json();
    await waitStatus(app, fresh.run_id, 'completed');

    for (const id of [legacy!.id, fresh.run_id]) {
      expect(await getRun(app, id)).toMatchObject({ scope: 'suite', case_id: null });
    }
    await app.close();
  });

  describe('suite-only aggregates', () => {
    /** 20 completed suite runs, 5 completed case runs newer than all of them, 1 running case run. */
    async function fixture() {
      const { agentId, caseId } = await agentWithCase();
      const suiteIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        suiteIds.push(await insertRun({ agentId, startedAt: ago(300 - i), recall: 1, precision: 1 }));
      }
      for (let i = 0; i < 5; i++) {
        await insertRun({ agentId, scope: 'case', caseId, startedAt: ago(60 - i) });
      }
      const running = await insertRun({
        agentId,
        scope: 'case',
        caseId,
        status: 'running',
        startedAt: ago(1),
      });
      return { agentId, caseId, suiteIds, running };
    }

    it('the runs list is the 20 newest suite runs followed by the running case run (AC-45)', async () => {
      const app = await makeApp(stubLlm());
      const { agentId, suiteIds, running } = await fixture();

      const runs = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/runs` })).json();
      expect(runs.map((r: { id: string }) => r.id)).toEqual([...suiteIds].reverse().concat(running));
      expect(runs.slice(0, 20).every((r: { scope: string }) => r.scope === 'suite')).toBe(true);
      await app.close();
    });

    it('the dashboard runs equal the runs list (AC-46)', async () => {
      const app = await makeApp(stubLlm());
      const { agentId, suiteIds, running } = await fixture();

      const list = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/runs` })).json();
      const dash = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/dashboard` })).json();
      expect(dash.runs.map((r: { id: string }) => r.id)).toEqual(list.map((r: { id: string }) => r.id));
      expect(dash.runs).toHaveLength(21);
      expect(dash.runs[20].id).toBe(running);
      expect(dash.runs[0].id).toBe(suiteIds[19]);
      await app.close();
    });

    it('the trend and the alert ignore a newer completed case run (AC-47)', async () => {
      const app = await makeApp(stubLlm());
      const { agentId, caseId } = await agentWithCase();
      const s1 = await insertRun({ agentId, startedAt: ago(200), recall: 1, precision: 0.9 });
      const s2 = await insertRun({ agentId, startedAt: ago(100), recall: 1, precision: 0.84 });
      await insertOutcome(s1, caseId, true);
      await insertOutcome(s2, caseId, false);

      const dashboard = async () =>
        (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/dashboard` })).json();
      const before = await dashboard();
      expect(before.alert).not.toBeNull();
      expect(before.trend).toHaveLength(2);

      const caseRun = await insertRun({
        agentId,
        scope: 'case',
        caseId,
        startedAt: ago(10),
        recall: 0,
        precision: 0,
      });
      await insertOutcome(caseRun, caseId, false);

      const after = await dashboard();
      expect(after.trend).toEqual(before.trend);
      expect(after.alert).toEqual(before.alert);
      await app.close();
    });

    it('the overview latest_run is the newest suite run, or null without one (AC-48)', async () => {
      const app = await makeApp(stubLlm());
      const withSuite = await agentWithCase();
      const suiteRun = await insertRun({ agentId: withSuite.agentId, startedAt: ago(120) });
      await insertRun({
        agentId: withSuite.agentId,
        scope: 'case',
        caseId: withSuite.caseId,
        startedAt: ago(5),
      });
      const caseOnly = await agentWithCase();
      await insertRun({
        agentId: caseOnly.agentId,
        scope: 'case',
        caseId: caseOnly.caseId,
        startedAt: ago(5),
      });

      const rows = (await app.inject({ method: 'GET', url: '/eval/overview' })).json();
      const row = (id: string) => rows.find((r: { agent_id: string }) => r.agent_id === id);
      expect(row(withSuite.agentId).latest_run).toMatchObject({ id: suiteRun, scope: 'suite' });
      expect(row(caseOnly.agentId).latest_run).toBeNull();
      await app.close();
    });

    it('comparing a case run answers 422 not_suite_run (AC-49)', async () => {
      const app = await makeApp(stubLlm());
      const { agentId, caseId } = await agentWithCase();
      const suiteRun = await insertRun({ agentId, startedAt: ago(100) });
      const caseRun = await insertRun({ agentId, scope: 'case', caseId, startedAt: ago(50) });

      for (const [a, b] of [
        [caseRun, suiteRun],
        [suiteRun, caseRun],
      ] as const) {
        const res = await app.inject({ method: 'GET', url: `/eval/compare?a=${a}&b=${b}` });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('not_suite_run');
      }
      await app.close();
    });
  });

  it("another workspace's case-run id is a 404 on the run read and on compare (NFR-4)", async () => {
    const stub = stubLlm();
    const app = await makeApp(stub);
    const { agentId, caseId } = await agentWithCase();
    const caseRun = await insertRun({ agentId, scope: 'case', caseId, startedAt: ago(50) });
    const suiteRun = await insertRun({ agentId, startedAt: ago(100) });

    // The HTTP context is the seeded workspace, so the foreign caller is the service.
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant-2' }).returning();
    const otherWs = other!.id;
    const service = makeService(stub);

    await expect(service.getRun(otherWs, caseRun)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.compare(otherWs, caseRun, suiteRun)).rejects.toMatchObject({ statusCode: 404 });
    // The owner still sees it (and the suite comparison guard, not a 404, answers).
    await expect(service.compare(workspaceId, caseRun, suiteRun)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(
      await pg.handle.db
        .select({ id: t.evalSuiteRuns.id })
        .from(t.evalSuiteRuns)
        .where(and(eq(t.evalSuiteRuns.workspaceId, otherWs))),
    ).toEqual([]);
    await app.close();
  });
});
