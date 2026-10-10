import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { EvalService } from '../src/modules/eval/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-compare] Docker not available — skipping integration tests.');
}

/**
 * SPEC-04 compare, overview and dashboard reads (AC-79, AC-82/84 data, AC-85 wiring,
 * AC-90…AC-97, AC-103). Runs and outcomes are inserted directly — no engine involved.
 */

const FILE = 'src/config.ts';
const MIN = 60_000;

type Kind = 'must_find' | 'must_not_flag';

d('eval compare / overview / dashboard (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const t0 = Date.now() - 6 * 60 * MIN;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
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

  function makeService() {
    return new EvalService({
      repo: new EvalRepository(pg.handle.db),
      agents: new AgentsRepository(pg.handle.db),
      parseDiff: parseUnifiedDiff,
      resolveLlm: async () => {
        throw new Error('no model call expected');
      },
    });
  }

  async function newAgent(): Promise<string> {
    const agent = await new AgentsRepository(pg.handle.db).insert({
      workspaceId,
      name: `Compare ${Math.random().toString(36).slice(2, 8)}`,
      provider: 'openrouter',
      model: 'test-model',
      systemPrompt: 'p',
    });
    return agent.id;
  }

  interface RunOpts {
    startedAtMin: number;
    status?: 'running' | 'completed' | 'failed';
    prompt?: string;
    model?: string;
    version?: number;
    recall?: number | null;
    precision?: number | null;
    citation?: number | null;
    cost?: number | null;
  }

  async function addRun(agentId: string, o: RunOpts): Promise<string> {
    const status = o.status ?? 'completed';
    const startedAt = new Date(t0 + o.startedAtMin * MIN);
    const [row] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId,
        agentVersion: o.version ?? 1,
        status,
        errorReason: status === 'failed' ? 'all_cases_errored' : null,
        config: {
          system_prompt: o.prompt ?? 'line one\nline two',
          model: o.model ?? 'm1',
          provider: 'openrouter',
          strategy: 'single-pass',
          skills: [],
        },
        caseIds: [],
        startedAt,
        finishedAt: status === 'running' ? null : new Date(startedAt.getTime() + MIN),
        casesTotal: 1,
        casesDone: status === 'running' ? 0 : 1,
        recall: o.recall ?? null,
        precision: o.precision ?? null,
        citationAccuracy: o.citation ?? null,
        costUsd: o.cost ?? null,
        durationMs: status === 'running' ? null : MIN,
      })
      .returning();
    return row!.id;
  }

  async function addOutcome(
    runId: string,
    caseId: string,
    name: string,
    kind: Kind,
    pass: boolean,
    findingsMatched = 0,
  ) {
    await pg.handle.db.insert(t.evalCaseOutcomes).values({
      runId,
      caseId,
      caseName: name,
      kind,
      expectation: { kind, file: FILE, start_line: 2, end_line: 2 },
      status: 'scored',
      pass,
      errorReason: null,
      findingsMatched,
      findingsTotal: findingsMatched,
      groundingKept: findingsMatched,
      groundingTotal: findingsMatched,
      durationMs: 10,
      costUsd: 0.01,
      actual: [],
    });
  }

  // ===========================================================================

  describe('compare', () => {
    it('recomputes over the common cases only and lists the others (AC-91)', async () => {
      const app = await makeApp();
      const agentId = await newAgent();
      const [c1, c2, c3, c4] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as [
        string,
        string,
        string,
        string,
      ];
      const r1 = await addRun(agentId, { startedAtMin: 0, cost: 0.03 });
      const r2 = await addRun(agentId, { startedAtMin: 10, cost: 0.05 });

      await addOutcome(r1, c1, 'one', 'must_find', true);
      await addOutcome(r1, c2, 'two', 'must_find', true);
      await addOutcome(r1, c3, 'three', 'must_not_flag', true);
      await addOutcome(r2, c2, 'two', 'must_find', false);
      await addOutcome(r2, c3, 'three', 'must_not_flag', true);
      await addOutcome(r2, c4, 'four', 'must_find', true);

      const res = await app.inject({ method: 'GET', url: `/eval/compare?a=${r1}&b=${r2}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect([...body.common_case_ids].sort()).toEqual([c2, c3].sort());
      expect(body.only_in_old).toEqual([{ case_id: c1, name: 'one' }]);
      expect(body.only_in_new).toEqual([{ case_id: c4, name: 'four' }]);
      // Over {two, three}: recall 1/1 before, 0/1 after.
      expect(body.metrics.old.recall).toBe(1);
      expect(body.metrics.new.recall).toBe(0);
      expect(body.deltas.recall).toBe(-1);
      expect(body.deltas.cost_usd).toBeCloseTo(0.02);
      expect(body.flips).toEqual([{ case_id: c2, name: 'two', direction: 'now_failing' }]);
      // The two run records carry no outcomes.
      expect(body.old.outcomes).toBeUndefined();
      expect(body.new.outcomes).toBeUndefined();
      await app.close();
    });

    it('treats the earlier run as old whatever order the ids are given in (AC-90)', async () => {
      const app = await makeApp();
      const agentId = await newAgent();
      const early = await addRun(agentId, { startedAtMin: 0 });
      const late = await addRun(agentId, { startedAtMin: 5, model: 'm2' });

      for (const [a, b] of [
        [early, late],
        [late, early],
      ] as const) {
        const body = (await app.inject({ method: 'GET', url: `/eval/compare?a=${a}&b=${b}` })).json();
        expect(body.old.id).toBe(early);
        expect(body.new.id).toBe(late);
        expect(body.config_changes).toEqual([{ field: 'model', old: 'm1', new: 'm2' }]);
      }
      await app.close();
    });

    it('carries the system prompt line diff (AC-92)', async () => {
      const app = await makeApp();
      const agentId = await newAgent();
      const a = await addRun(agentId, { startedAtMin: 0, prompt: 'line one\nline two' });
      const b = await addRun(agentId, { startedAtMin: 5, prompt: 'line one\nextra line\nline two' });
      const body = (await app.inject({ method: 'GET', url: `/eval/compare?a=${a}&b=${b}` })).json();
      expect(body.prompt_diff).toEqual([
        { kind: 'context', text: 'line one' },
        { kind: 'added', text: 'extra line' },
        { kind: 'context', text: 'line two' },
      ]);
      await app.close();
    });

    it('rejects runs of different agents with 422 different_agents (AC-95)', async () => {
      const app = await makeApp();
      const a = await addRun(await newAgent(), { startedAtMin: 0 });
      const b = await addRun(await newAgent(), { startedAtMin: 5 });
      const res = await app.inject({ method: 'GET', url: `/eval/compare?a=${a}&b=${b}` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('different_agents');
      await app.close();
    });

    it('rejects a run that is not completed with 409 run_not_completed (AC-96)', async () => {
      const app = await makeApp();
      const agentId = await newAgent();
      const done = await addRun(agentId, { startedAtMin: 0 });
      const failed = await addRun(agentId, { startedAtMin: 5, status: 'failed' });
      const running = await addRun(agentId, { startedAtMin: 10, status: 'running' });

      for (const other of [failed, running]) {
        const res = await app.inject({ method: 'GET', url: `/eval/compare?a=${done}&b=${other}` });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('run_not_completed');
      }
      // Cleanup: a leftover `running` row would be reaped by the next buildApp anyway.
      await pg.handle.db.delete(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, running));
      await app.close();
    });

    it('rejects comparing a run with itself with 422 same_run (AC-97)', async () => {
      const app = await makeApp();
      const a = await addRun(await newAgent(), { startedAtMin: 0 });
      const res = await app.inject({ method: 'GET', url: `/eval/compare?a=${a}&b=${a}` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('same_run');
      await app.close();
    });

    it('answers 404 for an unknown run and 422 for a malformed query', async () => {
      const app = await makeApp();
      const a = await addRun(await newAgent(), { startedAtMin: 0 });
      const missing = await app.inject({
        method: 'GET',
        url: `/eval/compare?a=${a}&b=${randomUUID()}`,
      });
      expect(missing.statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/eval/compare' })).statusCode).toBe(422);
      expect((await app.inject({ method: 'GET', url: `/eval/compare?a=${a}&b=nope` })).statusCode).toBe(422);
      await app.close();
    });
  });

  describe('overview', () => {
    it('lists every workspace agent, including one with no cases, with its newest run (AC-79)', async () => {
      const app = await makeApp();
      const emptyAgent = await newAgent();
      const runAgent = await newAgent();
      await addRun(runAgent, { startedAtMin: 0, recall: 0.5 });
      const newest = await addRun(runAgent, { startedAtMin: 9, status: 'failed' });
      await pg.handle.db.insert(t.evalCases).values({
        workspaceId,
        agentId: runAgent,
        sourcePrNumber: 1,
        sourceRepo: 'acme/x',
        labels: { severity: 'CRITICAL', category: 'security', title: 't' },
        name: 'only-case',
        inputDiff: 'diff',
        inputMeta: { pr_number: 1, title: 't', body: null },
        expectedOutput: { kind: 'must_find', file: FILE, start_line: 2, end_line: 2 },
      });

      const rows = (await app.inject({ method: 'GET', url: '/eval/overview' })).json() as {
        agent_id: string;
        cases_total: number;
        latest_run: { id: string; status: string } | null;
      }[];

      const agents = await pg.handle.db
        .select({ id: t.agents.id })
        .from(t.agents)
        .where(eq(t.agents.workspaceId, workspaceId));
      expect(rows.map((r) => r.agent_id).sort()).toEqual(agents.map((a) => a.id).sort());

      const empty = rows.find((r) => r.agent_id === emptyAgent)!;
      expect(empty).toMatchObject({ cases_total: 0, latest_run: null });
      const withRuns = rows.find((r) => r.agent_id === runAgent)!;
      expect(withRuns.cases_total).toBe(1);
      expect(withRuns.latest_run).toMatchObject({ id: newest, status: 'failed' });
      await app.close();
    });
  });

  describe('dashboard', () => {
    it('returns the regression alert for a 0.06 precision drop, with the cases that now fail (AC-85)', async () => {
      const app = await makeApp();
      const agentId = await newAgent();
      const keep = randomUUID();
      const broke = randomUUID();
      const p1 = await addRun(agentId, {
        startedAtMin: 0,
        version: 1,
        recall: 1,
        precision: 0.9,
        citation: 1,
      });
      const p2 = await addRun(agentId, {
        startedAtMin: 10,
        version: 2,
        recall: 1,
        precision: 0.84,
        citation: 1,
      });
      await addOutcome(p1, keep, 'keeps-passing', 'must_find', true);
      await addOutcome(p1, broke, 'starts-failing', 'must_not_flag', true);
      await addOutcome(p2, keep, 'keeps-passing', 'must_find', true);
      await addOutcome(p2, broke, 'starts-failing', 'must_not_flag', false, 1);

      const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/dashboard` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agent).toMatchObject({ id: agentId, model: 'test-model', provider: 'openrouter' });
      expect(body.runs.map((r: { id: string }) => r.id)).toEqual([p2, p1]);
      expect(body.trend.map((p: { precision: number }) => p.precision)).toEqual([0.9, 0.84]);
      expect(body.alert).toEqual({
        drops: [
          { metric: 'precision', old_value: 0.9, new_value: 0.84, old_version: 1, new_version: 2 },
        ],
        now_failing: [{ case_id: broke, name: 'starts-failing' }],
      });
      await app.close();
    });

    it('has no alert without a drop, with one run, or with an empty history', async () => {
      const app = await makeApp();
      const steady = await newAgent();
      await addRun(steady, { startedAtMin: 0, recall: 1, precision: 0.9, citation: 1 });
      await addRun(steady, { startedAtMin: 5, recall: 1, precision: 0.89, citation: 1 });
      const single = await newAgent();
      await addRun(single, { startedAtMin: 0, recall: 1, precision: 0.5, citation: 1 });
      const none = await newAgent();

      for (const agentId of [steady, single, none]) {
        const body = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/dashboard` })).json();
        expect(body.alert).toBeNull();
      }
      const empty = (await app.inject({ method: 'GET', url: `/agents/${none}/eval/dashboard` })).json();
      expect(empty).toMatchObject({ runs: [], trend: [], cases_total: 0 });
      await app.close();
    });

    it('caps runs at 20 newest first and the trend at those, oldest first (AC-82, AC-84)', async () => {
      const app = await makeApp();
      const agentId = await newAgent();
      const ids: string[] = [];
      for (let i = 0; i < 22; i++) {
        ids.push(await addRun(agentId, { startedAtMin: i, recall: 1, precision: 1, citation: 1 }));
      }
      const body = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval/dashboard` })).json();
      expect(body.runs).toHaveLength(20);
      expect(body.runs[0].id).toBe(ids[21]);
      expect(body.runs[19].id).toBe(ids[2]);
      expect(body.trend).toHaveLength(20);
      const times = body.trend.map((p: { started_at: string }) => Date.parse(p.started_at));
      expect(times).toEqual([...times].sort((x, y) => x - y));
      await app.close();
    });

    it('answers 404 for an unknown agent', async () => {
      const app = await makeApp();
      const res = await app.inject({ method: 'GET', url: `/agents/${randomUUID()}/eval/dashboard` });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('workspace scoping (AC-103)', () => {
    it('never shows another workspace compare, overview or dashboard data', async () => {
      const agentId = await newAgent();
      const a = await addRun(agentId, { startedAtMin: 0 });
      const b = await addRun(agentId, { startedAtMin: 5 });

      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
      const otherWs = other!.id;
      const service = makeService();

      await expect(service.compare(otherWs, a, b)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.dashboard(otherWs, agentId)).rejects.toMatchObject({ statusCode: 404 });
      expect(await service.overview(otherWs)).toEqual([]);

      // The owning workspace is unaffected.
      expect((await service.compare(workspaceId, a, b)).old.id).toBe(a);
    });
  });
});
