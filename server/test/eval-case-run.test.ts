/**
 * The single-case run path (SPEC-07 W4). No database and no network: an in-memory
 * repository stands in for Postgres and a stub LLM records every prompt and every call.
 * Covers AC-28 (the case as of the start), AC-29 (the engine input of a case run equals a
 * suite run's), AC-30 (one engine review, no other model call), AC-31 (code-only scoring),
 * AC-33 (model failure / 120 s -> failed: all_cases_errored), AC-41 (cost) and NFR-3
 * (a never-answering model ends the run within 125 s).
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { EvalCaseCreate, Finding, LLMProvider } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import type { EvalCaseRow } from '../src/db/rows.js';
import type {
  EvalRepository,
  FinishEvalRun,
  InsertEvalCase,
  InsertEvalOutcome,
  InsertEvalRun,
} from '../src/modules/eval/repository.js';
import { EvalService } from '../src/modules/eval/service.js';

const WS = 'ws-1';
const AGENT = 'agent-1';
const FILE = 'src/payments/charge.ts';

/** New-side lines 1-4, line 2 added. */
const diffWith = (addedLine: string) =>
  `+++ b/${FILE}\n@@ -1,3 +1,4 @@\n const a = 1;\n+${addedLine}\n const b = 2;\n const c = 3;\n`;

const EXPECT = { kind: 'must_find', file: FILE, start_line: 2, end_line: 2 } as const;

function finding(start: number): Finding {
  return {
    id: `f-${start}`,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret',
    file: FILE,
    start_line: start,
    end_line: start,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type Mode = 'ok' | 'reject' | 'invalid' | 'hang';

interface Stub {
  llm: LLMProvider;
  /** The full prompt text of every `completeStructured` call so far. */
  calls: string[];
  /** Calls to anything other than `completeStructured` (must stay 0). */
  strayCalls: { count: number };
  releaseAll(): void;
}

/** A recording stub engine LLM; `gated` holds every call until `releaseAll()`. */
function stubLlm(
  opts: { gated?: boolean; findings?: Finding[]; mode?: Mode; costUsd?: number } = {},
): Stub {
  const calls: string[] = [];
  const strayCalls = { count: 0 };
  const waiters: (() => void)[] = [];
  let released = !opts.gated;
  const stray = () => {
    strayCalls.count += 1;
    throw new Error('only completeStructured is expected during an eval run');
  };
  const llm = {
    id: 'openrouter',
    listModels: stray,
    complete: stray,
    async completeStructured(req: { model: string; messages: { content: string }[] }) {
      calls.push(req.messages.map((m) => m.content).join('\n'));
      if (opts.mode === 'hang') return new Promise<never>(() => {});
      if (!released) await new Promise<void>((resolve) => waiters.push(resolve));
      if (opts.mode === 'reject') throw new Error('provider exploded');
      if (opts.mode === 'invalid') throw new Error('Model output failed schema validation');
      return {
        data: { verdict: 'comment', summary: 's', score: 80, findings: opts.findings ?? [] },
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: opts.costUsd ?? 0.01,
        raw: '{}',
        attempts: 1,
      };
    },
  };
  return {
    llm: llm as unknown as LLMProvider,
    calls,
    strayCalls,
    releaseAll: () => {
      released = true;
      for (const w of waiters.splice(0)) w();
    },
  };
}

/** An in-memory stand-in for the slice of `EvalRepository` the service and executor use. */
function fakeRepo() {
  const cases: EvalCaseRow[] = [];
  const outcomes: InsertEvalOutcome[] = [];
  const finished: FinishEvalRun[] = [];
  const insertedRuns: InsertEvalRun[] = [];
  let seq = 0;

  const repo = {
    async caseNamesForAgent(_ws: string, agentId: string) {
      return cases.filter((c) => c.agentId === agentId).map((c) => c.name);
    },
    async insertCase(v: InsertEvalCase) {
      const row: EvalCaseRow = {
        id: `case-${++seq}`,
        workspaceId: v.workspaceId,
        agentId: v.agentId,
        sourceFindingId: v.sourceFindingId,
        origin: v.origin ?? 'finding',
        sourcePrNumber: v.sourcePrNumber,
        sourceRepo: v.sourceRepo,
        labels: v.labels,
        createdAt: new Date(2026, 0, 1, 0, 0, seq),
        name: v.name,
        inputDiff: v.inputDiff,
        inputMeta: v.inputMeta,
        expectedOutput: v.expectedOutput,
        notes: v.notes ?? null,
      };
      cases.push(row);
      return row;
    },
    async getCase(_ws: string, id: string) {
      return cases.find((c) => c.id === id);
    },
    async updateCase(
      _ws: string,
      id: string,
      patch: {
        name?: string;
        notes?: string | null;
        expectedOutput?: unknown;
        inputDiff?: string;
        inputMeta?: unknown;
      },
    ) {
      const row = cases.find((c) => c.id === id);
      if (!row) return undefined;
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.notes !== undefined) row.notes = patch.notes;
      if (patch.expectedOutput !== undefined) row.expectedOutput = patch.expectedOutput;
      if (patch.inputDiff !== undefined) row.inputDiff = patch.inputDiff;
      if (patch.inputMeta !== undefined) row.inputMeta = patch.inputMeta;
      return row;
    },
    async listCases(_ws: string, agentId: string) {
      return cases.filter((c) => c.agentId === agentId);
    },
    async latestOutcomesForCases() {
      return new Map();
    },
    async failStaleRuns() {},
    async runningRun() {
      return undefined;
    },
    async listSuiteRuns() {
      return [];
    },
    async insertRun(v: InsertEvalRun) {
      insertedRuns.push(v);
      return {
        id: `run-${insertedRuns.length}`,
        status: 'running',
        startedAt: new Date(),
        casesTotal: v.casesTotal,
      };
    },
    async insertOutcome(v: InsertEvalOutcome) {
      outcomes.push(v);
    },
    async bumpProgress() {},
    async isRunning() {
      return true;
    },
    async finishRun(_id: string, v: FinishEvalRun) {
      finished.push(v);
      return true;
    },
  };
  return { repo: repo as unknown as EvalRepository, cases, outcomes, finished, insertedRuns };
}

function makeService(repo: EvalRepository, resolveLlm: () => Promise<LLMProvider>) {
  const agent = {
    id: AGENT,
    workspaceId: WS,
    name: 'Security',
    provider: 'openrouter',
    model: 'test-model',
    systemPrompt: 'You are a strict security reviewer.',
    strategy: 'single-pass',
    version: 1,
  };
  return new EvalService({
    repo,
    agents: {
      getById: async () => agent,
      list: async () => [agent],
      linkedSkills: async () => [],
    } as never,
    parseDiff: parseUnifiedDiff,
    resolveLlm,
  });
}

const manualBody = (over: Partial<EvalCaseCreate> = {}): EvalCaseCreate => ({
  name: 'manual-case',
  input_diff: diffWith('const key = "sk_live_xxx";'),
  expectation: EXPECT,
  ...over,
});

/** One case, a service wired to `stub`, and the fake repository behind it. */
async function setup(stub: Stub, body: EvalCaseCreate = manualBody()) {
  const fake = fakeRepo();
  const service = makeService(fake.repo, async () => stub.llm);
  const created = await service.createManualCase(WS, AGENT, body);
  return { ...fake, service, created };
}

async function waitForCalls(stub: Stub, n: number) {
  for (let i = 0; i < 200 && stub.calls.length < n; i++) await new Promise((r) => setTimeout(r, 5));
  expect(stub.calls).toHaveLength(n);
}

// ---------------------------------------------------------------------------

describe('a case run reviews the case as it was at the start (AC-28)', () => {
  it('a mid-run edit of the diff and the expectation reaches neither the prompt nor the outcome', async () => {
    const stub = stubLlm({ gated: true });
    const { service, created, outcomes, insertedRuns } = await setup(
      stub,
      manualBody({ input_diff: diffWith('OLD_LINE'), input_meta: { title: 'OLD_TITLE', body: 'OLD_BODY' } }),
    );

    const started = await service.startCaseRun(WS, created.id);
    expect(insertedRuns[0]).toMatchObject({ scope: 'case', caseId: created.id, casesTotal: 1 });
    await waitForCalls(stub, 1);

    await service.updateCase(WS, created.id, {
      input_diff: diffWith('NEW_LINE'),
      input_meta: { title: 'NEW_TITLE', body: 'NEW_BODY' },
      expectation: { ...EXPECT, kind: 'must_not_flag' },
    });
    stub.releaseAll();
    await started.done;

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]).toContain('OLD_LINE');
    expect(stub.calls[0]).toContain('OLD_TITLE');
    expect(stub.calls[0]).not.toContain('NEW_LINE');
    expect(stub.calls[0]).not.toContain('NEW_TITLE');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.expectation).toEqual(EXPECT);
    expect(outcomes[0]!.kind).toBe('must_find');
    // The edit itself landed for the next run.
    expect((await service.getCase(WS, created.id)).input_diff).toContain('NEW_LINE');
  });
});

describe('the engine input equals a suite run of that case (AC-29)', () => {
  it('a case run and a suite run over the same single case send the same messages', async () => {
    const stub = stubLlm();
    const { service, created } = await setup(stub);

    await (await service.startCaseRun(WS, created.id)).done;
    await (await service.startRun(WS, AGENT)).done;

    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[0]).toBe(stub.calls[1]);
  });

  it('no name, notes, label or source text of a finding-born case reaches the case-run prompt', async () => {
    const SENTINEL = 'ZX-SENTINEL-4471';
    const stub = stubLlm();
    const fake = fakeRepo();
    const service = makeService(fake.repo, async () => stub.llm);
    const row = await fake.repo.insertCase({
      workspaceId: WS,
      agentId: AGENT,
      sourceFindingId: SENTINEL,
      sourcePrNumber: 7,
      sourceRepo: SENTINEL,
      labels: { severity: 'CRITICAL', category: 'security', title: SENTINEL },
      name: `name-${SENTINEL}`,
      inputDiff: diffWith('const key = 1;'),
      inputMeta: { pr_number: 7, title: 'Add charge helper', body: 'Adds the charge helper.' },
      expectedOutput: EXPECT,
      notes: SENTINEL,
    });

    await (await service.startCaseRun(WS, row!.id)).done;

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]).not.toContain(SENTINEL);
  });
});

describe('at most one engine review and no other model call (AC-30)', () => {
  it('a one-hunk case makes exactly one completeStructured call and nothing else', async () => {
    const stub = stubLlm();
    const { service, created, outcomes } = await setup(stub);

    await (await service.startCaseRun(WS, created.id)).done;

    expect(stub.calls).toHaveLength(1);
    expect(stub.strayCalls.count).toBe(0);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: 'scored' });
  });
});

describe('scored by code only, like a suite run (AC-31)', () => {
  it('a finding on the expected range passes must_find and fails must_not_flag, with one call each', async () => {
    const stub = stubLlm({ findings: [finding(2)] });
    const { service, outcomes, finished } = await setup(stub, manualBody({ name: 'find' }));
    const quiet = await service.createManualCase(
      WS,
      AGENT,
      manualBody({ name: 'quiet', expectation: { ...EXPECT, kind: 'must_not_flag' } }),
    );
    const find = (await service.listCases(WS, AGENT)).find((c) => c.name === 'find')!;

    await (await service.startCaseRun(WS, find.id)).done;
    expect(stub.calls).toHaveLength(1);
    await (await service.startCaseRun(WS, quiet.id)).done;
    expect(stub.calls).toHaveLength(2);

    expect(stub.strayCalls.count).toBe(0);
    expect(outcomes.map((o) => [o.caseName, o.kind, o.status, o.pass, o.findingsMatched])).toEqual([
      ['find', 'must_find', 'scored', true, 1],
      ['quiet', 'must_not_flag', 'scored', false, 1],
    ]);
    expect(finished[0]).toMatchObject({ status: 'completed', casesScored: 1, casesPassed: 1 });
    expect(finished[1]).toMatchObject({ status: 'completed', casesScored: 1, casesPassed: 0 });
  });
});

describe('a model failure ends the run failed: all_cases_errored (AC-33)', () => {
  it('a rejecting model: one errored outcome (llm_error) and a failed run', async () => {
    const stub = stubLlm({ mode: 'reject' });
    const { service, created, outcomes, finished } = await setup(stub);

    await (await service.startCaseRun(WS, created.id)).done;

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: 'errored', errorReason: 'llm_error', pass: null });
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      status: 'failed',
      errorReason: 'all_cases_errored',
      casesErrored: 1,
      casesScored: 0,
    });
  });

  it('output that never matched the schema: errored with invalid_output', async () => {
    const stub = stubLlm({ mode: 'invalid' });
    const { service, created, outcomes, finished } = await setup(stub);

    await (await service.startCaseRun(WS, created.id)).done;

    expect(outcomes[0]).toMatchObject({ status: 'errored', errorReason: 'invalid_output' });
    expect(finished[0]).toMatchObject({ status: 'failed', errorReason: 'all_cases_errored' });
  });

  it('a model that never answers: errored with timeout after 120 s', async () => {
    vi.useFakeTimers();
    const stub = stubLlm({ mode: 'hang' });
    const { service, created, outcomes, finished } = await setup(stub);

    const started = await service.startCaseRun(WS, created.id);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(outcomes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await started.done;

    expect(outcomes[0]).toMatchObject({ status: 'errored', errorReason: 'timeout' });
    expect(finished[0]).toMatchObject({ status: 'failed', errorReason: 'all_cases_errored' });
  });
});

describe('a never-answering model ends the case run within 125 s (NFR-3)', () => {
  it('finishRun has been called exactly once after 125 000 ms of simulated time', async () => {
    vi.useFakeTimers();
    const stub = stubLlm({ mode: 'hang' });
    const { service, created, finished } = await setup(stub);

    const started = await service.startCaseRun(WS, created.id);
    expect(finished).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(125_000);

    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ status: 'failed', errorReason: 'all_cases_errored' });
    await started.done;
  });
});

describe('the run cost is the outcome cost (AC-41)', () => {
  it('a scored case costing 0.02 gives a run costing 0.02', async () => {
    const stub = stubLlm({ costUsd: 0.02 });
    const { service, created, finished } = await setup(stub);

    await (await service.startCaseRun(WS, created.id)).done;

    expect(finished[0]).toMatchObject({ status: 'completed', costUsd: 0.02 });
  });

  it('an errored case gives a run with a null cost', async () => {
    const stub = stubLlm({ mode: 'reject', costUsd: 0.02 });
    const { service, created, finished } = await setup(stub);

    await (await service.startCaseRun(WS, created.id)).done;

    expect(finished[0]!.costUsd).toBeNull();
  });
});
