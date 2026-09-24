/**
 * Intent-layer caps and deadlines. Pure data — no I/O — so this file is ring 1
 * (see `docs/plans/intent-layer.plan.md` §1.1).
 */

/** Per-source-kind caps on what the classifier is shown (§1.1). */
export const MAX_COMMITS = 20;
export const MAX_PATHS = 40;
export const MAX_BODY_CHARS = 6000;
export const MAX_DOC_CHARS = 8000;

/** At most this many referenced spec/plan docs are ever read (§1.5, R4). */
export const MAX_DOCS = 2;

/**
 * Caps on how many references of each kind become a `sources` entry. The PR
 * body is attacker-controlled (anyone who can open a PR writes it), so without
 * a cap `#1 #2 … #11000` means thousands of sequential GitHub calls — the
 * token's hourly limit gone and every queued review stalled behind the intent
 * step — plus one Live Log line per reference in every agent's log. Anything
 * past a cap collapses into a single "+N more" source.
 */
export const MAX_ISSUE_REFS = 5;
export const MAX_TICKET_KEYS = 5;
export const MAX_DOC_REFS = 5;

/**
 * A PR body at or above this many characters (AFTER stripping HTML comments,
 * markdown checklist items and heading lines — see `stripBodyBoilerplate`) is
 * "substantive prose" for the §2.7 confidence rule. Below it, a body is
 * template boilerplate or a one-liner and cannot carry a `medium` tier on its
 * own.
 */
export const SUBSTANTIVE_BODY_CHARS = 80;

/**
 * Per-request timeout passed to the provider. Honoured by the OpenAI and
 * Anthropic adapters; OpenRouter fixes its own timeout at construction and
 * ignores this (`server/INSIGHTS.md`, 2026-09-19) — `DERIVE_DEADLINE_MS` is
 * the real guarantee.
 */
export const DERIVE_TIMEOUT_MS = 90_000;

/**
 * Hard server-side deadline on the whole derivation call, enforced by this
 * module. Ordering that has to hold: provider timeout (90s) < this deadline
 * (120s) < any plausible client timeout — same reasoning as the conventions
 * extractor (`modules/conventions/constants.ts`).
 */
export const DERIVE_DEADLINE_MS = 120_000;

/**
 * Schema-repair attempts. One, not the default two — each repair is a full
 * extra round trip, and the pre-work path is best-effort so a slow repair
 * loop should fail fast rather than hold up the whole review.
 */
export const DERIVE_MAX_RETRIES = 1;
