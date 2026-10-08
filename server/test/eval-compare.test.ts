/**
 * Eval compare, prompt diff and regression alert (SPEC-04 §F, §G) — pure, no database.
 * AC-85, AC-90, AC-92, AC-93, AC-94 (+ the unit half of AC-91).
 */
import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalRunConfig } from '@devdigest/shared';
import {
  compareRuns,
  orderRuns,
  promptLineDiff,
  type CompareRun,
} from '../src/modules/eval/helpers/compare.js';
import { regressionAlert, type AlertRun } from '../src/modules/eval/helpers/alert.js';

const config = (over: Partial<EvalRunConfig> = {}): EvalRunConfig => ({
  system_prompt: 'You are a reviewer.',
  model: 'gpt-4.1',
  provider: 'openai',
  strategy: 'auto',
  skills: [],
  ...over,
});

const run = (id: string, startedAt: string, over: Partial<CompareRun> = {}): CompareRun => ({
  id,
  started_at: startedAt,
  cost_usd: 0.1,
  config: config(),
  ...over,
});

let seq = 0;
const outcome = (caseId: string, over: Partial<EvalCaseOutcome> = {}): EvalCaseOutcome => ({
  case_id: caseId,
  case_name: `case-${caseId}`,
  kind: 'must_find',
  expectation: { kind: 'must_find', file: 'a.ts', start_line: 1, end_line: 2 },
  status: 'scored',
  pass: true,
  error_reason: null,
  findings_matched: 1,
  findings_total: 1,
  grounding_kept: 1,
  grounding_total: 1,
  duration_ms: 100 + seq++,
  cost_usd: 0.01,
  actual: [],
  ...over,
});

describe('orderRuns (AC-90)', () => {
  const early = run('b-run', '2026-10-01T10:00:00.000Z');
  const late = run('a-run', '2026-10-02T10:00:00.000Z');

  it('treats the earlier run as old whatever the argument order', () => {
    expect(orderRuns(early, late)).toEqual({ old: early, new: late });
    expect(orderRuns(late, early)).toEqual({ old: early, new: late });
  });

  it('breaks a tie on start time by id, deterministically', () => {
    const x = run('x', '2026-10-01T10:00:00.000Z');
    const y = run('y', '2026-10-01T10:00:00.000Z');
    expect(orderRuns(x, y)).toEqual(orderRuns(y, x));
    expect(orderRuns(y, x).old.id).toBe('x');
  });
});

describe('compareRuns', () => {
  const oldRun = run('r1', '2026-10-01T00:00:00.000Z', { cost_usd: 0.1 });
  const newRun = run('r2', '2026-10-02T00:00:00.000Z', { cost_usd: 0.15 });

  it('computes metrics over the common cases only and lists the rest (AC-91)', () => {
    const oldOutcomes = [
      outcome('1', { pass: false }), // only in old
      outcome('2', { pass: true }),
      outcome('3', { pass: false }),
    ];
    const newOutcomes = [
      outcome('2', { pass: true }),
      outcome('3', { pass: true }),
      outcome('4', { pass: false }), // only in new
    ];
    const r = compareRuns(oldRun, newRun, oldOutcomes, newOutcomes);

    expect(r.common_case_ids.sort()).toEqual(['2', '3']);
    expect(r.only_in_old).toEqual([{ case_id: '1', name: 'case-1' }]);
    expect(r.only_in_new).toEqual([{ case_id: '4', name: 'case-4' }]);
    // recall over {2,3}: old 1/2, new 2/2
    expect(r.metrics.old.recall).toBe(0.5);
    expect(r.metrics.new.recall).toBe(1);
    expect(r.deltas.recall).toBe(0.5);
  });

  it('deltas are new - old, null when either side is null; cost uses run-level cost', () => {
    const r = compareRuns(
      oldRun,
      newRun,
      [outcome('1', { kind: 'must_not_flag', findings_total: 0, findings_matched: 0, grounding_kept: 0, grounding_total: 0 })],
      [outcome('1')],
    );
    expect(r.deltas.recall).toBeNull(); // old has no must_find case
    expect(r.deltas.cost_usd).toBeCloseTo(0.05, 10);

    const noCost = compareRuns({ ...oldRun, cost_usd: null }, newRun, [], []);
    expect(noCost.deltas.cost_usd).toBeNull();
  });

  it('a model change yields exactly one config entry; identical configs none (AC-93)', () => {
    const changed = compareRuns(
      oldRun,
      { ...newRun, config: config({ model: 'gpt-5' }) },
      [],
      [],
    );
    expect(changed.config_changes).toEqual([{ field: 'model', old: 'gpt-4.1', new: 'gpt-5' }]);

    expect(compareRuns(oldRun, newRun, [], []).config_changes).toEqual([]);
  });

  it('reports provider, strategy and skill changes, skills as name@vN in order (AC-93)', () => {
    const r = compareRuns(
      { ...oldRun, config: config({ skills: [{ name: 'sec', version: 1 }] }) },
      {
        ...newRun,
        config: config({
          provider: 'anthropic',
          strategy: 'map-reduce',
          skills: [
            { name: 'sec', version: 2 },
            { name: 'perf', version: 1 },
          ],
        }),
      },
      [],
      [],
    );
    expect(r.config_changes.map((c) => c.field)).toEqual(['provider', 'strategy', 'skills']);
    expect(r.config_changes.find((c) => c.field === 'skills')).toEqual({
      field: 'skills',
      old: 'sec@v1',
      new: 'sec@v2, perf@v1',
    });
  });

  it('lists flips in both directions among common scored cases (AC-94)', () => {
    const r = compareRuns(
      oldRun,
      newRun,
      [
        outcome('a', { pass: false }),
        outcome('b', { pass: true }),
        outcome('c', { pass: true }),
        outcome('d', { status: 'errored', pass: null, cost_usd: null }),
      ],
      [
        outcome('a', { pass: true }),
        outcome('b', { pass: false }),
        outcome('c', { pass: true }),
        outcome('d', { pass: true }),
      ],
    );
    expect(r.flips).toEqual([
      { case_id: 'a', name: 'case-a', direction: 'now_passing' },
      { case_id: 'b', name: 'case-b', direction: 'now_failing' },
    ]);
  });
});

describe('promptLineDiff (AC-92)', () => {
  it('one inserted line yields exactly one added line, the rest context', () => {
    const d = promptLineDiff('one\ntwo\nthree', 'one\ntwo\nnew line\nthree');
    expect(d.filter((l) => l.kind === 'added')).toEqual([{ kind: 'added', text: 'new line' }]);
    expect(d.filter((l) => l.kind === 'removed')).toEqual([]);
    expect(d.filter((l) => l.kind === 'context').map((l) => l.text)).toEqual(['one', 'two', 'three']);
  });

  it('identical prompts are all context', () => {
    const d = promptLineDiff('a\nb', 'a\nb');
    expect(d.every((l) => l.kind === 'context')).toBe(true);
    expect(d).toHaveLength(2);
  });

  it('a changed line is a removal plus an addition', () => {
    const d = promptLineDiff('a\nold\nc', 'a\nnew\nc');
    expect(d).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'old' },
      { kind: 'added', text: 'new' },
      { kind: 'context', text: 'c' },
    ]);
  });

  it('degrades to remove-all then add-all past the line cap, without hanging', () => {
    const big = (tag: string) => Array.from({ length: 1300 }, (_, i) => `${tag}${i}`).join('\n');
    const d = promptLineDiff(`head\n${big('x')}\ntail`, `head\n${big('y')}\ntail`);
    expect(d.filter((l) => l.kind === 'removed')).toHaveLength(1300);
    expect(d.filter((l) => l.kind === 'added')).toHaveLength(1300);
    expect(d[0]).toEqual({ kind: 'context', text: 'head' });
  });
});

describe('regressionAlert (AC-85)', () => {
  const metrics = (recall: number | null, precision: number | null, citation: number | null) => ({
    recall,
    precision,
    citation_accuracy: citation,
  });
  const alertRun = (
    id: string,
    version: number,
    m: ReturnType<typeof metrics>,
  ): AlertRun => ({ id, agent_version: version, ...m });

  const none = () => [] as EvalCaseOutcome[];

  it('a drop of exactly 0.02 raises an alert naming both versions', () => {
    const a = regressionAlert(
      [alertRun('r2', 8, metrics(0.8, 0.9, 1)), alertRun('r1', 7, metrics(0.82, 0.9, 1))],
      none,
    );
    expect(a?.drops).toEqual([
      { metric: 'recall', old_value: 0.82, new_value: 0.8, old_version: 7, new_version: 8 },
    ]);
  });

  it('a drop of 0.019 raises none', () => {
    expect(
      regressionAlert(
        [alertRun('r2', 8, metrics(0.801, 0.9, 1)), alertRun('r1', 7, metrics(0.82, 0.9, 1))],
        none,
      ),
    ).toBeNull();
  });

  it('fewer than two completed runs raises none', () => {
    expect(regressionAlert([], none)).toBeNull();
    expect(regressionAlert([alertRun('r1', 1, metrics(0.1, 0.1, 0.1))], none)).toBeNull();
  });

  it('a null metric on either side is not considered', () => {
    expect(
      regressionAlert(
        [alertRun('r2', 8, metrics(null, 0.9, 1)), alertRun('r1', 7, metrics(0.9, 0.9, 1))],
        none,
      ),
    ).toBeNull();
    expect(
      regressionAlert(
        [alertRun('r2', 8, metrics(0.5, 0.9, 1)), alertRun('r1', 7, metrics(null, 0.9, 1))],
        none,
      ),
    ).toBeNull();
  });

  it('an improvement is not a drop', () => {
    expect(
      regressionAlert(
        [alertRun('r2', 8, metrics(0.9, 0.95, 1)), alertRun('r1', 7, metrics(0.5, 0.5, 0.5))],
        none,
      ),
    ).toBeNull();
  });

  it('lists every dropped metric, and the cases that went from pass to fail', () => {
    const outcomes: Record<string, EvalCaseOutcome[]> = {
      r1: [outcome('a', { pass: true }), outcome('b', { pass: true }), outcome('c', { pass: false })],
      r2: [outcome('a', { pass: false }), outcome('b', { pass: true }), outcome('c', { pass: false })],
    };
    const a = regressionAlert(
      [alertRun('r2', 8, metrics(0.5, 0.7, 1)), alertRun('r1', 7, metrics(0.9, 0.76, 1))],
      (id) => outcomes[id] ?? [],
    );
    expect(a?.drops.map((d) => d.metric)).toEqual(['recall', 'precision']);
    expect(a?.now_failing).toEqual([{ case_id: 'a', name: 'case-a' }]);
  });

  it('only looks at the latest two completed runs', () => {
    expect(
      regressionAlert(
        [
          alertRun('r3', 9, metrics(0.9, 0.9, 1)),
          alertRun('r2', 8, metrics(0.9, 0.9, 1)),
          alertRun('r1', 7, metrics(0.1, 0.1, 0.1)),
        ],
        none,
      ),
    ).toBeNull();
  });
});
