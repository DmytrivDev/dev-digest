import type { BriefDropped, BriefInput, BriefUsage } from '@devdigest/shared';
import { ConfigError } from '../../../platform/errors.js';
import {
  ERR_LLM_FAILED,
  ERR_LLM_INVALID_OUTPUT,
  ERR_LLM_NOT_CONFIGURED,
  ERR_LLM_REQUEST_REJECTED,
  ERR_LLM_TIMEOUT,
  MODEL_DEADLINE_MS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
} from '../constants.js';

/**
 * Outcome rules of a brief generation — pure, ring 1: how a model failure maps to an API
 * error, whether a stored brief is stale, the per-workspace rate window and the one log line.
 */

// ---- Failure classification (AC-86 … AC-89, AC-70) -------------------------------------------

/**
 * Thrown by the service when the provider's answer parses at the adapter but fails our own
 * re-parse (`parseModelOutput`). The message carries the phrase the adapters use, so
 * `classifyModelError` treats both the same way.
 */
export class BriefOutputInvalidError extends Error {
  constructor() {
    super('Brief model output failed schema validation');
    this.name = 'BriefOutputInvalidError';
  }
}

export interface ModelErrorOutcome {
  status: 422 | 502;
  code: string;
  message: string;
}

/**
 * Map a failed model call to the API error (C-2). Checked in this order:
 * missing key → 422 `llm_not_configured`; `TimeoutError` → 502 `llm_timeout`; a schema failure →
 * 502 `llm_invalid_output`; a provider 4xx → 422 `llm_request_rejected`; anything else →
 * 502 `llm_failed`.
 *
 * Reads `err.status` (the SDK's `APIError`) and NEVER `err.statusCode`: our own
 * `ExternalServiceError` carries `statusCode 502` and must not be read as a provider status
 * (precedent `platform/resilience.ts:37-41`). Messages never echo the raw provider error.
 */
export function classifyModelError(
  err: unknown,
  ctx: { provider: string; model: string },
): ModelErrorOutcome {
  if (err instanceof ConfigError) {
    return {
      status: 422,
      code: ERR_LLM_NOT_CONFIGURED,
      message: `No API key for ${ctx.provider} — add it in Settings → Models.`,
    };
  }
  const e = err as { name?: unknown; message?: unknown; status?: unknown } | null | undefined;
  if (e?.name === 'TimeoutError') {
    return {
      status: 502,
      code: ERR_LLM_TIMEOUT,
      message: `The model did not answer within ${Math.round(MODEL_DEADLINE_MS / 1000)} seconds.`,
    };
  }
  if (typeof e?.message === 'string' && e.message.includes('failed schema validation')) {
    return {
      status: 502,
      code: ERR_LLM_INVALID_OUTPUT,
      message: 'The model returned an answer that does not match the expected format.',
    };
  }
  if (typeof e?.status === 'number' && e.status >= 400 && e.status <= 499) {
    return {
      status: 422,
      code: ERR_LLM_REQUEST_REJECTED,
      message: `The provider rejected the request to ${ctx.provider}/${ctx.model} (HTTP ${e.status}).`,
    };
  }
  return { status: 502, code: ERR_LLM_FAILED, message: 'The model request failed.' };
}

// ---- Staleness (AC-45) -----------------------------------------------------------------------

/** The brief's SHA differs from the PR's current head. An unknown current SHA is not stale. */
export function isStale(briefSha: string, prSha: string | null | undefined): boolean {
  return !!prSha && prSha !== briefSha;
}

// ---- Rate window (AC-92) ---------------------------------------------------------------------

/**
 * Sliding 60 s window, at most 3 admitted. `history` holds the admitted request times (ms) of
 * one workspace; the returned history is the one to keep. A refused request is not recorded,
 * so a client that keeps retrying is admitted again 60 s after its last admitted request.
 * A local copy on purpose: the onboarding limit is a separate spec decision (SPEC-02 AC-16).
 */
export function admitGenerate(
  history: ReadonlyArray<number>,
  nowMs: number,
): { allowed: boolean; history: number[] } {
  const recent = history.filter((t) => nowMs - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return { allowed: false, history: recent };
  return { allowed: true, history: [...recent, nowMs] };
}

// ---- The one log line (AC-94) ----------------------------------------------------------------

/** Sources the budget cut: status `truncated`, or reason `over_budget`. */
export function truncatedSources(inputs: ReadonlyArray<BriefInput>): string[] {
  return inputs
    .filter((i) => i.status === 'truncated' || i.reason === 'over_budget')
    .map((i) => i.source);
}

export interface LogLineInput {
  prId: string;
  usage: BriefUsage;
  /** `provider/model`. */
  model: string;
  status: 'ok' | 'failed';
  /** The error code of a failure; `null` on success. */
  reason: string | null;
  dropped: BriefDropped;
  /** Input sources that were cut (see `truncatedSources`). */
  truncated: ReadonlyArray<string>;
}

/**
 * Exactly one info line per generation. Carries ids, counts, the model name and cost only —
 * no secret, no PR content.
 */
export function logLine(i: LogLineInput): string {
  const num = (n: number | null): string => (n === null ? 'unknown' : String(n));
  return (
    `brief: pr=${i.prId} llm_calls=${i.usage.llm_calls} model=${i.model || 'none'}` +
    ` tokens_in=${num(i.usage.tokens_in)} tokens_out=${num(i.usage.tokens_out)}` +
    ` cost_usd=${num(i.usage.cost_usd)} duration_ms=${i.usage.duration_ms}` +
    ` status=${i.status} reason=${i.reason ?? 'none'}` +
    ` dropped_risks=${i.dropped.risks} dropped_focus=${i.dropped.review_focus}` +
    ` truncated=${i.truncated.length > 0 ? i.truncated.join(',') : 'none'}`
  );
}
