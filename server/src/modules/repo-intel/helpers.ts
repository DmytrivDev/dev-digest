/**
 * repo-intel — pure helpers for the blast-radius facade (`getBlastRadius`).
 *
 * Kept in a file named `helpers.ts` (not `service.ts`) so `arch:check`'s
 * ring-1 `core-not-to-io` rule picks it up by filename
 * (`server/.dependency-cruiser.cjs:23`) — these functions take plain rows and
 * do no I/O.
 */
import type { BlastCallerRow, DegradedReason, IndexState } from './types.js';

/** Drops a caller row whose file is the SAME file that declares its symbol. */
export function excludeSelfCallers<T extends { file: string; declFile: string }>(
  rows: T[],
): T[] {
  return rows.filter((r) => r.file !== r.declFile);
}

/**
 * Caps callers PER SYMBOL (not globally): groups by `viaSymbol`, sorts each
 * group by rank desc / file asc / line asc, keeps the top `max`, then
 * flattens and re-sorts the result by rank desc.
 */
export function capCallersPerSymbol(
  rows: BlastCallerRow[],
  max: number,
): BlastCallerRow[] {
  const bySymbol = new Map<string, BlastCallerRow[]>();
  for (const row of rows) {
    const arr = bySymbol.get(row.viaSymbol);
    if (arr) arr.push(row);
    else bySymbol.set(row.viaSymbol, [row]);
  }
  const capped: BlastCallerRow[] = [];
  for (const group of bySymbol.values()) {
    group.sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line);
    capped.push(...group.slice(0, max));
  }
  capped.sort((a, b) => b.rank - a.rank);
  return capped;
}

/**
 * Path kinds excluded from rank-driven file samples (conventions/onboarding):
 * tests, configs, declaration files, migrations, generated dirs. Substring
 * match on the repo-relative path (kept deliberately simple + deterministic).
 */
export const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

export function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Total number of candidate files the walk found, when it kept only the first
 * N (`stats.bounded` = how many it dropped, `stats.filesSeen` = how many it
 * kept). `null` when the walk was not truncated or the stats lack the numbers.
 */
export function walkTotalFromStats(stats: Record<string, unknown>): number | null {
  const bounded = stats.bounded;
  const seen = stats.filesSeen;
  if (typeof bounded !== 'number' || !(bounded > 0)) return null;
  if (typeof seen !== 'number') return null;
  return seen + bounded;
}

/**
 * The facade's `reason` means "why the index was not fully used", never
 * "no results". Order matches Key decision 7 of docs/plans/blast-radius.plan.md.
 */
export function fallbackReason(opts: {
  flagOn: boolean;
  state: IndexState | null;
}): DegradedReason {
  if (!opts.flagOn) return 'flag_off';
  if (opts.state?.degradedReason) return opts.state.degradedReason;
  if (opts.state?.status === 'failed') return 'index_failed';
  return 'no_data';
}
