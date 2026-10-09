/* eval-case-diff.ts — the client's copy of the rules a manual eval case's diff
   must pass (SPEC-05), so the case modal can say "this will be rejected" while
   the user types, before any request.

   It is a PORT of the server (`modules/eval/helpers/case-diff.ts`
   `checkPastedDiff` / `rangeIntersectsHunks`, and the hunk numbering of
   `adapters/git/diff-parser.ts`). Both packages run the same fixture list
   (`server/test/fixtures/eval-case-diff-parity.json`), which is the guard
   against the two drifting apart (AC-12).

   Pure: no React, no hooks, no I/O. The only value import is the one size
   constant, so a single number governs both packages. */

import { EVAL_CASE_MAX_BYTES } from "@devdigest/shared";
import type { EvalCaseInputErrorCode, EvalExpectation, PrFile } from "@devdigest/shared";

/** The diff-shape failures a paste can have (`diff_frozen` is an update-time rule). */
export type PastedDiffCode = Exclude<EvalCaseInputErrorCode, "diff_frozen">;

/** Matches a unified-diff hunk header, as the server's parser does. */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** One line of a hunk that owns a new-side number (a removed line owns none). */
export interface NumberedLine {
  kind: "added" | "context";
  newNo: number;
}

export interface CaseHunk {
  /** Declared new-side range: `newStart` .. `newStart + newLines - 1`. */
  newStart: number;
  newLines: number;
  /** Every numbered line, as the server parser numbers them — before the clamp. */
  lines: NumberedLine[];
}

export type DiffCheck =
  | {
      ok: true;
      /** The file named by the first `+++` header, without its `b/` prefix. */
      path: string;
      hunks: CaseHunk[];
      /** The hunk text only — first `@@` line to the end, LF endings, no trailing newline. */
      body: string;
    }
  /** `code: null` is the empty paste: show neither a message nor a preview (AC-7). */
  | { ok: false; code: PastedDiffCode | null };

const FAIL_EMPTY: DiffCheck = { ok: false, code: null };

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function countLines(lines: string[], prefix: string): number {
  let n = 0;
  for (const line of lines) if (line.startsWith(prefix)) n++;
  return n;
}

/**
 * Parse the hunks the way the server parser does once the case diff is stored:
 * `+++ ` / `--- ` lines are skipped, `+` is an addition, `-` a removal, anything
 * else (a blank line, a `\ No newline` marker) is context.
 */
function parseHunks(bodyLines: string[]): CaseHunk[] {
  const hunks: CaseHunk[] = [];
  let hunk: CaseHunk | null = null;
  let cursor = 0;
  for (const line of bodyLines) {
    if (line.startsWith("diff --git") || line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    const hh = line.match(HUNK_HEADER);
    if (hh) {
      hunk = { newStart: Number(hh[3]), newLines: hh[4] ? Number(hh[4]) : 1, lines: [] };
      hunks.push(hunk);
      cursor = hunk.newStart;
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      hunk.lines.push({ kind: "added", newNo: cursor++ });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      // a removal consumes no new-side line
    } else {
      hunk.lines.push({ kind: "context", newNo: cursor++ });
    }
  }
  return hunks;
}

/**
 * The server's `checkPastedDiff`, in the same order — the first failure wins:
 * size → parse (a named file, an `@@` hunk) → more than one file.
 * Size is measured on the raw text as typed; CRLF is normalised afterwards.
 */
export function checkPastedDiff(raw: string): DiffCheck {
  if (raw.length === 0) return FAIL_EMPTY;
  if (utf8Bytes(raw) > EVAL_CASE_MAX_BYTES) return { ok: false, code: "diff_too_large" };

  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  const plusLine = lines.find((l) => l.startsWith("+++ "));
  const rawPath = plusLine === undefined ? "" : plusLine.slice(4).trim().replace(/^b\//, "");
  if (rawPath === "" || rawPath === "/dev/null") return { ok: false, code: "diff_unparseable" };

  const firstHunk = lines.findIndex((l) => HUNK_HEADER.test(l));
  if (firstHunk === -1) return { ok: false, code: "diff_unparseable" };

  if (Math.max(countLines(lines, "diff --git"), countLines(lines, "+++ ")) > 1) {
    return { ok: false, code: "multi_file_diff" };
  }

  // Stored as `<header>\n<hunks without trailing newlines>\n`: the final empty
  // element of the split is a context line to the server parser, so keep it.
  const body = lines.slice(firstHunk).join("\n").replace(/\n+$/, "");
  const hunks = parseHunks(`${body}\n`.split("\n"));
  return { ok: true, path: rawPath, hunks, body };
}

/** New-side numbers of one hunk after the clamp to its header range. */
export interface HunkCoverage {
  /** Every new-side line the hunk covers. */
  numbers: number[];
  firstAdded: number | null;
  firstContext: number | null;
}

/**
 * Per hunk, the new-side lines it really covers: the numbered lines clamped to
 * the header's declared range (the parser also numbers a trailing blank line and
 * a `\ No newline` marker, which would make the line just past the hunk look
 * covered). A hunk with no body lines falls back to its header range.
 */
export function caseNewSideLines(hunks: readonly CaseHunk[]): HunkCoverage[] {
  return hunks.map((h) => {
    const first = h.newStart;
    const last = h.newStart + h.newLines - 1;
    if (h.lines.length === 0) {
      return {
        numbers: Array.from({ length: Math.max(h.newLines, 0) }, (_, i) => first + i),
        firstAdded: null,
        firstContext: null,
      };
    }
    const inside = h.lines.filter((l) => l.newNo >= first && l.newNo <= last);
    return {
      numbers: inside.map((l) => l.newNo),
      firstAdded: inside.find((l) => l.kind === "added")?.newNo ?? null,
      firstContext: inside.find((l) => l.kind === "context")?.newNo ?? null,
    };
  });
}

export type ExpectationDiffError = "file_mismatch" | "range_outside_hunks";

/**
 * Whether a valid expectation fits the diff (AC-11): its file is the diff's file
 * and its range covers at least one new-side line of a hunk. `null` = fits, or
 * there is no valid diff to compare with.
 */
export function expectationDiffError(
  check: DiffCheck,
  exp: Pick<EvalExpectation, "file" | "start_line" | "end_line">,
): ExpectationDiffError | null {
  if (!check.ok) return null;
  if (exp.file !== check.path) return "file_mismatch";
  const lo = Math.min(exp.start_line, exp.end_line);
  const hi = Math.max(exp.start_line, exp.end_line);
  const covered = caseNewSideLines(check.hunks).some((h) => h.numbers.some((n) => n >= lo && n <= hi));
  return covered ? null : "range_outside_hunks";
}

/** What the "Finding skeleton" button writes into the Expected output pane. */
export interface FindingSkeleton {
  kind: "must_find";
  file: string;
  start_line: number;
  end_line: number;
}

/**
 * `must_find` on the diff's first added new-side line, else its first context
 * line (AC-9); `null` when the diff has no new-side line at all (AC-10).
 */
export function findingSkeleton(check: DiffCheck): FindingSkeleton | null {
  if (!check.ok) return null;
  const coverage = caseNewSideLines(check.hunks);
  const line =
    coverage.find((h) => h.firstAdded !== null)?.firstAdded ??
    coverage.find((h) => h.firstContext !== null)?.firstContext ??
    null;
  return line === null ? null : { kind: "must_find", file: check.path, start_line: line, end_line: line };
}

/**
 * The file for the shared diff viewer. Only hunk text goes in: the pasted
 * `diff --git` / `index` / `---` / `+++` header lines are not diff lines (AC-6),
 * and `\ No newline` markers are dropped so the gutter never numbers one (AC-5).
 */
export function previewFile(check: Extract<DiffCheck, { ok: true }>): PrFile {
  const patchLines = check.body
    .split("\n")
    .filter((l) => !l.startsWith("\\") && !l.startsWith("diff --git") && !l.startsWith("+++ ") && !l.startsWith("--- "));
  let additions = 0;
  let deletions = 0;
  for (const l of patchLines) {
    if (l.startsWith("+")) additions++;
    else if (l.startsWith("-")) deletions++;
  }
  return { path: check.path, additions, deletions, patch: patchLines.join("\n") };
}
