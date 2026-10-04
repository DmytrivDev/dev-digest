import type { FindingRecord, PrBrief, PrFile, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { splitRef } from "../BriefFileRef";
import { isFocusedFile, normalizeAnnotationPath as normalizePath, type DiffFocus } from "@/components/diff-viewer";
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

/** One PR Brief item pinned to a line of the diff: a risk reference, or a review-focus item. */
export interface BriefLineNote {
  id: string;
  kind: "risk" | "focus";
  path: string;
  /** New-file line; `0` when the file has no patch to anchor to (rendered unanchored). */
  line: number;
  /** The reference named the whole file, not a line: the note sits on the file's first diff row. */
  wholeFile: boolean;
  title: string;
  text: string;
  /** Risk only: index in the brief, the model's `severity` and `kind`. */
  riskIndex?: number;
  severity?: string;
  riskKind?: string;
}

/** First new-file line the patch renders (the `+c` of its first hunk), or null without one. */
export function firstNewLine(patch: string | null | undefined): number | null {
  if (!patch) return null;
  const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/m.exec(patch);
  if (!m) return null;
  const start = Number(m[1]);
  return start > 0 ? start : 1;
}

/** The brief's risks and review focus as line notes for the diff — risks first, in brief
    order, then focus items. A risk ref without a line is pinned to the file's first diff
    row, so every risk shows up in Files changed (unless the same risk already marks a line
    in that file). One risk repeating the same row is marked
    once; two different risks on one row are both kept. */
export function briefLineNotes(brief: PrBrief | null | undefined, files: PrFile[]): BriefLineNote[] {
  if (!brief) return [];
  const patchOf = new Map(files.map((f) => [normalizePath(f.path), f.patch ?? null]));
  const notes: BriefLineNote[] = [];
  const seen = new Set<string>();
  const push = (key: string, note: BriefLineNote) => {
    if (seen.has(key)) return;
    seen.add(key);
    notes.push(note);
  };
  brief.risks.risks.forEach((r, i) => {
    const refs = r.file_refs.map(splitRef);
    // Files this risk already marks on a line: a whole-file ref there would only repeat it.
    const linedPaths = new Set(refs.filter((x) => x.line != null).map((x) => normalizePath(x.path)));
    for (const { path, line } of refs) {
      const wholeFile = line == null;
      if (wholeFile && linedPaths.has(normalizePath(path))) continue;
      const anchor = line ?? firstNewLine(patchOf.get(normalizePath(path))) ?? 0;
      push(`risk|${i}|${path}|${anchor}`, {
        id: `brief-risk-${i}-${path}:${anchor}`,
        kind: "risk",
        path,
        line: anchor,
        wholeFile,
        title: r.title,
        text: r.explanation,
        riskIndex: i,
        severity: r.severity,
        riskKind: r.kind,
      });
    }
  });
  brief.review_focus.forEach((f, i) =>
    push(`focus|${i}`, {
      id: `brief-focus-${i}`,
      kind: "focus",
      path: f.file,
      line: f.line,
      wholeFile: false,
      title: f.reason,
      text: "",
    }),
  );
  return notes;
}

const SEVERITY_ORDER = ["high", "medium", "low"] as const;

/** Per file: how many distinct risks and focus items the brief pins there, and the highest
    risk severity — what the file header counts. Keyed by the normalised path. */
export function briefFileCounts(
  notes: BriefLineNote[],
): Map<string, { risks: number; focus: number; severity: string | null }> {
  const out = new Map<string, { risks: Set<number>; focus: number; severity: string | null }>();
  for (const n of notes) {
    const key = normalizePath(n.path);
    const entry = out.get(key) ?? { risks: new Set<number>(), focus: 0, severity: null };
    if (n.kind === "focus") entry.focus += 1;
    else {
      entry.risks.add(n.riskIndex ?? -1);
      const rank = (sev: string | null) => {
        const k = SEVERITY_ORDER.indexOf((sev ?? "") as (typeof SEVERITY_ORDER)[number]);
        return k < 0 ? SEVERITY_ORDER.length : k;
      };
      if (rank(n.severity ?? null) < rank(entry.severity)) entry.severity = n.severity ?? null;
    }
    out.set(key, entry);
  }
  return new Map(
    [...out].map(([k, v]) => [k, { risks: v.risks.size, focus: v.focus, severity: v.severity }]),
  );
}
