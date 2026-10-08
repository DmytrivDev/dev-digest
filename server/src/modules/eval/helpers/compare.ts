import type {
  EvalCaseOutcome,
  EvalCompare,
  EvalMetricSet,
  EvalSuiteRun,
} from '@devdigest/shared';
import { MAX_LCS_LINES } from '../constants.js';
import { aggregateRun } from './scoring.js';

/**
 * Pure comparison of two suite runs (SPEC-04 §G): which run is "old", the metrics over
 * the cases both runs contain, config changes, pass/fail flips, and the line diff of
 * the two recorded system prompts. No I/O — callers load the runs and outcomes.
 */

/** What compare reads from a run record. */
export type CompareRun = Pick<EvalSuiteRun, 'id' | 'started_at' | 'cost_usd' | 'config'>;

/** Everything of `EvalCompare` except the two run records and the prompt diff. */
export type RunComparison = Omit<EvalCompare, 'old' | 'new' | 'prompt_diff'>;

export type PromptDiffLine = EvalCompare['prompt_diff'][number];

const startedMs = (run: { started_at: string }): number => Date.parse(run.started_at);

/**
 * The run that started earlier is "old", whatever order the caller named them in
 * (AC-90). Equal start times are broken by id so the answer is still deterministic.
 */
export function orderRuns<T extends { id: string; started_at: string }>(
  a: T,
  b: T,
): { old: T; new: T } {
  const ta = startedMs(a);
  const tb = startedMs(b);
  const aIsOld = ta !== tb && !Number.isNaN(ta) && !Number.isNaN(tb) ? ta < tb : a.id <= b.id;
  return aIsOld ? { old: a, new: b } : { old: b, new: a };
}

const skillsLabel = (skills: readonly { name: string; version: number }[]): string =>
  skills.map((s) => `${s.name}@v${s.version}`).join(', ');

const delta = (oldV: number | null, newV: number | null): number | null =>
  oldV === null || newV === null ? null : newV - oldV;

const metricSet = (outcomes: readonly EvalCaseOutcome[]): EvalMetricSet => {
  const agg = aggregateRun(outcomes);
  return {
    recall: agg.recall,
    precision: agg.precision,
    citation_accuracy: agg.citation_accuracy,
  };
};

/**
 * Compare an old run with a new one. Metrics (AC-91) are recomputed over the cases
 * present in BOTH runs; cases in only one are listed. Deltas are new - old, null when
 * either side is null; the cost delta uses the run-level cost. `flips` lists common
 * cases scored in both runs whose pass result differs (AC-94).
 */
export function compareRuns(
  oldRun: CompareRun,
  newRun: CompareRun,
  oldOutcomes: readonly EvalCaseOutcome[],
  newOutcomes: readonly EvalCaseOutcome[],
): RunComparison {
  const inOld = new Map(oldOutcomes.map((o) => [o.case_id, o]));
  const inNew = new Map(newOutcomes.map((o) => [o.case_id, o]));

  const common = new Set(oldOutcomes.map((o) => o.case_id).filter((id) => inNew.has(id)));
  const commonOld = oldOutcomes.filter((o) => common.has(o.case_id));
  const commonNew = newOutcomes.filter((o) => common.has(o.case_id));

  const metrics = { old: metricSet(commonOld), new: metricSet(commonNew) };

  const configChanges: RunComparison['config_changes'] = [];
  const oc = oldRun.config;
  const nc = newRun.config;
  if (oc.model !== nc.model) configChanges.push({ field: 'model', old: oc.model, new: nc.model });
  if (oc.provider !== nc.provider) {
    configChanges.push({ field: 'provider', old: oc.provider, new: nc.provider });
  }
  if (oc.strategy !== nc.strategy) {
    configChanges.push({ field: 'strategy', old: oc.strategy, new: nc.strategy });
  }
  const oldSkills = skillsLabel(oc.skills);
  const newSkills = skillsLabel(nc.skills);
  if (oldSkills !== newSkills) configChanges.push({ field: 'skills', old: oldSkills, new: newSkills });

  const flips: RunComparison['flips'] = [];
  for (const o of commonOld) {
    const n = inNew.get(o.case_id)!;
    if (o.status !== 'scored' || n.status !== 'scored') continue;
    if (o.pass === null || n.pass === null || o.pass === n.pass) continue;
    flips.push({
      case_id: n.case_id,
      name: n.case_name,
      direction: n.pass ? 'now_passing' : 'now_failing',
    });
  }

  return {
    common_case_ids: [...common],
    only_in_old: oldOutcomes
      .filter((o) => !inNew.has(o.case_id))
      .map((o) => ({ case_id: o.case_id, name: o.case_name })),
    only_in_new: newOutcomes
      .filter((o) => !inOld.has(o.case_id))
      .map((o) => ({ case_id: o.case_id, name: o.case_name })),
    metrics,
    deltas: {
      recall: delta(metrics.old.recall, metrics.new.recall),
      precision: delta(metrics.old.precision, metrics.new.precision),
      citation_accuracy: delta(metrics.old.citation_accuracy, metrics.new.citation_accuracy),
      cost_usd: delta(oldRun.cost_usd, newRun.cost_usd),
    },
    config_changes: configChanges,
    flips,
  };
}

/**
 * Line diff of two system prompts (AC-92). Ported from the client's skill-version diff
 * (`client/.../VersionsTab/helpers.ts`) because the server owns this diff: common
 * prefix and suffix are stripped first, the LCS table runs only over the changed middle,
 * and past {@link MAX_LCS_LINES} on either side the middle degrades to remove-all then
 * add-all (coarser, still true).
 */
export function promptLineDiff(before: string, after: string): PromptDiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const aMid = a.slice(head, a.length - tail);
  const bMid = b.slice(head, b.length - tail);

  const middle =
    aMid.length > MAX_LCS_LINES || bMid.length > MAX_LCS_LINES
      ? [
          ...aMid.map((text): PromptDiffLine => ({ kind: 'removed', text })),
          ...bMid.map((text): PromptDiffLine => ({ kind: 'added', text })),
        ]
      : lcsDiff(aMid, bMid);

  return [
    ...a.slice(0, head).map((text): PromptDiffLine => ({ kind: 'context', text })),
    ...middle,
    ...a.slice(a.length - tail).map((text): PromptDiffLine => ({ kind: 'context', text })),
  ];
}

/** LCS-table diff over two already-trimmed line arrays. */
function lcsDiff(a: string[], b: string[]): PromptDiffLine[] {
  const n = a.length;
  const m = b.length;
  // table[i][j] = length of the LCS of a[i..] and b[j..]
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const out: PromptDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'context', text: a[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'removed', text: a[i++]! });
  while (j < m) out.push({ kind: 'added', text: b[j++]! });
  return out;
}
