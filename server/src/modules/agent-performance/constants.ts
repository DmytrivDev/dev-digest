/**
 * Agent Performance (SPEC-10) — the numbers every rule in this module shares.
 * One home so the dashboard and the per-agent Stats tab cannot disagree.
 */

/** The only `agent_runs.status` that counts as a run (AC-1). */
export const COUNTED_STATUS = 'done';

/** Statuses reported as `failed_runs` and in no other figure (AC-2). */
export const FAILED_STATUSES = ['failed', 'cancelled'] as const;

/** Decisions (accepted + dismissed) below which a rate is a "small sample" (AC-10). */
export const MIN_DECISIONS = 5;

/** Most runs `recent_runs` carries (AC-12). */
export const RECENT_RUNS_LIMIT = 5;

/** A recorded cost above this is treated as unpriced (AC-3) — guards against bad CI ingest. */
export const MAX_VALID_COST_USD = 1000;

/** Window used when the request names none (AC-15). */
export const DEFAULT_WINDOW_DAYS = 30;

export const COST_BASIS = 'estimate' as const;

export const MS_PER_DAY = 86_400_000;
