import { rollupSeverities, type SeverityCounts } from './status.js';

/**
 * PR-list FINDINGS rollup (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * The Pull Requests list shows ONE severity breakdown per PR: what the PR's
 * LATEST review found. That is deliberately the same rule the SCORE column next
 * to it already uses (`reviews` newest-first, `kind='review'`), so the two
 * columns can never disagree — and it is what the hover popup's "FINDINGS IN
 * THIS RUN" heading refers to. Re-reviewing REPLACES the breakdown; it does not
 * accumulate the way the COST column does.
 *
 * Findings are counted exactly as stored: accepted and dismissed ones still
 * count, because they are still rendered on the PR page.
 */

export interface FindingSeverityRow {
  reviewId: string;
  severity: string;
}

/**
 * Break down each PR's latest-review findings by severity.
 *
 * `latestReviewIdByPr` maps a PR to its latest review; `rows` are the findings
 * of those reviews (the route filters by `review_id IN (…)`). A PR whose latest
 * review found NOTHING is present with `{0,0,0}` — "reviewed, clean". A PR with
 * no review at all is ABSENT from the map, which the route serializes as `null`
 * ("—" in the UI). Those two are different states and must not be conflated.
 */
export function findingsByPrFromRows(
  latestReviewIdByPr: Map<string, string>,
  rows: FindingSeverityRow[],
): Map<string, SeverityCounts> {
  const byReview = new Map<string, FindingSeverityRow[]>();
  for (const r of rows) {
    const bucket = byReview.get(r.reviewId);
    if (bucket) bucket.push(r);
    else byReview.set(r.reviewId, [r]);
  }

  const findings = new Map<string, SeverityCounts>();
  for (const [prId, reviewId] of latestReviewIdByPr) {
    findings.set(prId, rollupSeverities(byReview.get(reviewId) ?? []));
  }
  return findings;
}
