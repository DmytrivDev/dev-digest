/**
 * Ring 2 — the conversation with time, not `Date`/`setTimeout` directly. W6's
 * deadline tests substitute this (onion §2, D8's "Clock is a port" note).
 */
export interface Clock {
  now(): number;
  /** Resolves after `ms`, or earlier if `signal` aborts. Never rejects on abort. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
