/**
 * Intent-layer pure rules: reference parsing, the path-traversal gate, the
 * confidence tier, the cache key, and the rendered prompt block. No DB, no
 * adapters, no `platform/container` — a rule that needs Postgres to test is
 * in the wrong ring (onion-architecture skill §1). See
 * `docs/plans/intent-layer.plan.md` for the design this implements.
 */
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type {
  ChatMessage,
  IntentConfidence,
  IntentSource,
  IntentSourceKind,
  PrIntentRecord,
} from '@devdigest/shared';
import { MAX_DOCS, SUBSTANTIVE_BODY_CHARS } from './constants.js';

// ---------------------------------------------------------------- reference parsing

/**
 * GitHub's nine documented closing keywords, case-insensitive, matched as
 * whole words. `\b` boundaries make the alternation order irrelevant: at a
 * given position "close" cannot win over "closes" because the boundary after
 * "close" fails when the text continues with "s".
 */
const CLOSING_KEYWORDS =
  'close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved';

/**
 * One occurrence of an issue reference in a PR body: a full GitHub issue URL,
 * an `owner/repo#N` cross-repo form, or a bare `#N`. `linked` is true only
 * when one of the nine closing keywords (optional colon) immediately
 * precedes it — GitHub itself treats a keyword-linked reference and a bare
 * mention as different things, and so does the intent layer's confidence
 * tier (§2.7).
 */
const ISSUE_REF_RE = new RegExp(
  `(?:\\b(?:${CLOSING_KEYWORDS})\\b\\s*:?\\s+)?` +
    '(?:' +
    // full GitHub issue URL
    'https?://github\\.com/([\\w.-]+)/([\\w.-]+)/issues/(\\d+)' +
    '|' +
    // owner/repo#N or bare #N
    '(?:([\\w.-]+)/([\\w.-]+))?#(\\d+)' +
    ')',
  'gi',
);

/**
 * Whether a matched reference's own text (`m[0]`) STARTS with one of the nine
 * closing keywords. The keyword group in `ISSUE_REF_RE` is non-capturing (it
 * has to stay outside the URL/owner-repo alternation), so it is part of the
 * overall match rather than text preceding it — this re-tests the match
 * itself instead of guessing at an offset.
 */
const KEYWORD_PREFIX_RE = new RegExp(`^(?:${CLOSING_KEYWORDS})\\b:?\\s+`, 'i');

export interface ParsedIssueRef {
  number: number;
  /** True when a closing keyword (case-insensitive) immediately preceded this reference. */
  linked: boolean;
  /** Present only for the `owner/repo#N` or full-URL forms. */
  owner?: string;
  repo?: string;
}

/**
 * Every issue reference in a PR body — linked and merely mentioned alike.
 * Deduplicated by (number, owner, repo): if the SAME issue is referenced
 * more than once, `linked` is true if ANY occurrence carried a keyword.
 *
 * Deliberately does not reuse `OctokitGitHubClient.resolveLinkedIssue`
 * (server/INSIGHTS.md, 2026-09-22): that method makes the keyword optional,
 * covers 3 of 9 keywords, takes only the first match, and on a cross-repo
 * `owner/repo#N` fetches the tail number from the WRONG repo. This parser
 * fixes all three.
 */
export function parseIssueRefs(body: string): ParsedIssueRef[] {
  const byKey = new Map<string, ParsedIssueRef>();
  for (const m of body.matchAll(ISSUE_REF_RE)) {
    const [urlOwner, urlRepo, urlNum, refOwner, refRepo, bareNum] = m.slice(1);
    const number = Number(urlNum ?? bareNum);
    if (!Number.isInteger(number)) continue;
    const owner = urlOwner ?? refOwner;
    const repo = urlRepo ?? refRepo;
    const linked = KEYWORD_PREFIX_RE.test(m[0]);
    const key = `${owner ?? ''}/${repo ?? ''}#${number}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.linked = existing.linked || linked;
    } else {
      byKey.set(key, { number, linked, ...(owner ? { owner } : {}), ...(repo ? { repo } : {}) });
    }
  }
  return [...byKey.values()];
}

/**
 * External-tracker keys (Jira and friends): `[A-Z][A-Z0-9]+-\d+`. The
 * project-key portion is admin-configurable, so it is NOT assumed pure-alpha
 * (§1.4) — `PROJ2-14` matches, `proj-14` does not (case-sensitive: a lowercase
 * key is not how these trackers render them).
 */
const TICKET_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

export function parseTicketKeys(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(TICKET_KEY_RE)) seen.add(m[0]);
  return [...seen];
}

/**
 * Spec/plan/design-doc references (§1.5 — this repo's own convention, since
 * none exists industry-wide). Two forms, both collected as raw candidate
 * paths: (1) an explicit `Spec:`/`Plan:`/`Design doc:` line naming a
 * repo-relative path, and (2) any inline markdown link or bare token naming a
 * `docs/**.md` or `specs/**.md` path. Callers apply `isSafeDocPath` before
 * ever reading one — this function does not validate, only collects.
 */
const EXPLICIT_DOC_LINE_RE = /^(?:Spec|Plan|Design doc):\s*(\S+)/gim;
const INLINE_DOC_PATH_RE = /\(?\b((?:docs|specs)\/[\w./-]+\.md)\)?/gi;

export function parseSpecDocRefs(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(EXPLICIT_DOC_LINE_RE)) {
    const raw = m[1]!;
    // A github blob URL naming the same file resolves to a path we can read
    // from the clone; anything else is passed through and will fail the
    // safety gate (scheme rejected) rather than being silently dropped.
    const blob = raw.match(/\/blob\/[^/]+\/(.+)$/);
    seen.add(blob ? blob[1]! : raw);
  }
  for (const m of body.matchAll(INLINE_DOC_PATH_RE)) {
    seen.add(m[1]!);
  }
  return [...seen];
}

export interface ParsedReferences {
  issues: ParsedIssueRef[];
  ticketKeys: string[];
  specDocs: string[];
}

/** Parse every reference kind out of a PR body in one pass. */
export function parseReferences(body: string): ParsedReferences {
  return {
    issues: parseIssueRefs(body),
    ticketKeys: parseTicketKeys(body),
    specDocs: parseSpecDocRefs(body),
  };
}

// ---------------------------------------------------------------- path safety gate (R4)

/**
 * Whether a spec/plan doc reference is safe to read via `GitClient.readFile`.
 * Rejects: not a `.md` file, a URL/scheme, an absolute path (POSIX or
 * Windows), and anything whose normalized form escapes the repo root via
 * `..`. Pure and unit-tested directly (R4) — this is the ONLY gate; a
 * rejected path is never read.
 */
export function isSafeDocPath(rawPath: string): boolean {
  if (typeof rawPath !== 'string') return false;
  const p = rawPath.trim();
  if (p === '') return false;
  if (!p.toLowerCase().endsWith('.md')) return false;
  if (p.includes('\0')) return false;
  // A URL / scheme (http://, https://, file://) or a protocol-relative //host.
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) return false;
  // Any absolute path form.
  if (p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(p)) return false;
  const normalized = posix.normalize(p.replace(/\\/g, '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) return false;
  return true;
}

/** Cap the number of spec docs actually read, in reference order. */
export function capDocRefs(paths: string[]): string[] {
  return paths.filter(isSafeDocPath).slice(0, MAX_DOCS);
}

// ---------------------------------------------------------------- reference caps

/** The first `max` items and how many were dropped. */
export function capReferences<T>(items: readonly T[], max: number): { kept: T[]; overflow: number } {
  return { kept: items.slice(0, max), overflow: Math.max(0, items.length - max) };
}

/** Linked (closing-keyword) issues first, otherwise in body order — so a cap
 *  never drops the one reference that can make the tier `high`. */
export function prioritizeIssueRefs(refs: readonly ParsedIssueRef[]): ParsedIssueRef[] {
  return [...refs.filter((r) => r.linked), ...refs.filter((r) => !r.linked)];
}

/** The single source entry that stands in for every reference past a cap. */
export function overflowSource(kind: IntentSourceKind, overflow: number, max: number): IntentSource {
  return { kind, ref: `+${overflow} more`, resolved: false, detail: `over the cap of ${max} — not read` };
}

// ---------------------------------------------------------------- source error details

/**
 * A fixed phrase for a failed doc read, never the raw `err.message`: Node's
 * ENOENT text carries the absolute clone path (OS user name, home dir), and
 * `detail` is stored, returned by the DTO and written to every Live Log.
 */
export function readErrorDetail(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'not found on the default branch';
  if (code === 'EOUTSIDECLONE') return 'resolves outside the repository — not read';
  return 'unreadable';
}

/**
 * A fixed phrase for a failed issue fetch. Classified structurally (status /
 * error code), like `isProviderConfigError`, so a vendor's wording never
 * reaches the log. Our own config error ("GITHUB_TOKEN is not configured") is
 * safe and actionable, so it is kept verbatim.
 */
export function githubErrorDetail(err: unknown): string {
  if ((err as { code?: unknown } | null)?.code === 'config_error') return (err as Error).message;
  const status = providerErrorStatus(err);
  if (status === 404) return 'issue not found (HTTP 404)';
  if (status !== undefined) return `GitHub request failed (HTTP ${status})`;
  return 'GitHub request failed';
}

// ---------------------------------------------------------------- confidence tier (§2.7, R5)

const REFERENCE_KINDS = new Set<IntentSourceKind>([
  'linked_issue',
  'mentioned_issue',
  'ticket_key',
  'spec_doc',
]);

/**
 * The deterministic confidence tier — computed by us from which sources
 * resolved, NEVER asked of the model (verbalised LLM confidence is
 * empirically miscalibrated, R5). Truth table in
 * `docs/plans/intent-layer.plan.md` §2.7.
 */
export function confidenceTier(sources: readonly IntentSource[]): IntentConfidence {
  const hasHighSource = sources.some(
    (s) => (s.kind === 'linked_issue' || s.kind === 'spec_doc') && s.resolved === true,
  );
  if (hasHighSource) return 'high';

  const hasUnresolvedReference = sources.some(
    (s) => s.resolved === false && REFERENCE_KINDS.has(s.kind),
  );
  const hasSubstantiveBody = sources.some((s) => s.kind === 'pr_body' && s.resolved === true);
  if (hasUnresolvedReference || hasSubstantiveBody) return 'medium';

  return 'low';
}

/** Strip HTML comments (PR-template instructions), markdown checklist items,
 *  and heading lines — the boilerplate a template contributes on its own,
 *  which must not count toward "substantive". */
export function stripBodyBoilerplate(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*-\s*\[[ xX]\]\s*.*$/gm, '')
    .replace(/^#{1,6}\s*.*$/gm, '')
    .trim();
}

/** Whether a PR body is substantive prose (§2.7's `medium` clause), after
 *  trimming template boilerplate. */
export function isSubstantiveBody(body: string | null | undefined): boolean {
  if (!body) return false;
  const stripped = stripBodyBoilerplate(body).replace(/\s+/g, ' ').trim();
  return stripped.length >= SUBSTANTIVE_BODY_CHARS;
}

// ---------------------------------------------------------------- cache key (§2.3, R3)

export interface IntentSourceKeyParts {
  headSha: string;
  body: string | null | undefined;
  provider: string;
  model: string;
}

/**
 * `source_key` — reused when unchanged, re-derived otherwise (§2.3). Keyed on
 * `headSha + body + provider/model`, NOT `headSha` alone: editing the PR
 * description (the single most likely way a `Spec:`/`Fixes #N` line gets
 * added) does not move the head, and a `headSha`-only key would silently
 * serve a stale derivation forever (R3).
 */
export function intentSourceKey(parts: IntentSourceKeyParts): string {
  const input = [parts.headSha, parts.body ?? '', `${parts.provider}/${parts.model}`].join('\n');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ---------------------------------------------------------------- prompt token estimate (W1)

/**
 * A pre-call estimate of the prompt's token cost — summed over every message
 * with the injected counter, never the tokenizer adapter itself (ring 1 stays
 * pure; the caller injects `container.tokenizer.count`, same shape as
 * `countPromptTokens` in `reviews/helpers.ts`). An estimate, not the actual
 * usage: for a non-OpenAI model the tokenizer is an approximation.
 */
export function estimatePromptTokens(
  messages: readonly ChatMessage[],
  count: (text: string) => number,
): number {
  return messages.reduce((sum, m) => sum + count(m.content), 0);
}

// ---------------------------------------------------------------- rendered prompt block (§5.2)

function sourceLabel(s: IntentSource): string {
  return s.ref ? `${s.kind} ${s.ref}` : s.kind;
}

function tierReason(tier: IntentConfidence, sources: readonly IntentSource[]): string {
  if (tier === 'high') {
    const hit = sources.find(
      (s) => (s.kind === 'linked_issue' || s.kind === 'spec_doc') && s.resolved === true,
    );
    return hit ? `${sourceLabel(hit)} resolved` : 'a linked issue or spec resolved';
  }
  if (tier === 'medium') {
    const unresolved = sources.find((s) => s.resolved === false && REFERENCE_KINDS.has(s.kind));
    if (unresolved) return `${sourceLabel(unresolved)} referenced but not resolved`;
    return 'the PR description is substantive';
  }
  return 'no reference or description — inferred from title, branch, commits and changed files';
}

export interface RenderableIntent {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: IntentConfidence;
  sources: readonly IntentSource[];
}

/** The block `run-executor.ts` passes into the review prompt (§5.2). Plain
 *  text; the caller (reviewer-core) delimiter-wraps and truncates it. */
export function renderIntentBlock(record: RenderableIntent): string {
  const lines: string[] = [
    `Intent: ${record.intent}`,
    `Confidence: ${record.confidence} — ${tierReason(record.confidence, record.sources)}`,
    `Sources: ${record.sources.map((s) => `${sourceLabel(s)} (${s.resolved ? 'resolved' : 'unresolved'})`).join(', ')}`,
    'In scope:',
    ...record.in_scope.map((item) => `- ${item}`),
    'Out of scope:',
    ...record.out_of_scope.map((item) => `- ${item}`),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------- row -> DTO mapper (ban 3)

/** Just enough of a `pr_intent` row to build the wire DTO — plain fields, not
 *  the Drizzle row type, so this stays a ring-1 pure mapper (ban 3: a row
 *  type must not leave the module; `repository.ts` does the row -> this
 *  translation before calling here). */
export interface PrIntentRowLike {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  model: string | null;
  derivedAt: Date;
  costUsd: number | null;
}

export function toIntentDto(row: PrIntentRowLike): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    sources: row.sources,
    model: row.model,
    derived_at: row.derivedAt.toISOString(),
    cost_usd: row.costUsd,
  };
}

// ---- Provider error classification -----------------------------------------

/**
 * The HTTP status a provider SDK error carries, when it carries one.
 *
 * The OpenAI SDK (which the OpenRouter provider uses) throws an `APIError`
 * with a numeric `status` and a message already prefixed by it — e.g.
 * `404 This model is unavailable for free...`. Anthropic's SDK uses the same
 * shape. A network failure, a timeout or one of reviewer-core's own thrown
 * `Error`s has no status, and that absence is meaningful: it means we cannot
 * say the request was rejected, only that it did not succeed.
 */
export function providerErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
}

/**
 * Did the provider reject our CONFIGURATION, rather than have a bad day?
 *
 * The distinction decides who is at fault and therefore how loudly we report:
 * a dead model id or a rejected key is a setting the user can fix in one click
 * and must be told about, while a 5xx / timeout / network error is exactly the
 * transient failure the best-effort intent step exists to absorb quietly.
 *
 * Classified STRUCTURALLY, by status, never by matching words in the message —
 * a provider's wording differs per vendor and changes without notice, and a
 * denylist of phrasings silently mislabels the next one. 429 is deliberately
 * NOT a config error: rate limiting says the model is real and we asked too
 * often.
 */
export function isProviderConfigError(err: unknown): boolean {
  const status = providerErrorStatus(err);
  if (status === undefined) return false;
  return status === 400 || status === 401 || status === 403 || status === 404;
}

/** Longest provider message we quote back; their errors can run long. */
const PROVIDER_DETAIL_MAX = 240;

/**
 * The caller-facing sentence for a rejected configuration. It names the model,
 * says where to change it, and quotes the provider — that last part is what
 * actually resolves it, because the provider often names the replacement slug.
 */
export function providerConfigMessage(model: string, err: unknown): string {
  const status = providerErrorStatus(err);
  // A 401/403 is about the KEY, and some providers echo a partly masked key
  // in that message — say "rejected" and stop. The quote is kept for 400/404,
  // where it names the replacement model slug.
  const raw = status === 401 || status === 403 ? '' : ((err as Error | undefined)?.message ?? '');
  const detail = raw.length > PROVIDER_DETAIL_MAX ? `${raw.slice(0, PROVIDER_DETAIL_MAX)}…` : raw;
  return (
    `The model configured for PR intent (${model}) was rejected by the provider` +
    `${status !== undefined ? ` with HTTP ${status}` : ''}. ` +
    `Pick a different model in Settings → Models.` +
    `${detail ? ` Provider said: ${detail}` : ''}`
  );
}
