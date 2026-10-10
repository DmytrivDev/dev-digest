import type { EvalCaseInputErrorCode, UnifiedDiff } from '@devdigest/shared';
import {
  CASE_INPUT_ERROR,
  CASE_NAME_FALLBACK,
  CASE_NAME_MAX,
  MAX_CASE_DIFF_BYTES,
} from '../constants.js';

/**
 * Pure rules for turning a finding's file patch into a stored eval-case diff (SPEC-04).
 * Ring 1: it never imports `adapters/git/diff-parser` (`core-not-to-io`) — callers pass
 * an already-parsed `UnifiedDiff`.
 */

/**
 * The single-file unified diff stored on a case: the `diff --git` header
 * `parseUnifiedDiff` expects, then the file's patch (hunks only, as GitHub returns it).
 * Ends in exactly one newline.
 */
export function buildCaseDiff(path: string, patch: string): string {
  // Newlines only: a trailing " " is a real (blank) context line and must survive.
  const body = patch.replace(/(\r?\n)+$/, '');
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${body}\n`;
}

/** True when the diff is over the stored-case size cap (AC-23). Exactly the cap is allowed. */
export function caseDiffTooLarge(diff: string): boolean {
  return Buffer.byteLength(diff, 'utf8') > MAX_CASE_DIFF_BYTES;
}

/** The hunk header the diff parser recognises: `@@ -N[,M] +N[,M] @@`. */
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;

/** Outcome of {@link checkPastedDiff}. A failure carries the first failing check's code. */
export type PastedDiffCheck =
  | { ok: true; path: string; diff: string }
  | { ok: false; code: Extract<EvalCaseInputErrorCode, 'diff_too_large' | 'diff_unparseable' | 'multi_file_diff'> };

/**
 * Validate and normalise a diff pasted into a manual case (SPEC-05 AC-22, AC-23, AC-25).
 *
 * Checks run in a fixed order and the first failure wins, so a client mirroring them
 * (`client/src/lib/eval-case-diff.ts`, same fixture list) shows the same message:
 *   1. size, measured on the text AS SENT (before CRLF normalisation);
 *   2. the path, from the FIRST `+++ ` line — missing or `/dev/null` is unparseable;
 *   3. at least one `@@ -N[,M] +N[,M] @@` hunk header;
 *   4. one file only: `max(#"diff --git", #"+++ ")` lines.
 *
 * On success `diff` is the single-file form every case stores: the pasted `diff --git`,
 * `index`, `---` and `+++` lines are dropped and rebuilt from the path, so a `+++`-only
 * paste and a full-header paste store the same text. Pure — it parses nothing with the
 * adapter's parser; the caller does that on the result.
 */
export function checkPastedDiff(raw: string): PastedDiffCheck {
  if (caseDiffTooLarge(raw)) return { ok: false, code: CASE_INPUT_ERROR.diffTooLarge };

  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  const plusLine = lines.find((l) => l.startsWith('+++ '));
  const path = plusLine === undefined ? '' : plusLine.slice(4).trim().replace(/^b\//, '');
  if (plusLine === undefined || path === '' || path === '/dev/null') {
    return { ok: false, code: CASE_INPUT_ERROR.diffUnparseable };
  }

  const firstHunk = lines.findIndex((l) => HUNK_HEADER_RE.test(l));
  if (firstHunk === -1) return { ok: false, code: CASE_INPUT_ERROR.diffUnparseable };

  const gitHeaders = lines.filter((l) => l.startsWith('diff --git')).length;
  const plusHeaders = lines.filter((l) => l.startsWith('+++ ')).length;
  if (Math.max(gitHeaders, plusHeaders) > 1) {
    return { ok: false, code: CASE_INPUT_ERROR.multiFileDiff };
  }

  return { ok: true, path, diff: buildCaseDiff(path, lines.slice(firstHunk).join('\n')) };
}

/** The path of the one file in a parsed case diff, or undefined if it is not single-file. */
export function diffFilePath(diff: UnifiedDiff): string | undefined {
  return diff.files.length === 1 ? diff.files[0]!.path : undefined;
}

/**
 * Whether `[start, end]` covers at least one new-side line of a hunk of `file` (AC-22,
 * AC-42) — the same rule as the grounding gate (`reviewer-core/src/grounding.ts`), so a
 * range a case accepts is a range a finding can be grounded on. A removed-only line has
 * no new-side number and does not count.
 *
 * Line numbers are clamped to the hunk header's declared new range. `parseUnifiedDiff`
 * also numbers a trailing empty line and a `\ No newline at end of file` marker as
 * context, which would otherwise make the line just past the last hunk look covered.
 */
export function rangeIntersectsHunks(
  diff: UnifiedDiff,
  file: string,
  start: number,
  end: number,
): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (const f of diff.files) {
    if (f.path !== file) continue;
    for (const h of f.hunks) {
      const first = h.newStart;
      const last = h.newStart + h.newLines - 1;
      const numbers =
        h.newLineNumbers && h.newLineNumbers.length > 0
          ? h.newLineNumbers.filter((n) => n >= first && n <= last)
          : Array.from({ length: Math.max(h.newLines, 0) }, (_, i) => first + i);
      if (numbers.some((n) => n >= lo && n <= hi)) return true;
    }
  }
  return false;
}

/**
 * Kebab slug of a finding title (AC-16): lowercase, non-alphanumerics collapsed to `-`,
 * trimmed, cut to `max` characters with no trailing `-`. A title with nothing to keep
 * (all symbols, or non-Latin) falls back to a fixed name so a case is never nameless.
 */
export function slugifyTitle(title: string, max: number = CASE_NAME_MAX): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
  return slug || CASE_NAME_FALLBACK;
}

/**
 * `base` if free, else `base-2`, `base-3`, … (AC-16). The base is shortened when needed
 * so the suffixed name still fits in {@link CASE_NAME_MAX}.
 */
export function uniqueCaseName(base: string, existing: ReadonlySet<string>): string {
  if (!existing.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const head = base.slice(0, Math.max(CASE_NAME_MAX - suffix.length, 1)).replace(/-+$/, '');
    const candidate = `${head}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
}
