import type {
  BlastCaller,
  BlastCounts,
  BlastRadius,
  DownstreamImpact,
  PathPullRequest,
  PrHistoryItem,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, DegradedReason } from '../repo-intel/types.js';
import type { FileRankRow } from '../repo-intel/types.js';

/**
 * Pure blast-radius mapping — ring 1 (`core-not-to-io` guards this filename).
 * No db, no fetch, no fs, no clock. Type-only imports of `@devdigest/shared`
 * and `../repo-intel/types.js` (precedent `smart-diff/helpers.ts:1`).
 */

/**
 * 1:1 map of the facade's `DegradedReason` to the wire `BlastDegradedReason`.
 * Exhaustive `switch` so a new facade reason fails TYPECHECK here rather than
 * silently falling through.
 */
function mapReason(reason: DegradedReason): BlastRadius['reason'] {
  switch (reason) {
    case 'flag_off':
      return 'flag_off';
    case 'index_failed':
      return 'index_failed';
    case 'index_partial':
      return 'index_partial';
    case 'repo_too_large':
      return 'repo_too_large';
    case 'no_data':
      return 'no_data';
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/** Deterministic English count string, e.g. "3 symbols changed → 7 callers, 2 endpoints, 0 crons". */
export function blastSummary(counts: BlastCounts): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return (
    `${plural(counts.symbols, 'symbol')} changed → ` +
    `${plural(counts.callers, 'caller')}, ${plural(counts.endpoints, 'endpoint')}, ` +
    `${plural(counts.crons, 'cron')}`
  );
}

const TEST_DIR_RE = /(^|\/)(test|tests|__tests__|e2e)\//;
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** A test/spec file — its request URLs are fixtures, not routes it serves. */
export function isTestPath(file: string): boolean {
  return TEST_DIR_RE.test(file) || TEST_FILE_RE.test(file);
}

/**
 * The endpoints/crons a caller file really DECLARES. The indexer's endpoint
 * extractor also matches outgoing request URLs, so two kinds of fact are
 * dropped: everything from a test file, and any endpoint whose path carries a
 * `${…}` interpolation (a client-side URL being built, never a route pattern).
 * Test callers themselves stay in the map — they are real references.
 */
export function declaredFacts(
  file: string,
  facts: BlastResult['factsByFile'],
): { endpoints: string[]; crons: string[] } | undefined {
  const f = facts?.[file];
  if (!f || isTestPath(file)) return undefined;
  return { endpoints: f.endpoints.filter((e) => !e.includes('${')), crons: f.crons };
}

function buildCounts(symbolCount: number, downstream: DownstreamImpact[]): BlastCounts {
  const callers = downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpoints = new Set(downstream.flatMap((d) => d.endpoints_affected)).size;
  const crons = new Set(downstream.flatMap((d) => d.crons_affected)).size;
  return { symbols: symbolCount, callers, endpoints, crons };
}

/**
 * Implements Key decision 5 of docs/plans/blast-radius.plan.md:
 *   - group callers by `viaSymbol`; a symbol with zero callers gets no group
 *     but still counts in `changed_symbols`;
 *   - a group's `endpoints_affected`/`crons_affected` is the de-duplicated,
 *     sorted union of the callers' `declaredFacts` (test files and
 *     interpolated request URLs filtered out);
 *   - each caller carries its OWN declared endpoints/crons;
 *   - groups sort by max caller rank desc, then caller count desc, then
 *     symbol name asc; callers inside a group sort by rank desc, file asc,
 *     line asc.
 * The per-symbol cap is applied upstream, in the facade (W2) — this function
 * does not re-cap and hardcodes no limit.
 */
export function toBlastRadius(result: BlastResult): BlastRadius {
  const changedSymbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const byViaSymbol = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    const arr = byViaSymbol.get(c.viaSymbol);
    if (arr) arr.push(c);
    else byViaSymbol.set(c.viaSymbol, [c]);
  }

  const facts = result.factsByFile ?? {};

  const groups = [...byViaSymbol.entries()].map(([symbol, rows]) => ({ symbol, rows }));
  groups.sort((a, b) => {
    const maxRankA = a.rows.reduce((m, r) => Math.max(m, r.rank), 0);
    const maxRankB = b.rows.reduce((m, r) => Math.max(m, r.rank), 0);
    if (maxRankB !== maxRankA) return maxRankB - maxRankA;
    if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
    return a.symbol.localeCompare(b.symbol);
  });

  const downstream: DownstreamImpact[] = groups.map(({ symbol, rows }) => {
    const sorted = [...rows].sort(
      (a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line,
    );
    const callers: BlastCaller[] = sorted.map((r) => {
      const f = declaredFacts(r.file, facts);
      return {
        name: r.symbol,
        file: r.file,
        line: r.line,
        endpoints: f?.endpoints,
        crons: f?.crons,
      };
    });
    const endpointsSet = new Set<string>();
    const cronsSet = new Set<string>();
    for (const r of sorted) {
      const f = declaredFacts(r.file, facts);
      if (!f) continue;
      for (const e of f.endpoints) endpointsSet.add(e);
      for (const c of f.crons) cronsSet.add(c);
    }
    return {
      symbol,
      callers,
      endpoints_affected: [...endpointsSet].sort(),
      crons_affected: [...cronsSet].sort(),
    };
  });

  const counts = buildCounts(changedSymbols.length, downstream);

  return {
    changed_symbols: changedSymbols,
    downstream,
    summary: blastSummary(counts),
    degraded: result.degraded,
    reason: result.reason ? mapReason(result.reason) : undefined,
    index_status: result.indexStatus,
    indexed_sha: result.indexedSha,
    counts,
  };
}

/** Used when `pr_files` is empty AND GitHub is unavailable — see Key decision 3. */
export function emptyBlastRadius(reason: 'files_unavailable'): BlastRadius {
  const counts: BlastCounts = { symbols: 0, callers: 0, endpoints: 0, crons: 0 };
  return {
    changed_symbols: [],
    downstream: [],
    summary: blastSummary(counts),
    degraded: true,
    reason,
    counts,
  };
}

// ---- PR history (W9) -------------------------------------------------------

/** Highest `percentile` first, then path asc; a path with no rank row sorts as 0. */
export function pickHistoryPaths(files: string[], ranks: FileRankRow[], max: number): string[] {
  const percentileByPath = new Map(ranks.map((r) => [r.path, r.percentile]));
  return [...files]
    .sort((a, b) => {
      const pa = percentileByPath.get(a) ?? 0;
      const pb = percentileByPath.get(b) ?? 0;
      if (pb !== pa) return pb - pa;
      return a.localeCompare(b);
    })
    .slice(0, max);
}

/** `Merged N day(s) before this PR was opened; overlaps K changed file(s).`,
 *  or just the overlap clause when `prOpenedAt` is null or the merge happened
 *  at or after it (no "before" claim can be made). */
function historyNotes(mergedAt: string, prOpenedAt: string | null, overlapCount: number): string {
  const overlapClause = `overlaps ${overlapCount} changed file${overlapCount === 1 ? '' : 's'}.`;
  if (!prOpenedAt) return overlapClause;
  const diffMs = new Date(prOpenedAt).getTime() - new Date(mergedAt).getTime();
  if (!(diffMs > 0)) return overlapClause; // merged at/after the PR opened, or an invalid date
  const days = Math.round(diffMs / 86_400_000);
  return `Merged ${days} day${days === 1 ? '' : 's'} before this PR was opened; ${overlapClause}`;
}

/**
 * De-duplicates by PR number (excluding the current PR), attaches which of
 * the queried paths each PR touched, sorts by `merged_at` desc, and caps at
 * `max`.
 */
export function buildPrHistory(
  perPath: { path: string; pulls: PathPullRequest[] }[],
  currentNumber: number,
  prOpenedAt: string | null,
  max: number,
): PrHistoryItem[] {
  const byNumber = new Map<number, { pull: PathPullRequest; paths: Set<string> }>();
  for (const { path, pulls } of perPath) {
    for (const pull of pulls) {
      if (pull.number === currentNumber) continue;
      const entry = byNumber.get(pull.number);
      if (entry) entry.paths.add(path);
      else byNumber.set(pull.number, { pull, paths: new Set([path]) });
    }
  }

  const items: PrHistoryItem[] = [...byNumber.values()].map(({ pull, paths }) => ({
    pr_number: pull.number,
    title: pull.title,
    merged_at: pull.merged_at,
    author: pull.author,
    files_overlap: [...paths].sort(),
    notes: historyNotes(pull.merged_at, prOpenedAt, paths.size),
  }));

  items.sort((a, b) => b.merged_at.localeCompare(a.merged_at));
  return items.slice(0, max);
}
