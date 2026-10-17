import type { PerfWindow, PerfWindowQuery } from '@devdigest/shared';
import { DEFAULT_WINDOW_DAYS, MS_PER_DAY } from '../constants.js';

/** The half-open interval `[from, to)` a request resolves to (AC-15). */
export interface ResolvedWindow {
  from: Date;
  to: Date;
  days: 1 | 30 | null;
}

/**
 * Resolve the query into a window. `now` is a parameter: this file never reads
 * the clock. The query is already validated by `PerfWindowQuery` (AC-16), so
 * `days` is 1 or 30 whenever it is present.
 */
export function resolveWindow(q: PerfWindowQuery, now: Date): ResolvedWindow {
  if (q.from !== undefined && q.to !== undefined) {
    return { from: new Date(q.from), to: new Date(q.to), days: null };
  }
  const days = (q.days ?? DEFAULT_WINDOW_DAYS) as 1 | 30;
  return { from: new Date(now.getTime() - days * MS_PER_DAY), to: now, days };
}

/** Wire form of the window (AC-17). */
export function windowDto(w: ResolvedWindow): PerfWindow {
  return { from: w.from.toISOString(), to: w.to.toISOString(), days: w.days };
}
