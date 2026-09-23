/**
 * Title search for the PR list. A rule, not a query: the list is already
 * loaded, so matching happens in memory and gets unit coverage without a
 * database. Matching is meant to be case-insensitive and to treat the query
 * as plain text, never as a regular expression.
 */
import escapeStringRegexp from 'escape-string-regexp';

/** Queries shorter than this match everything — one letter is noise. */
export const MIN_QUERY_LENGTH = 2;

/** True when `title` contains `query` as plain text. */
export function matchesTitle(query: string, title: string): boolean {
  if (query.length < MIN_QUERY_LENGTH) return true;
  const pattern = new RegExp(escapeStringRegexp(query));
  return pattern.test(title);
}

/** Keeps the pull requests whose title matches `query`, in their original order. */
export function filterByTitle<T extends { title: string }>(pulls: T[], query: string): T[] {
  return pulls.filter((p) => matchesTitle(query.trim(), p.title));
}
