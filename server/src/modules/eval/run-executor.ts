import { reviewPullRequest } from '@devdigest/reviewer-core';
import type {
  EvalCaseInputMeta,
  EvalExpectation,
  EvalRunConfig,
  LLMProvider,
  UnifiedDiff,
} from '@devdigest/shared';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { CASE_DEADLINE_MS } from './constants.js';
import { evalPrDescription, evalTaskLine } from './helpers/prompt.js';
import {
  aggregateRun,
  finalStatus,
  scoreCase,
  type ScorableOutcome,
} from './helpers/scoring.js';
import type { FinishEvalRun, InsertEvalOutcome } from './repository.js';

/**
 * Suite-run executor (SPEC-04 §D). Runs the cases of ONE run, one at a time, through the
 * review engine and stores one outcome per case. Detached from the request that started
 * it (A8): it is a plain promise, not a `JobRunner` job, because the job runner wraps a
 * handler in a 120 s timeout plus retries and would cut a suite run short or rerun it.
 *
 * Ring 3. It imports no adapter and not the composition root: the caller hands it the
 * resolved LLM provider, the parsed-diff function and a store.
 *
 * What a case's review may see (AC-48, AC-49): the case diff, its frozen PR title and
 * body, and the run's recorded config. Nothing else is passed to the engine — in
 * particular nothing from the answer side of a case (its expectation, its tags, where
 * it came from), which is what the run is graded against.
 */

/**
 * The slice of the repository the executor writes through. A port, justified by test
 * substitution (OA §2): the unit test passes an in-memory fake instead of a database.
 */
export interface EvalRunStore {
  insertOutcome(values: InsertEvalOutcome): Promise<void>;
  bumpProgress(runId: string, casesDone: number): Promise<void>;
  /**
   * Whether the run is still `running`. False once the stale reaper failed it — the
   * executor then stops calling the model and writing outcomes for it (cost bound).
   */
  isRunning(runId: string): Promise<boolean>;
  /** Conditional on the run still being `running`; false when it was already reaped. */
  finishRun(runId: string, values: FinishEvalRun): Promise<boolean>;
}

/** A case as it was when the run started — later edits or deletes cannot change it. */
export interface CaseSnapshot {
  id: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseInputMeta;
  expectation: EvalExpectation;
}

export interface EvalRunExecutorDeps {
  store: EvalRunStore;
  parseDiff: (raw: string) => UnifiedDiff;
  /** Epoch milliseconds. Injected so a test can drive it; real code passes `Date.now`. */
  now: () => number;
  /** Per-case deadline; defaults to {@link CASE_DEADLINE_MS}. */
  caseDeadlineMs?: number;
  /** Notified of an unexpected failure of the whole run (never throws into the caller). */
  onError?: (err: unknown) => void;
}

export interface ExecuteInput {
  runId: string;
  startedAt: Date;
  cases: readonly CaseSnapshot[];
  config: EvalRunConfig;
  /** Rendered blocks of the enabled linked skills, in order (already delimiter-wrapped). */
  skillBlocks: readonly string[];
  llm: LLMProvider;
}

/** Why a case errored — `error_reason` of the stored outcome. */
export type CaseErrorReason = 'timeout' | 'invalid_output' | 'llm_error';

/**
 * Classify an engine failure. Matched by name/message rather than class: the engine and
 * the provider adapters throw plain `Error`s, and `TimeoutError` is the app's own
 * (`platform/resilience.ts`). "failed schema validation" is the message the provider
 * adapters raise when the structured output never matched the schema.
 */
export function classifyCaseError(err: unknown): CaseErrorReason {
  const e = err as { name?: unknown; message?: unknown } | null | undefined;
  if (err instanceof TimeoutError || e?.name === 'TimeoutError') return 'timeout';
  if (typeof e?.message === 'string' && e.message.includes('failed schema validation')) {
    return 'invalid_output';
  }
  return 'llm_error';
}

export class EvalRunExecutor {
  private readonly deadlineMs: number;

  constructor(private readonly deps: EvalRunExecutorDeps) {
    this.deadlineMs = deps.caseDeadlineMs ?? CASE_DEADLINE_MS;
  }

  /**
   * Run every case in order and finish the run. Never rejects: a failure of the run as a
   * whole finishes it `failed: interrupted` (an unhandled rejection would take the
   * process down — `server/INSIGHTS.md:18`).
   */
  async execute(input: ExecuteInput): Promise<void> {
    const { store, now } = this.deps;
    const outcomes: ScorableOutcome[] = [];
    let casesDone = 0;

    try {
      for (const c of input.cases) {
        // A run the reaper already failed is abandoned: no further paid model calls.
        if (!(await store.isRunning(input.runId))) return;
        const scorable = await this.runCase(input, c);
        if (!scorable) return;
        outcomes.push(scorable);
        casesDone += 1;
        await store.bumpProgress(input.runId, casesDone);
      }

      const agg = aggregateRun(outcomes);
      const verdict = finalStatus(outcomes);
      const finishedAt = new Date(now());
      await store.finishRun(input.runId, {
        status: verdict.status,
        errorReason: verdict.error_reason,
        finishedAt,
        casesDone,
        casesPassed: agg.cases_passed,
        casesScored: agg.cases_scored,
        casesErrored: agg.cases_errored,
        recall: agg.recall,
        precision: agg.precision,
        citationAccuracy: agg.citation_accuracy,
        costUsd: agg.cost_usd,
        durationMs: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
      });
    } catch (err) {
      this.deps.onError?.(err);
      await this.failRun(input, outcomes, casesDone);
    }
  }

  /**
   * One case: review, score, store. A model failure is an `errored` outcome, not a throw.
   * Returns null, storing nothing, when the run was reaped while the case was in flight.
   */
  private async runCase(input: ExecuteInput, c: CaseSnapshot): Promise<ScorableOutcome | null> {
    const { store, now, parseDiff } = this.deps;
    const startedMs = now();
    const deadlineAt = startedMs + this.deadlineMs;

    const base = {
      runId: input.runId,
      caseId: c.id,
      caseName: c.name,
      kind: c.expectation.kind,
      expectation: c.expectation,
    } as const;

    let row: InsertEvalOutcome;
    let scorable: ScorableOutcome;
    try {
      const diff = parseDiff(c.inputDiff);
      const { config } = input;
      const outcome = await withTimeout(
        reviewPullRequest({
          systemPrompt: config.system_prompt,
          model: config.model,
          diff,
          llm: input.llm,
          strategy: config.strategy,
          ...(input.skillBlocks.length > 0 ? { skills: [...input.skillBlocks] } : {}),
          prDescription: evalPrDescription(c.inputMeta),
          task: evalTaskLine(c.inputMeta),
          sessionId: `eval:${input.runId}:${c.id}`,
          // A timed-out call keeps running in the background (no port carries an
          // AbortSignal); this stops a LATER chunk of the same case from starting.
          checkCancelled: () => {
            if (now() > deadlineAt) throw new TimeoutError(this.deadlineMs);
          },
        }),
        this.deadlineMs,
      );

      const scored = scoreCase(c.expectation, outcome.review.findings, outcome.dropped.length);
      row = {
        ...base,
        status: 'scored',
        pass: scored.pass,
        errorReason: null,
        findingsMatched: scored.findings_matched,
        findingsTotal: scored.findings_total,
        groundingKept: scored.grounding_kept,
        groundingTotal: scored.grounding_total,
        durationMs: Math.max(0, now() - startedMs),
        costUsd: outcome.costUsd,
        actual: scored.actual,
      };
      scorable = {
        kind: c.expectation.kind,
        status: 'scored',
        pass: scored.pass,
        findings_matched: scored.findings_matched,
        findings_total: scored.findings_total,
        grounding_kept: scored.grounding_kept,
        grounding_total: scored.grounding_total,
        cost_usd: outcome.costUsd,
      };
    } catch (err) {
      row = {
        ...base,
        status: 'errored',
        pass: null,
        errorReason: classifyCaseError(err),
        findingsMatched: 0,
        findingsTotal: 0,
        groundingKept: 0,
        groundingTotal: 0,
        durationMs: Math.max(0, now() - startedMs),
        costUsd: null,
        actual: [],
      };
      scorable = {
        kind: c.expectation.kind,
        status: 'errored',
        pass: null,
        findings_matched: 0,
        findings_total: 0,
        grounding_kept: 0,
        grounding_total: 0,
        cost_usd: null,
      };
    }

    if (!(await store.isRunning(input.runId))) return null;
    await store.insertOutcome(row);
    return scorable;
  }

  /** Last resort: finish the run as `failed: interrupted`; swallow a second failure. */
  private async failRun(
    input: ExecuteInput,
    outcomes: readonly ScorableOutcome[],
    casesDone: number,
  ): Promise<void> {
    try {
      const agg = aggregateRun(outcomes);
      const finishedAt = new Date(this.deps.now());
      await this.deps.store.finishRun(input.runId, {
        status: 'failed',
        errorReason: 'interrupted',
        finishedAt,
        casesDone,
        casesPassed: agg.cases_passed,
        casesScored: agg.cases_scored,
        casesErrored: agg.cases_errored,
        recall: agg.recall,
        precision: agg.precision,
        citationAccuracy: agg.citation_accuracy,
        costUsd: agg.cost_usd,
        durationMs: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
      });
    } catch (err) {
      this.deps.onError?.(err);
    }
  }
}
