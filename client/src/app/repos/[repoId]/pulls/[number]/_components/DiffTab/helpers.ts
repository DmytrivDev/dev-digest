import type { FindingRecord, PrFile, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { isFocusedFile, type DiffFocus } from "@/components/diff-viewer";
import { SEVERITY_RANK } from "./constants";

/**
 * The review Smart Diff's counters and inline cards both key on: the first
 * `kind === "review"` review. `reviews` arrives newest-first
 * (`usePrReviews`/`review.repo.ts`), and a `summary` review never shadows a
 * `review` one — the reference rule is the PR-list one (`server/INSIGHTS.md`),
 * not the newest review regardless of kind.
 */
export function selectLatestReview(reviews: ReviewRecord[]): ReviewRecord | null {
  return reviews.find((r) => r.kind === "review") ?? null;
}

export interface RoleBucket {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Group the PR's files (GitHub order) into the Smart Diff's role buckets, in
 * the order `smartDiff.groups` declares. A file the server didn't classify
 * (should not happen, but the client never hides a file over it) falls back
 * to 'core'.
 */
export function groupFilesByRole(smartDiff: SmartDiff, files: PrFile[]): RoleBucket[] {
  const roleByPath = new Map<string, SmartDiffRole>();
  for (const group of smartDiff.groups) {
    for (const f of group.files) roleByPath.set(f.path, group.role);
  }
  const buckets = new Map<SmartDiffRole, PrFile[]>(smartDiff.groups.map((g) => [g.role, []]));
  const fallbackRole = smartDiff.groups[0]?.role ?? ("core" as SmartDiffRole);
  for (const file of files) {
    const role = roleByPath.get(file.path) ?? fallbackRole;
    const bucket = buckets.get(role);
    if (bucket) bucket.push(file);
    else buckets.set(role, [file]);
  }
  return smartDiff.groups.map((g) => ({ role: g.role, files: buckets.get(g.role) ?? [] }));
}

/** The count of FILES that have at least one finding line — not the count of findings. */
export function filesWithFindings(group: RoleBucket, smartDiff: SmartDiff): number {
  const smartGroup = smartDiff.groups.find((g) => g.role === group.role);
  if (!smartGroup) return 0;
  const linesByPath = new Map(smartGroup.files.map((f) => [f.path, f.finding_lines]));
  return group.files.filter((f) => (linesByPath.get(f.path)?.length ?? 0) > 0).length;
}

/** Paths that carry at least one finding line, across every group. */
export function markedPaths(smartDiff: SmartDiff): Set<string> {
  const paths = new Set<string>();
  for (const group of smartDiff.groups) {
    for (const f of group.files) if (f.finding_lines.length > 0) paths.add(f.path);
  }
  return paths;
}

/** Highest severity first, then by line — so a CodeLine's "primary" annotation
    is always the most important one on that line. */
export function sortFindingsForDiff(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort((a, b) => {
    const rankA = SEVERITY_RANK[a.severity] ?? SEVERITY_RANK.SUGGESTION!;
    const rankB = SEVERITY_RANK[b.severity] ?? SEVERITY_RANK.SUGGESTION!;
    if (rankA !== rankB) return rankA - rankB;
    return a.start_line - b.start_line;
  });
}

/**
 * The deep link into Files changed (SPEC-03 C-5): `?tab=diff&file=<path>&line=<n>`.
 * This pair of functions is the only owner of that grammar — the Overview's
 * Review-focus and Risk-area links build it, the page parses it.
 */

/** Read the deep-link target from the page's search params, or null when the
    link carries none or a malformed one. `file` must be non-empty; `line` is
    optional but, when present, must be a positive integer (`0`, `abc`, `-3`
    and `1.5` reject the whole target). */
export function parseDiffTarget(search: URLSearchParams): DiffFocus | null {
  const file = search.get("file");
  if (!file) return null;
  const raw = search.get("line");
  if (raw == null) return { path: file, line: null };
  return /^[1-9]\d*$/.test(raw) ? { path: file, line: Number(raw) } : null;
}

/** Query string (no leading `?`) that opens Files changed on `path`, and on
    `line` when one is known. */
export function diffTargetQuery(path: string, line: number | null): string {
  const base = `tab=diff&file=${encodeURIComponent(path)}`;
  return line == null ? base : `${base}&line=${line}`;
}

/** The target only counts when it names a file of this PR — an unknown file
    renders the diff exactly as if no target were given (no error state). */
export function resolveDiffFocus(focus: DiffFocus | null | undefined, files: PrFile[]): DiffFocus | null {
  return focus && files.some((f) => isFocusedFile(f, focus)) ? focus : null;
}

/** Does this role bucket hold the target file? Its group then opens by default. */
export function bucketHasFocus(bucket: RoleBucket, focus: DiffFocus | null): boolean {
  return !!focus && bucket.files.some((f) => isFocusedFile(f, focus));
}
