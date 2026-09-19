/**
 * How old a pull request is, as the short label the PR list shows beside its
 * title. A rule, not a formatter: the thresholds are what the team means by
 * "fresh" and "stale", so they live here with the other PR-list rules
 * (`cost.ts`, `status.ts`, `findings.ts`) and get unit coverage without a
 * database.
 */

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/** Days from which a pull request counts as stale rather than merely old. */
export const STALE_AFTER_DAYS = 30;

/**
 * A short human label for a pull request's age.
 *
 * `openedAt` is nullable because `pull_requests.opened_at` is: a PR imported
 * from a payload that omitted the timestamp has none.
 */
export function prAgeLabel(openedAt: Date | null, now: Date): string {
  if (!openedAt) return 'unknown';
  const days = Math.floor((now.getTime() - openedAt.getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days`;
  if (days < STALE_AFTER_DAYS) return `${Math.floor(days / 7)} weeks`;
  return 'stale';
}
