import type { EvalAlert, EvalCaseOutcome, EvalSuiteRun } from '@devdigest/shared';
import { REGRESSION_DROP, REGRESSION_EPSILON } from '../constants.js';

/**
 * Regression alert of an agent (SPEC-04 AC-85) — pure; callers load the runs.
 */

/** What the alert reads from a run record. */
export type AlertRun = Pick<
  EvalSuiteRun,
  'id' | 'agent_version' | 'recall' | 'precision' | 'citation_accuracy'
>;

const METRICS = ['recall', 'precision', 'citation_accuracy'] as const;

/**
 * Compare the latest completed run with the one before it. A metric is a drop when both
 * values are non-null and the latest is at least {@link REGRESSION_DROP} below the
 * previous (an epsilon keeps a drop of exactly 0.02 counting despite float error).
 * Null when there are fewer than two completed runs or no metric dropped. When it
 * fires, `now_failing` lists the cases that passed in the previous run and fail now.
 *
 * `completedRunsNewestFirst` must hold only `completed` runs; `outcomesOf` returns the
 * stored outcomes of one of them.
 */
export function regressionAlert(
  completedRunsNewestFirst: readonly AlertRun[],
  outcomesOf: (runId: string) => readonly EvalCaseOutcome[],
): EvalAlert | null {
  const [latest, previous] = completedRunsNewestFirst;
  if (!latest || !previous) return null;

  const drops: EvalAlert['drops'] = [];
  for (const metric of METRICS) {
    const before = previous[metric];
    const now = latest[metric];
    if (before === null || now === null) continue;
    if (before - now >= REGRESSION_DROP - REGRESSION_EPSILON) {
      drops.push({
        metric,
        old_value: before,
        new_value: now,
        old_version: previous.agent_version,
        new_version: latest.agent_version,
      });
    }
  }
  if (drops.length === 0) return null;

  const before = new Map(outcomesOf(previous.id).map((o) => [o.case_id, o]));
  const nowFailing: EvalAlert['now_failing'] = [];
  for (const o of outcomesOf(latest.id)) {
    const was = before.get(o.case_id);
    if (was?.status === 'scored' && was.pass === true && o.status === 'scored' && o.pass === false) {
      nowFailing.push({ case_id: o.case_id, name: o.case_name });
    }
  }

  return { drops, now_failing: nowFailing };
}
