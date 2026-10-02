/**
 * Project Context — the pure rules (ring 1). No I/O, no adapter import: the
 * ring-1 guard in `.dependency-cruiser.cjs` is by FILENAME, so every rule that
 * must be testable without a database lives in this file.
 */
import type { ContextDocCategory } from '@devdigest/shared';
import {
  DOC_EXTENSIONS,
  EXCLUDED_DIRS,
  MAX_LISTED_DOCS,
  type SkipReason,
} from './constants.js';

// ---------------------------------------------------------------- listing

/** `.md` / `.markdown`, case-insensitive (AC-2). */
export function isDocPath(path: string): boolean {
  const lower = path.toLowerCase();
  return DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** True when a DIRECTORY segment of `path` is one of the excluded directory names (AC-2). */
export function hasExcludedSegment(path: string): boolean {
  const dirs = path.split('/').slice(0, -1);
  return dirs.some((seg) => (EXCLUDED_DIRS as readonly string[]).includes(seg));
}

/** U+0000–U+001F or U+007F anywhere in the string (AC-7, AC-70). */
export function hasControlChar(text: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(text);
}

/** Code-point comparison — NOT `localeCompare` (AC-3: `B.md` sorts before `a.md`). */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface SelectedDocs {
  docs: string[];
  /** How many documents the clone holds before the cap. */
  total: number;
  truncated: boolean;
}

/**
 * The listing rule (AC-2, AC-3, AC-5, AC-7): keep markdown files outside the
 * excluded directories with no control character in the path, order by code
 * point, cap at `MAX_LISTED_DOCS`.
 */
export function selectDocs(paths: readonly string[], cap: number = MAX_LISTED_DOCS): SelectedDocs {
  const kept = paths
    .filter((p) => isDocPath(p) && !hasExcludedSegment(p) && !hasControlChar(p))
    .sort(byCodePoint);
  return { docs: kept.slice(0, cap), total: kept.length, truncated: kept.length > cap };
}

/** AC-4 precedence: a `specs` directory beats everything, then INSIGHTS, then docs. */
export function categoryOf(path: string): ContextDocCategory {
  const segments = path.split('/');
  const file = segments[segments.length - 1] ?? '';
  const dirs = segments.slice(0, -1);
  if (dirs.includes('specs')) return 'specs';
  if (file.toLowerCase() === 'insights.md' || dirs.includes('insights')) return 'insights';
  return 'docs';
}

/** `{ name, folder }` of a repository-relative path; `folder` is `""` at the root. */
export function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf('/');
  return i === -1
    ? { name: path, folder: '' }
    : { name: path.slice(i + 1), folder: path.slice(0, i) };
}

/**
 * `ceil(chars / 4)` over the decoded string (AC-41, A-2). A twin of
 * `adapters/tokenizer/index.ts` — re-declared because a ring-1 file may not
 * import an adapter.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------- decoding

export type DecodedDoc = { ok: true; text: string } | { ok: false };

/**
 * Bytes → text, or "not a document we can show / inject": a NUL byte (binary)
 * or invalid UTF-8 (AC-57, AC-73). `ignoreBOM: true` keeps a BOM in the text
 * instead of silently stripping it.
 */
export function decodeDoc(bytes: Uint8Array): DecodedDoc {
  if (bytes.includes(0)) return { ok: false };
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { ok: true, text };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------- path validation

/**
 * Is `raw` an acceptable attachment / read path (AC-70)? Valid iff it is
 * non-empty, relative, free of `..` segments, URL schemes and control
 * characters, and ends in `.md` / `.markdown`. Deliberately NOT
 * `intent/helpers.ts:isSafeDocPath` (`.md` only, no control-char rule).
 * Stored paths are compared verbatim to listed paths, so nothing is trimmed.
 */
export function validateDocPath(raw: string): boolean {
  if (typeof raw !== 'string' || raw === '') return false;
  if (hasControlChar(raw)) return false;
  if (!isDocPath(raw)) return false;
  // A URL / scheme (http://, file://, javascript:) or a protocol-relative //host.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return false;
  // Any absolute form: POSIX, backslash-rooted, drive letter.
  if (raw.startsWith('/') || raw.startsWith('\\') || /^[a-zA-Z]:/.test(raw)) return false;
  // `..` is checked on BOTH separators so `docs\..\x.md` cannot slip through.
  if (raw.split(/[\\/]/).includes('..')) return false;
  return true;
}

// ---------------------------------------------------------------- run order & inheritance

export interface RunSkillPaths {
  enabled: boolean;
  paths: readonly string[];
}

/**
 * The documents a run injects, in order (AC-47..AC-49): the agent's own paths,
 * then each ENABLED linked skill's in link order; a path already seen keeps its
 * first position; a disabled skill contributes nothing.
 */
export function orderRunDocs(
  agentPaths: readonly string[],
  skills: readonly RunSkillPaths[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (p: string) => {
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  agentPaths.forEach(push);
  for (const skill of skills) if (skill.enabled) skill.paths.forEach(push);
  return out;
}

export interface LinkedSkillPaths extends RunSkillPaths {
  id: string;
  name: string;
}

export interface InheritedPath {
  path: string;
  skill_id: string;
  skill_name: string;
}

/**
 * Paths an agent inherits from its linked skills (AC-40, A-8): enabled skills
 * only, minus the agent's own direct paths, attributed to the FIRST enabled
 * skill (in link order) that attaches the path; run order.
 */
export function selectInherited(
  agentPaths: readonly string[],
  skills: readonly LinkedSkillPaths[],
): InheritedPath[] {
  const seen = new Set<string>(agentPaths);
  const out: InheritedPath[] = [];
  for (const skill of skills) {
    if (!skill.enabled) continue;
    for (const path of skill.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, skill_id: skill.id, skill_name: skill.name });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Run Log lines

/** AC-51. */
export function pcCheckoutLine(branch: string, sha: string): string {
  return `project context: read from clone checkout ${branch} @ ${sha}`;
}

/** AC-74 — the exact wording is part of the contract. */
export function pcBaseMismatchLine(base: string, branch: string): string {
  return `project context: base branch ${base} differs from clone branch ${branch} — documents read from ${branch}`;
}

/** AC-56..AC-58. */
export function pcSkipLine(path: string, reason: SkipReason): string {
  return `project context: skipped ${path} — ${reason}`;
}

/** AC-59. */
export function pcNotClonedLine(): string {
  return 'project context: skipped — repository not cloned';
}

/** AC-61. */
export function pcSummaryLine(attached: number, skipped: number): string {
  return `project context: ${attached} document(s) attached, ${skipped} skipped`;
}
