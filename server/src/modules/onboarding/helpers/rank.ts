import type { CommitTouch } from '@devdigest/shared';
import { CONTROL_CHAR_RE, HISTORY_WINDOW_DAYS } from '../constants.js';
import type { RankedFile } from '../types.js';

/**
 * Tour rank (SPEC-02 AC-52..AC-57, AC-60, AC-96). Ring 1: pure functions of their
 * inputs — no clock, no I/O. The window is derived from the indexed commit's date,
 * never from "now", so two runs over the same facts agree.
 */

const DAY_MS = 86_400_000;

export interface HistoryWindow {
  /** ISO 8601, inclusive. */
  start: string;
  /** ISO 8601, inclusive — the indexed commit's date. */
  end: string;
}

/** True when `path` holds a control character (U+0000–U+001F, U+007F) — AC-96. */
export function hasControlChar(path: string): boolean {
  return CONTROL_CHAR_RE.test(path);
}

/** Leave out every row whose path holds a control character (AC-96). */
export function dropUnsafePaths<T>(rows: readonly T[], pathOf: (row: T) => string): T[] {
  return rows.filter((row) => !hasControlChar(pathOf(row)));
}

/**
 * The 180 days ending at the indexed commit's date (AC-54), both ends inclusive.
 * Throws a `RangeError` when `indexedCommitIso` is not a date — the caller got it
 * from git, so an invalid value is a bug, not an input to degrade on.
 */
export function historyWindow(indexedCommitIso: string): HistoryWindow {
  const end = Date.parse(indexedCommitIso);
  const start = end - HISTORY_WINDOW_DAYS * DAY_MS;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/** Whether `iso` lies in the window; an unparsable date is outside it. */
export function inWindow(iso: string, window: HistoryWindow): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(window.start) && t <= Date.parse(window.end);
}

/**
 * A shallow-boundary commit inside the window means the clone may lack history the
 * window needs (AC-56, plan A-5), so the caller fetches it. A non-shallow clone, or
 * one whose boundary lies before the window, needs nothing.
 */
export function needsHistoryFetch(touches: readonly CommitTouch[], window: HistoryWindow): boolean {
  return touches.some((t) => t.boundary && inWindow(t.committedAt, window));
}

/**
 * Per indexed file, the number of in-window commits that touch it. A shallow-boundary
 * commit is skipped: its parent is absent, so git reports it as adding every file
 * (AC-55). Every indexed file is present in the result, 0 when untouched.
 */
export function commitCounts(
  touches: readonly CommitTouch[],
  window: HistoryWindow,
  indexedFiles: Iterable<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of indexedFiles) {
    if (!hasControlChar(path)) counts.set(path, 0);
  }
  for (const touch of touches) {
    if (touch.boundary) continue;
    if (!inWindow(touch.committedAt, window)) continue;
    for (const file of new Set(touch.files)) {
      const n = counts.get(file);
      if (n !== undefined) counts.set(file, n + 1);
    }
  }
  return counts;
}

/** count / highest count; every file 0 when the highest count is 0 (AC-53). */
export function hotness(counts: ReadonlyMap<string, number>): Map<string, number> {
  let max = 0;
  for (const n of counts.values()) if (n > max) max = n;
  const out = new Map<string, number>();
  for (const [path, n] of counts) out.set(path, max > 0 ? n / max : 0);
  return out;
}

/**
 * `rank = pagerank * (1 + hotness)` (AC-52), highest first, equal ranks by path in
 * ascending code-point order (AC-60). `hotness: null` means the history was
 * unobtainable: every file's hotness is 0 (AC-57). Paths with a control character
 * are left out (AC-96).
 */
export function rankFiles(
  files: readonly { path: string; pagerank: number }[],
  hotnessByPath: ReadonlyMap<string, number> | null,
): RankedFile[] {
  const ranked: RankedFile[] = dropUnsafePaths(files, (f) => f.path).map((f) => {
    const pagerank = Number.isFinite(f.pagerank) ? f.pagerank : 0;
    const h = hotnessByPath?.get(f.path) ?? 0;
    return { path: f.path, pagerank, hotness: h, rank: pagerank * (1 + h) };
  });
  // Compare with `<`, never `localeCompare` — the order must not depend on the locale.
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank > b.rank ? -1 : 1;
    if (a.path === b.path) return 0;
    return a.path < b.path ? -1 : 1;
  });
  return ranked;
}
