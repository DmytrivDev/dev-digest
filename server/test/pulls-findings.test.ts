/**
 * PR-list FINDINGS rollup (`modules/pulls/findings.ts`) — the pure rule behind
 * the list's FINDINGS column and its hover popup: the severity breakdown of the
 * PR's LATEST review, the same review the SCORE column reads. The route feeds it
 * the latest-review map plus those reviews' findings, so the rule gets unit
 * coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import { findingsByPrFromRows } from '../src/modules/pulls/findings.js';

describe('findingsByPrFromRows', () => {
  it('breaks the latest review down by severity', () => {
    const findings = findingsByPrFromRows(
      new Map([['pr1', 'rv1']]),
      [
        { reviewId: 'rv1', severity: 'CRITICAL' },
        { reviewId: 'rv1', severity: 'CRITICAL' },
        { reviewId: 'rv1', severity: 'WARNING' },
        { reviewId: 'rv1', severity: 'SUGGESTION' },
      ],
    );
    expect(findings.get('pr1')).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('ignores findings from an EARLIER review — re-reviewing replaces, not accumulates', () => {
    const findings = findingsByPrFromRows(
      new Map([['pr1', 'rv-new']]),
      [
        { reviewId: 'rv-old', severity: 'CRITICAL' },
        { reviewId: 'rv-old', severity: 'CRITICAL' },
        { reviewId: 'rv-new', severity: 'WARNING' },
      ],
    );
    expect(findings.get('pr1')).toEqual({ critical: 0, warning: 1, suggestion: 0 });
  });

  it('keeps PRs apart', () => {
    const findings = findingsByPrFromRows(
      new Map([
        ['pr1', 'rv1'],
        ['pr2', 'rv2'],
      ]),
      [
        { reviewId: 'rv1', severity: 'CRITICAL' },
        { reviewId: 'rv2', severity: 'SUGGESTION' },
        { reviewId: 'rv2', severity: 'SUGGESTION' },
      ],
    );
    expect(findings.get('pr1')).toEqual({ critical: 1, warning: 0, suggestion: 0 });
    expect(findings.get('pr2')).toEqual({ critical: 0, warning: 0, suggestion: 2 });
  });

  it('a reviewed PR with no findings is {0,0,0} — "clean", not "never reviewed"', () => {
    const findings = findingsByPrFromRows(new Map([['pr1', 'rv1']]), []);
    expect(findings.get('pr1')).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });

  it('a PR with no review at all is absent from the map (→ "—", not a row of zeros)', () => {
    const findings = findingsByPrFromRows(new Map(), [{ reviewId: 'rv1', severity: 'CRITICAL' }]);
    expect(findings.has('pr1')).toBe(false);
    expect(findings.size).toBe(0);
  });

  it('drops a severity outside the contract enum (the column is plain text)', () => {
    const findings = findingsByPrFromRows(
      new Map([['pr1', 'rv1']]),
      [
        { reviewId: 'rv1', severity: 'CRITICAL' },
        { reviewId: 'rv1', severity: 'WEIRD' },
      ],
    );
    expect(findings.get('pr1')).toEqual({ critical: 1, warning: 0, suggestion: 0 });
  });
});
