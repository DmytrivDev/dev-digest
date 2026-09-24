import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES, ROLE_ORDER, type NormalizedPath } from './constants.js';

/**
 * Pure Smart Diff rules — ring 1 (`core-not-to-io` guards this filename, see
 * `.dependency-cruiser.cjs`). No db, no fetch, no fs, no clock. Imports
 * nothing but `./constants.js` and the `SmartDiffRole`/`SmartDiff` types.
 */

/**
 * Normalise a path for classification: backslashes become forward slashes,
 * a leading `./` or `/` is stripped, and the result is split into segments.
 */
export function normalizePath(path: string): NormalizedPath {
  let p = path.replace(/\\/g, '/');
  while (p.startsWith('./') || p.startsWith('/')) {
    p = p.startsWith('./') ? p.slice(2) : p.slice(1);
  }
  const segments = p.split('/').filter((s) => s.length > 0);
  const base = segments[segments.length - 1] ?? '';
  const dirs = segments.slice(0, -1);
  const first = segments[0] ?? '';
  return { segments, dirs, base, first };
}

/** Classify one file path into a Smart Diff role. First matching rule wins, else 'core'. */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = normalizePath(path);
  for (const rule of CLASSIFY_RULES) {
    if (rule.test(normalized)) return rule.role;
  }
  return 'core';
}

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffInputFinding {
  file: string;
  startLine: number;
}

/**
 * Build the full Smart Diff response from a PR's files and its latest
 * review's findings. Always emits all five groups in `ROLE_ORDER`, even
 * empty ones, so the shape is stable regardless of what the PR contains.
 *
 * L08's pre-prompt filter is expected to import `classifyFile` directly from
 * this module — this function is the HTTP-facing shape, not the reusable
 * primitive.
 */
export function buildSmartDiff(
  files: SmartDiffInputFile[],
  findings: SmartDiffInputFinding[],
): SmartDiff {
  // path -> ascending, de-duplicated finding lines, keyed by normalised path
  // so a Windows-style finding path still anchors on a POSIX-style file path.
  const linesByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    const key = normalizePath(f.file).segments.join('/');
    const set = linesByPath.get(key) ?? new Set<number>();
    set.add(f.startLine);
    linesByPath.set(key, set);
  }

  const groups = new Map<SmartDiffRole, SmartDiff['groups'][number]['files']>(
    ROLE_ORDER.map((role) => [role, []]),
  );

  let totalLines = 0;
  for (const file of files) {
    const role = classifyFile(file.path);
    const key = normalizePath(file.path).segments.join('/');
    const lines = linesByPath.has(key) ? [...linesByPath.get(key)!].sort((a, b) => a - b) : [];
    groups.get(role)!.push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: lines,
    });
    totalLines += file.additions + file.deletions;
  }

  return {
    groups: ROLE_ORDER.map((role) => ({ role, files: groups.get(role)! })),
    split_suggestion: {
      too_big: false,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}
