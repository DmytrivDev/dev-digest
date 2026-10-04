import type { BlastRadius, BriefInputSource } from '@devdigest/shared';
import { INPUT_SOURCES, REASON } from '../constants.js';
import type { InputRecord } from '../types.js';
import { parseIssueRefs } from '../../intent/helpers.js';

/**
 * Input rules of the brief — pure, ring 1 (`core-not-to-io` guards this filename).
 * Reuses `parseIssueRefs`, never `OctokitGitHubClient.resolveLinkedIssue` (server
 * INSIGHTS 2026-09-22: optional keyword, 3 of 9 keywords, wrong repo on a cross-repo ref).
 */

// ---- Untrusted text (AC-69) ----------------------------------------------------

/** U+0000–U+001F except tab and newline, and U+007F. */
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Strip control characters from text that is about to enter the prompt (AC-69). */
export function stripControl(text: string): string {
  return text.replace(CONTROL_RE, '');
}

// ---- Linked issue (AC-53) ------------------------------------------------------

/**
 * The number of the first reference in `body` that follows a closing keyword AND points at
 * this repository (no owner/repo, or an owner/repo equal to it, case-insensitive). `null` when
 * there is none — the caller records `missing/no_linked_issue`.
 */
export function linkedIssueNumber(
  body: string | null | undefined,
  repo: { owner: string; name: string },
): number | null {
  if (!body) return null;
  const owner = repo.owner.toLowerCase();
  const name = repo.name.toLowerCase();
  for (const ref of parseIssueRefs(body)) {
    if (!ref.linked) continue;
    const sameRepo =
      (ref.owner === undefined && ref.repo === undefined) ||
      (ref.owner?.toLowerCase() === owner && ref.repo?.toLowerCase() === name);
    if (sameRepo) return ref.number;
  }
  return null;
}

// ---- Blast radius (AC-57, AC-58) -----------------------------------------------

export interface BlastInputState {
  status: 'used' | 'missing';
  reason?: string;
  /** False when the blast map cannot ground anything (validation then uses PR files only). */
  usable: boolean;
}

/**
 * How the blast radius counts as an input. `files_unavailable`, zero changed symbols or a
 * thrown lookup → `missing` (not usable). Anything else is `used`, carrying the degraded
 * reason when the facade ran degraded (AC-57). Takes the wire `BlastRadius` (after
 * `toBlastRadius`), because `files_unavailable` only exists there.
 */
export function blastInput(result: BlastRadius | 'threw'): BlastInputState {
  if (result === 'threw') return { status: 'missing', reason: REASON.indexFailed, usable: false };
  if (result.reason === 'files_unavailable') {
    return { status: 'missing', reason: 'files_unavailable', usable: false };
  }
  if (result.changed_symbols.length === 0) {
    return { status: 'missing', reason: result.reason ?? REASON.noData, usable: false };
  }
  if (result.degraded && result.reason) {
    return { status: 'used', reason: result.reason, usable: true };
  }
  return { status: 'used', usable: true };
}

// ---- Spec documents (AC-55) ----------------------------------------------------

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The de-duplicated union of every enabled agent's document paths: agents ordered by name,
 * each agent's own order kept (it comes from `orderRunDocs`), a path keeps its first position.
 */
export function unionDocPaths(
  perAgent: ReadonlyArray<{ agentName: string; paths: readonly string[] }>,
): string[] {
  const agents = [...perAgent].sort((a, b) => byCodePoint(a.agentName, b.agentName));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const agent of agents) {
    for (const p of agent.paths) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

// ---- The six `inputs` entries (AC-59, AC-60) -----------------------------------

/**
 * The `diff_stats` input: `truncated/file_list_truncated` when fewer files are stored than
 * the PR reports (AC-59), else `used`.
 */
export function diffStatsInput(stored: number, filesCount: number): InputRecord {
  if (stored < filesCount) {
    return { source: 'diff_stats', status: 'truncated', reason: REASON.fileListTruncated };
  }
  return { source: 'diff_stats', status: 'used' };
}

/**
 * Exactly six entries, in the fixed order (AC-60). A source with no record is `missing/empty`
 * and a non-`used` record without a reason gets `empty`, so the result always satisfies the
 * contract's "reason required unless used". A `used` entry keeps its reason (AC-57).
 * `omitted` survives on `diff_stats` only.
 */
export function buildInputs(records: ReadonlyArray<InputRecord>): InputRecord[] {
  const bySource = new Map<BriefInputSource, InputRecord>();
  for (const r of records) if (!bySource.has(r.source)) bySource.set(r.source, r);
  return INPUT_SOURCES.map((source): InputRecord => {
    const r = bySource.get(source);
    if (!r) return { source, status: 'missing', reason: REASON.empty };
    // A `used` entry may still carry a reason: a degraded blast map (AC-57).
    if (r.status === 'used') return { source, status: 'used', ...(r.reason ? { reason: r.reason } : {}) };
    return {
      source,
      status: r.status,
      reason: r.reason ? r.reason : REASON.empty,
      ...(source === 'diff_stats' && r.omitted !== undefined ? { omitted: r.omitted } : {}),
    };
  });
}
