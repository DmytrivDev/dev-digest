/**
 * Eval scoring (SPEC-04 §E) — pure, no model call, no database. AC-65…AC-75.
 */
import { describe, it, expect } from 'vitest';
import type { EvalExpectation, Finding, LLMProvider } from '@devdigest/shared';
import {
  aggregateRun,
  finalStatus,
  findingMatches,
  scoreCase,
  type ScorableOutcome,
} from '../src/modules/eval/helpers/scoring.js';

const FILE = 'src/a.ts';

const exp = (
  kind: EvalExpectation['kind'],
  start = 10,
  end = 20,
  file = FILE,
): EvalExpectation => ({ kind, file, start_line: start, end_line: end });

const finding = (start: number, end: number, over: Partial<Finding> = {}): Finding => ({
  id: `f-${start}-${end}`,
  severity: 'WARNING',
  category: 'bug',
  title: 'T',
  file: FILE,
  start_line: start,
  end_line: end,
  rationale: 'r',
  confidence: 0.9,
  ...over,
});

const outcome = (over: Partial<ScorableOutcome> = {}): ScorableOutcome => ({
  kind: 'must_find',
  status: 'scored',
  pass: true,
  findings_matched: 1,
  findings_total: 1,
  grounding_kept: 1,
  grounding_total: 1,
  cost_usd: 0.01,
  ...over,
});

describe('findingMatches (AC-65)', () => {
  it('matches overlapping ranges', () => {
    expect(findingMatches(finding(15, 25), exp('must_find'))).toBe(true);
    expect(findingMatches(finding(12, 14), exp('must_find'))).toBe(true);
  });

  it('matches touching ranges (end = start), both ways', () => {
    expect(findingMatches(finding(20, 30), exp('must_find'))).toBe(true);
    expect(findingMatches(finding(1, 10), exp('must_find'))).toBe(true);
  });

  it('does not match disjoint ranges, even one line away', () => {
    expect(findingMatches(finding(21, 30), exp('must_find'))).toBe(false);
    expect(findingMatches(finding(1, 9), exp('must_find'))).toBe(false);
  });

  it('does not match a different file', () => {
    expect(findingMatches(finding(10, 20, { file: 'src/b.ts' }), exp('must_find'))).toBe(false);
  });

  it('ignores severity, category and title', () => {
    const f = finding(10, 20, { severity: 'SUGGESTION', category: 'style', title: 'unrelated' });
    expect(findingMatches(f, exp('must_find'))).toBe(true);
  });
});

describe('scoreCase (AC-66…AC-68)', () => {
  it('must_find: 0 matches fail, 1 or more pass', () => {
    expect(scoreCase(exp('must_find'), [], 0).pass).toBe(false);
    expect(scoreCase(exp('must_find'), [finding(30, 40)], 0).pass).toBe(false);
    expect(scoreCase(exp('must_find'), [finding(12, 12)], 0).pass).toBe(true);
    expect(scoreCase(exp('must_find'), [finding(12, 12), finding(15, 16)], 0).pass).toBe(true);
  });

  it('must_not_flag: 0 matches pass, 1 match fails, a non-overlapping finding passes', () => {
    expect(scoreCase(exp('must_not_flag'), [], 0).pass).toBe(true);
    expect(scoreCase(exp('must_not_flag'), [finding(12, 12)], 0).pass).toBe(false);
    expect(scoreCase(exp('must_not_flag'), [finding(30, 40)], 0).pass).toBe(true);
  });

  it('counts only the findings passed in: a dropped one over the range does not fail the case', () => {
    // The caller hands scoreCase the KEPT findings only; the dropped one is just a count.
    const r = scoreCase(exp('must_not_flag'), [], 1);
    expect(r.pass).toBe(true);
    expect(r.findings_total).toBe(0);
    expect(r.grounding_kept).toBe(0);
    expect(r.grounding_total).toBe(1);
  });

  it('records the matched/total counts and the actual findings', () => {
    const r = scoreCase(exp('must_find'), [finding(12, 12), finding(50, 60)], 2);
    expect(r).toMatchObject({
      status: 'scored',
      findings_matched: 1,
      findings_total: 2,
      grounding_kept: 2,
      grounding_total: 4,
    });
    expect(r.actual).toEqual([
      { file: FILE, start_line: 12, end_line: 12, severity: 'WARNING', category: 'bug', title: 'T' },
      { file: FILE, start_line: 50, end_line: 60, severity: 'WARNING', category: 'bug', title: 'T' },
    ]);
  });
});

describe('aggregateRun', () => {
  it('recall: 3 of 4 scored must_find passed -> 0.75 (AC-69)', () => {
    const outcomes = [
      outcome({ pass: true }),
      outcome({ pass: true }),
      outcome({ pass: true }),
      outcome({ pass: false }),
      outcome({ kind: 'must_not_flag', pass: true, findings_matched: 0 }),
    ];
    expect(aggregateRun(outcomes).recall).toBe(0.75);
  });

  it('precision: 20 grounded findings, 3 on must_not_flag ranges -> 0.85 (AC-70)', () => {
    const outcomes = [
      // findings matching neither kind stay in the denominator
      outcome({ kind: 'must_find', findings_matched: 1, findings_total: 12, grounding_kept: 12, grounding_total: 12 }),
      outcome({ kind: 'must_not_flag', pass: false, findings_matched: 3, findings_total: 8, grounding_kept: 8, grounding_total: 8 }),
    ];
    expect(aggregateRun(outcomes).precision).toBeCloseTo(0.85, 10);
  });

  it('a must_find case`s own matches do not count against precision', () => {
    const outcomes = [
      outcome({ kind: 'must_find', findings_matched: 5, findings_total: 5, grounding_kept: 5, grounding_total: 5 }),
      outcome({ kind: 'must_not_flag', pass: true, findings_matched: 0, findings_total: 5, grounding_kept: 5, grounding_total: 5 }),
    ];
    expect(aggregateRun(outcomes).precision).toBe(1);
  });

  it('citation accuracy: kept 9, dropped 1 -> 0.9, summed over scored cases (AC-71)', () => {
    const outcomes = [
      outcome({ grounding_kept: 4, grounding_total: 5 }),
      outcome({ grounding_kept: 5, grounding_total: 5 }),
    ];
    expect(aggregateRun(outcomes).citation_accuracy).toBeCloseTo(0.9, 10);
  });

  it('a 0 denominator is null (AC-72)', () => {
    const onlyNotFlag = aggregateRun([
      outcome({ kind: 'must_not_flag', findings_matched: 0, findings_total: 0, grounding_kept: 0, grounding_total: 0 }),
    ]);
    expect(onlyNotFlag.recall).toBeNull(); // no must_find case
    expect(onlyNotFlag.precision).toBeNull(); // no grounded finding
    expect(onlyNotFlag.citation_accuracy).toBeNull(); // no finding at all

    const empty = aggregateRun([]);
    expect(empty).toMatchObject({ recall: null, precision: null, citation_accuracy: null, cost_usd: null });
  });

  it('errored cases change no metric and no count (AC-73)', () => {
    const base = [
      outcome({ pass: true }),
      outcome({ kind: 'must_not_flag', pass: false, findings_matched: 2, findings_total: 4, grounding_kept: 4, grounding_total: 5 }),
    ];
    const errored = outcome({
      status: 'errored',
      pass: null,
      findings_matched: 0,
      findings_total: 0,
      grounding_kept: 0,
      grounding_total: 0,
      cost_usd: null,
    });
    const before = aggregateRun(base);
    const after = aggregateRun([...base, errored]);

    expect(after).toMatchObject({
      cases_passed: before.cases_passed,
      cases_scored: before.cases_scored,
      recall: before.recall,
      precision: before.precision,
      citation_accuracy: before.citation_accuracy,
      cost_usd: before.cost_usd,
    });
    expect(after.cases_errored).toBe(1);
    expect(before.cases_errored).toBe(0);
  });

  it('cost is the sum of case costs; null if a scored case has none (AC-75)', () => {
    const sum = aggregateRun([outcome({ cost_usd: 0.01 }), outcome({ cost_usd: 0.02 })]);
    expect(sum.cost_usd).toBeCloseTo(0.03, 10);

    const missing = aggregateRun([outcome({ cost_usd: 0.01 }), outcome({ cost_usd: null })]);
    expect(missing.cost_usd).toBeNull();
  });

  it('a real zero cost is 0, not null', () => {
    expect(aggregateRun([outcome({ cost_usd: 0 })]).cost_usd).toBe(0);
  });

  it('counts passed, scored and errored cases', () => {
    const r = aggregateRun([
      outcome({ pass: true }),
      outcome({ pass: false }),
      outcome({ status: 'errored', pass: null, cost_usd: null }),
    ]);
    expect(r).toMatchObject({ cases_passed: 1, cases_scored: 2, cases_errored: 1 });
  });
});

describe('finalStatus (AC-56, AC-57)', () => {
  it('completed when at least one case was scored', () => {
    expect(finalStatus([{ status: 'errored' }, { status: 'scored' }])).toEqual({
      status: 'completed',
      error_reason: null,
    });
  });

  it('failed: all_cases_errored when every case errored', () => {
    expect(finalStatus([{ status: 'errored' }, { status: 'errored' }])).toEqual({
      status: 'failed',
      error_reason: 'all_cases_errored',
    });
  });
});

describe('AC-74: scoring makes zero model calls', () => {
  it('runs with a provider stub that throws on any call, and records none', () => {
    let calls = 0;
    const trip = async (): Promise<never> => {
      calls++;
      throw new Error('scoring must not call the model');
    };
    // In scope but never handed to the pure functions — they take no provider at all.
    const llm = { complete: trip, completeStructured: trip } as unknown as LLMProvider;
    expect(llm).toBeDefined();

    const scored = scoreCase(exp('must_find'), [finding(12, 12)], 1);
    const agg = aggregateRun([{ ...scored, kind: 'must_find', cost_usd: 0.01 }]);
    finalStatus([scored]);

    expect(agg.recall).toBe(1);
    expect(calls).toBe(0);
  });
});
