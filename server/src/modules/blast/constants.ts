/**
 * blast/history (W9) limits. The per-symbol caller cap is NOT redefined here
 * — it stays in `repo-intel/constants.ts` (`MAX_CALLERS_PER_SYMBOL`), the
 * facade's own limit.
 */
export const MAX_HISTORY_PATHS = 5;
export const MAX_COMMITS_PER_PATH = 5;
export const MAX_HISTORY_ITEMS = 5;
export const HISTORY_DEADLINE_MS = 20_000;
