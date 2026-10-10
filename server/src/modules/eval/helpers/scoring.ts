import type {
  EvalActualFinding,
  EvalCaseOutcome,
  EvalExpectation,
  EvalRunErrorReason,
  EvalRunStatus,
  Finding,
} from '@devdigest/shared';

/**
 * Pure scoring of eval cases and runs (SPEC-04 §E). Type imports only: scoring makes
 * no model call and touches no I/O (AC-74), and the file name sits under `helpers/` so
 * `core-not-to-io` keeps it that way.
 */

/** The outcome fields scoring produces for a case the engine reviewed successfully. */
export interface ScoredCase {
  status: 'scored';
  pass: boolean;
  findings_matched: number;
  findings_total: number;
  grounding_kept: number;
  grounding_total: number;
  actual: EvalActualFinding[];
}

/** What `aggregateRun` reads from a stored outcome. */
export type ScorableOutcome = Pick<
  EvalCaseOutcome,
  | 'kind'
  | 'status'
  | 'pass'
  | 'findings_matched'
  | 'findings_total'
  | 'grounding_kept'
  | 'grounding_total'
  | 'cost_usd'
>;

export interface RunAggregate {
  cases_passed: number;
  cases_scored: number;
  cases_errored: number;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cost_usd: number | null;
}

/**
 * Whether a grounded finding matches an expectation (AC-65): same file and an inclusive
 * line overlap, no tolerance. Severity, category and title are ignored. Bounds are
 * normalised the way the grounding gate does, so a reversed range behaves the same.
 */
export function findingMatches(
  f: Pick<Finding, 'file' | 'start_line' | 'end_line'>,
  exp: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>,
): boolean {
  if (f.file !== exp.file) return false;
  const fLo = Math.min(f.start_line, f.end_line);
  const fHi = Math.max(f.start_line, f.end_line);
  const eLo = Math.min(exp.start_line, exp.end_line);
  const eHi = Math.max(exp.start_line, exp.end_line);
  return fLo <= eHi && eLo <= fHi;
}

/**
 * Score one case from the findings that SURVIVED grounding (AC-66) and the number the
 * gate dropped. `must_find` passes iff at least one finding matches (AC-67);
 * `must_not_flag` passes iff none does (AC-68).
 */
export function scoreCase(
  exp: EvalExpectation,
  kept: readonly Finding[],
  droppedCount: number,
): ScoredCase {
  const matched = kept.filter((f) => findingMatches(f, exp)).length;
  return {
    status: 'scored',
    pass: exp.kind === 'must_find' ? matched >= 1 : matched === 0,
    findings_matched: matched,
    findings_total: kept.length,
    grounding_kept: kept.length,
    grounding_total: kept.length + droppedCount,
    actual: kept.map((f) => ({
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
      severity: f.severity,
      category: f.category,
      title: f.title,
    })),
  };
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/**
 * Run-level counts and metrics over a run's outcomes. Errored outcomes are excluded from
 * every count and metric (AC-73). A metric whose denominator is 0 is null (AC-72).
 *
 * - recall (AC-69): passed `must_find` / scored `must_find`.
 * - precision (AC-70): 1 - (grounded findings overlapping a `must_not_flag` expectation)
 *   / (all grounded findings of scored cases). Per-case reading: a case's findings are
 *   counted only against that case's own expectation (`findings_matched` of a
 *   `must_not_flag` case) — the form that also decomposes over a subset of cases, which
 *   compare needs (AC-91).
 * - citation accuracy (AC-71): sum kept / sum (kept + dropped).
 * - cost (AC-75): sum of known case costs; null if any SCORED case has none, or if no
 *   case reported a cost at all (missing data is not "$0.00").
 */
export function aggregateRun(outcomes: readonly ScorableOutcome[]): RunAggregate {
  const scored = outcomes.filter((o) => o.status === 'scored');
  const mustFind = scored.filter((o) => o.kind === 'must_find');
  const mustNotFlag = scored.filter((o) => o.kind === 'must_not_flag');

  const findingsTotal = scored.reduce((s, o) => s + o.findings_total, 0);
  const flagged = mustNotFlag.reduce((s, o) => s + o.findings_matched, 0);
  const keptTotal = scored.reduce((s, o) => s + o.grounding_kept, 0);
  const groundingTotal = scored.reduce((s, o) => s + o.grounding_total, 0);

  const costs = outcomes.map((o) => o.cost_usd).filter((c): c is number => c !== null);
  const scoredMissingCost = scored.some((o) => o.cost_usd === null);

  const precisionLoss = ratio(flagged, findingsTotal);

  return {
    cases_passed: scored.filter((o) => o.pass === true).length,
    cases_scored: scored.length,
    cases_errored: outcomes.length - scored.length,
    recall: ratio(mustFind.filter((o) => o.pass === true).length, mustFind.length),
    precision: precisionLoss === null ? null : 1 - precisionLoss,
    citation_accuracy: ratio(keptTotal, groundingTotal),
    cost_usd:
      scoredMissingCost || costs.length === 0 ? null : costs.reduce((s, c) => s + c, 0),
  };
}

/**
 * Final status of a run whose cases are all processed (AC-56, AC-57): `completed` when
 * at least one case was scored, else `failed: all_cases_errored`.
 */
export function finalStatus(
  outcomes: readonly Pick<EvalCaseOutcome, 'status'>[],
):
  | { status: Extract<EvalRunStatus, 'completed'>; error_reason: null }
  | { status: Extract<EvalRunStatus, 'failed'>; error_reason: Extract<EvalRunErrorReason, 'all_cases_errored'> } {
  return outcomes.some((o) => o.status === 'scored')
    ? { status: 'completed', error_reason: null }
    : { status: 'failed', error_reason: 'all_cases_errored' };
}
