/** How many of an agent's newest `done` runs feed its run estimate (SPEC-08 AC-11). */
export const ESTIMATE_SAMPLE = 10;

/** Most agent ids one estimates request may name. */
export const MAX_ESTIMATE_AGENTS = 50;

/** Same per-route limit as `POST /pulls/:id/review`: each start fans out to model calls. */
export const START_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** How many of a PR's newest multi-agent runs `GET /pulls/:id/multi-agent-runs` returns (AC-43). */
export const RECENT_RUNS_LIMIT = 5;
