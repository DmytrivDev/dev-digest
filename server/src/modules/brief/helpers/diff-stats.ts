import { classifyFile } from '../../smart-diff/helpers.js';
import type { FileStat, LineRange, StoredFile } from '../types.js';

/**
 * Per-file diff statistics for the brief — pure, ring 1 (`core-not-to-io` guards this
 * filename). The model sees path, role, counts and changed ranges — NEVER a hunk body
 * (AC-51). Own hunk-header reader on purpose: `adapters/git/diff-parser.ts` is an adapter
 * and may not be imported from here.
 */

/** `@@ -a[,b] +c[,d] @@` — only the new-side start `c` and count `d` matter. */
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * New-side changed line ranges of a patch, read from the hunk headers only (AC-50).
 * A missing count is 1; a count of 0 (a pure deletion) yields no range. `+12,7` → `12-18`.
 */
export function changedRanges(patch: string | null): LineRange[] {
  if (!patch) return [];
  const out: LineRange[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('@@')) continue;
    const m = HUNK_HEADER_RE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || count < 1 || start < 1) {
      continue;
    }
    out.push({ start, end: start + count - 1 });
  }
  return out;
}

/** One `FileStat` per stored file, in the given order. Role comes from the Smart Diff classifier. */
export function fileStats(files: readonly StoredFile[]): FileStat[] {
  return files.map((f) => ({
    path: f.path,
    role: classifyFile(f.path),
    additions: f.additions,
    deletions: f.deletions,
    ranges: changedRanges(f.patch),
    hasPatch: f.patch !== null,
  }));
}

/** Churn = additions + deletions: the ranking the budget cuts file rows by (AC-62 tier 5). */
export function churn(f: Pick<FileStat, 'additions' | 'deletions'>): number {
  return f.additions + f.deletions;
}
