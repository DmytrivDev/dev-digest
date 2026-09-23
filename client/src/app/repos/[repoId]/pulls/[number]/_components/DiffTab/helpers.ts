import type { FindingRecord, PrFile, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
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
