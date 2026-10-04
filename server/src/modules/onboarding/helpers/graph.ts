import type { OnboardingEmptyReason } from '@devdigest/shared';
import {
  CHAIN_DEPTH,
  CRITICAL_PATH_ROOTS,
  CRITICAL_PATHS_MAX,
  PACKAGE_CONTAINERS,
  PACKAGE_DIAGRAM_NODES_MAX,
  PACKAGE_DIAGRAM_ROW_MAX,
  READING_PATH_MAX,
  ROOT_PACKAGE,
} from '../constants.js';
import type { RankedFile } from '../types.js';
import { isJunkPath } from '../../repo-intel/helpers.js';
import { hasControlChar } from './rank.js';

/**
 * Reading path, critical paths and the skeleton package diagram (SPEC-02 AC-61..AC-65,
 * AC-82). Ring 1: pure over the ranked files and the import edges. The chains run on
 * the TOUR rank (plan A-4), which the repo-intel facade does not know.
 */

export interface ImportEdge {
  from: string;
  to: string;
}

export interface CriticalPathRow {
  path: string;
  /** Distinct indexed files with an import edge to `path` (AC-63). */
  imported_by: number;
}

export interface PathSections {
  reading: { paths: string[]; empty_reason: OnboardingEmptyReason | null };
  critical: { items: CriticalPathRow[]; empty_reason: OnboardingEmptyReason | null };
}

const CONTAINERS: readonly string[] = PACKAGE_CONTAINERS;

/**
 * The package directory a file belongs to: its first path segment, the first two
 * under a `packages`/`apps`/`services`/`libs` container, `(root)` for a root file.
 */
export function packageDirOf(path: string): string {
  const segments = path.split('/');
  if (segments.length <= 1) return ROOT_PACKAGE;
  const first = segments[0] as string;
  if (CONTAINERS.includes(first) && segments.length >= 3) return `${first}/${segments[1]}`;
  return first;
}

/**
 * A dot-directory (`.claude`, `.github`, `.husky`) holds tooling, not a part of the
 * product, so it is never listed as a package nor drawn in the diagram.
 */
export function isToolingDir(dir: string): boolean {
  return dir.startsWith('.');
}

function safeEdges(edges: readonly ImportEdge[]): ImportEdge[] {
  return edges.filter(
    (e) => e.from !== e.to && !hasControlChar(e.from) && !hasControlChar(e.to),
  );
}

/** Up to 8 files outside the exclusion set, in the order given (AC-61). */
export function readingPath(ranked: readonly RankedFile[]): RankedFile[] {
  const out: RankedFile[] = [];
  for (const file of ranked) {
    if (hasControlChar(file.path) || isJunkPath(file.path)) continue;
    out.push(file);
    if (out.length >= READING_PATH_MAX) break;
  }
  return out;
}

/**
 * For each of the top roots BY TOUR RANK, follow the highest-ranked import target up
 * to `CHAIN_DEPTH` hops without revisiting a file; keep chains of at least two files.
 * Equal-ranked targets resolve by path, so the result is deterministic.
 * Mirrors `RepoIntelService.getCriticalPaths`, on the tour rank.
 */
export function dependencyChains(
  ranked: readonly RankedFile[],
  edges: readonly ImportEdge[],
): string[][] {
  const clean = safeEdges(edges);
  const rankOf = new Map(ranked.map((r) => [r.path, r.rank]));
  const adjacency = new Map<string, string[]>();
  for (const e of clean) {
    const targets = adjacency.get(e.from);
    if (targets) targets.push(e.to);
    else adjacency.set(e.from, [e.to]);
  }

  const chains: string[][] = [];
  const seen = new Set<string>();
  for (const root of ranked.slice(0, CRITICAL_PATH_ROOTS)) {
    const chain = [root.path];
    const inChain = new Set(chain);
    let current = root.path;
    for (let hop = 0; hop < CHAIN_DEPTH; hop += 1) {
      const candidates = (adjacency.get(current) ?? []).filter((t) => !inChain.has(t));
      candidates.sort((a, b) => {
        const ra = rankOf.get(a) ?? 0;
        const rb = rankOf.get(b) ?? 0;
        if (ra !== rb) return ra > rb ? -1 : 1;
        if (a === b) return 0;
        return a < b ? -1 : 1;
      });
      const next = candidates[0];
      if (next === undefined) break;
      chain.push(next);
      inChain.add(next);
      current = next;
    }
    if (chain.length < 2) continue;
    const key = chain.join('\n');
    if (seen.has(key)) continue;
    seen.add(key);
    chains.push(chain);
  }
  return chains;
}

/**
 * Up to 6 distinct files outside the exclusion set: chains in root-rank order, chain
 * order within a chain, the first appearance of a file wins (AC-62). Each row carries
 * the number of distinct importers (AC-63).
 */
export function criticalPaths(
  chains: readonly (readonly string[])[],
  edges: readonly ImportEdge[],
): CriticalPathRow[] {
  const importers = new Map<string, Set<string>>();
  for (const e of safeEdges(edges)) {
    const set = importers.get(e.to);
    if (set) set.add(e.from);
    else importers.set(e.to, new Set([e.from]));
  }

  const out: CriticalPathRow[] = [];
  const seen = new Set<string>();
  for (const chain of chains) {
    for (const path of chain) {
      if (seen.has(path)) continue;
      seen.add(path);
      if (hasControlChar(path) || isJunkPath(path)) continue;
      out.push({ path, imported_by: importers.get(path)?.size ?? 0 });
      if (out.length >= CRITICAL_PATHS_MAX) return out;
    }
  }
  return out;
}

/**
 * Both path sections with their `empty_reason`. `unsupported_language` wins and empties
 * both (AC-65); it applies when the caller says so or when nothing was ranked at all.
 * No edges → critical paths empty `no_import_graph` (AC-64). A section that is empty
 * for another reason (every ranked file excluded, no chain from the roots) carries
 * `empty_reason: null` — the spec has no reason for it (plan: Spec follow-up 2).
 */
export function pathSections(input: {
  ranked: readonly RankedFile[];
  edges: readonly ImportEdge[];
  unsupportedLanguage?: boolean;
}): PathSections {
  const ranked = input.ranked.filter((r) => !hasControlChar(r.path));
  if (input.unsupportedLanguage || ranked.length === 0) {
    return {
      reading: { paths: [], empty_reason: 'unsupported_language' },
      critical: { items: [], empty_reason: 'unsupported_language' },
    };
  }

  const reading = readingPath(ranked).map((r) => r.path);
  const edges = safeEdges(input.edges);
  if (edges.length === 0) {
    return {
      reading: { paths: reading, empty_reason: null },
      critical: { items: [], empty_reason: 'no_import_graph' },
    };
  }
  const critical = criticalPaths(dependencyChains(ranked, edges), edges);
  return {
    reading: { paths: reading, empty_reason: null },
    critical: { items: critical, empty_reason: null },
  };
}

/** Every character outside this set becomes `_` in a diagram label (AC-82). */
const LABEL_UNSAFE_RE = /[^A-Za-z0-9._/@() -]/g;

/**
 * The deterministic skeleton diagram: a `flowchart LR` over the (at most 12) package
 * directories holding the most indexed files, one `A --> B` per distinct pair where an
 * indexed file in A imports one in B. `null` when the index holds no import edges.
 *
 * Layout: Mermaid stacks every disconnected node vertically, so a repo of independent
 * packages renders as a tall column. Packages with no edge are therefore chained with
 * INVISIBLE links (`a ~~~ b`, drawn as nothing) into rows of `PACKAGE_DIAGRAM_ROW_MAX`,
 * and the last row leads into the first connected package — the diagram reads left to
 * right. Invisible links carry no meaning; only `-->` lines are imports.
 */
export function packageDiagram(
  files: readonly { path: string }[],
  edges: readonly ImportEdge[],
): string | null {
  const clean = safeEdges(edges);
  if (clean.length === 0) return null;

  const counts = new Map<string, number>();
  for (const f of files) {
    if (hasControlChar(f.path)) continue;
    const dir = packageDirOf(f.path);
    if (isToolingDir(dir)) continue;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  const nodes = [...counts.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) return a[1] > b[1] ? -1 : 1;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .slice(0, PACKAGE_DIAGRAM_NODES_MAX)
    .map(([dir]) => dir);
  const idOf = new Map(nodes.map((dir, i) => [dir, `p${i}`]));

  const links = new Set<string>();
  const linked = new Set<string>();
  for (const e of clean) {
    const a = idOf.get(packageDirOf(e.from));
    const b = idOf.get(packageDirOf(e.to));
    if (a === undefined || b === undefined || a === b) continue;
    links.add(`  ${a} --> ${b}`);
    linked.add(a);
    linked.add(b);
  }
  const sortedLinks = [...links].sort();
  // The source of the first edge: the isolated rows lead into it, left to right.
  const firstSource = sortedLinks[0]?.trim().split(' ')[0];

  // Isolated packages, in node order, chained into rows (see the doc comment).
  const isolated = nodes.map((_, i) => `p${i}`).filter((id) => !linked.has(id));
  const layout: string[] = [];
  for (let start = 0; start < isolated.length; start += PACKAGE_DIAGRAM_ROW_MAX) {
    const row = isolated.slice(start, start + PACKAGE_DIAGRAM_ROW_MAX);
    for (let i = 1; i < row.length; i++) layout.push(`  ${row[i - 1]} ~~~ ${row[i]}`);
    const isLastRow = start + PACKAGE_DIAGRAM_ROW_MAX >= isolated.length;
    if (isLastRow && firstSource) layout.push(`  ${row[row.length - 1]} ~~~ ${firstSource}`);
  }

  const lines = ['flowchart LR'];
  nodes.forEach((dir, i) => lines.push(`  p${i}["${dir.replace(LABEL_UNSAFE_RE, '_')}"]`));
  lines.push(...sortedLinks, ...layout);
  return lines.join('\n');
}
