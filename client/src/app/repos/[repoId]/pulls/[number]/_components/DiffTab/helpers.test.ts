import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import {
  selectLatestReview,
  groupFilesByRole,
  filesWithFindings,
  markedPaths,
  sortFindingsForDiff,
} from "./helpers";

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Agent",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...o,
  };
}

function file(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: null };
}

function smartDiff(overrides: Partial<SmartDiff> = {}): SmartDiff {
  return {
    groups: [
      { role: "core", files: [] },
      { role: "tests", files: [] },
      { role: "wiring", files: [] },
      { role: "docs", files: [] },
      { role: "boilerplate", files: [] },
    ],
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    ...overrides,
  };
}

describe("selectLatestReview", () => {
  it("skips a newer summary review and picks the first review-kind one", () => {
    const reviews = [
      review({ id: "s1", kind: "summary" }),
      review({ id: "r1", kind: "review" }),
    ];
    expect(selectLatestReview(reviews)?.id).toBe("r1");
  });

  it("returns null for an empty list", () => {
    expect(selectLatestReview([])).toBeNull();
  });
});

describe("groupFilesByRole", () => {
  it("keeps GitHub order within a role and never drops a file", () => {
    const sd = smartDiff({
      groups: [
        {
          role: "core",
          files: [
            { path: "z.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
            { path: "a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
          ],
        },
        { role: "tests", files: [] },
        { role: "wiring", files: [] },
        { role: "docs", files: [] },
        { role: "boilerplate", files: [] },
      ],
    });
    const files = [file("z.ts"), file("a.ts")];
    const buckets = groupFilesByRole(sd, files);
    expect(buckets.find((b) => b.role === "core")!.files.map((f) => f.path)).toEqual([
      "z.ts",
      "a.ts",
    ]);
    expect(buckets.reduce((n, b) => n + b.files.length, 0)).toBe(2);
  });
});

describe("filesWithFindings", () => {
  it("counts FILES, not findings — one file with 3 lines plus one with 1 counts as 2", () => {
    const sd = smartDiff({
      groups: [
        {
          role: "core",
          files: [
            { path: "a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [1, 2, 3] },
            { path: "b.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [5] },
            { path: "c.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
          ],
        },
        { role: "tests", files: [] },
        { role: "wiring", files: [] },
        { role: "docs", files: [] },
        { role: "boilerplate", files: [] },
      ],
    });
    const buckets = groupFilesByRole(sd, [file("a.ts"), file("b.ts"), file("c.ts")]);
    const core = buckets.find((b) => b.role === "core")!;
    expect(filesWithFindings(core, sd)).toBe(2);
  });
});

describe("markedPaths", () => {
  it("returns the set of paths that carry at least one finding line", () => {
    const sd = smartDiff({
      groups: [
        {
          role: "core",
          files: [
            { path: "a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [1] },
            { path: "b.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
          ],
        },
        { role: "tests", files: [] },
        { role: "wiring", files: [] },
        { role: "docs", files: [] },
        { role: "boilerplate", files: [] },
      ],
    });
    expect(markedPaths(sd)).toEqual(new Set(["a.ts"]));
  });
});

describe("sortFindingsForDiff", () => {
  function finding(o: Partial<FindingRecord>): FindingRecord {
    return {
      id: "f",
      severity: "WARNING",
      category: "bug",
      title: "t",
      file: "a.ts",
      start_line: 1,
      end_line: 1,
      rationale: "r",
      suggestion: null,
      confidence: 0.5,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "r1",
      accepted_at: null,
      dismissed_at: null,
      ...o,
    };
  }

  it("orders by severity rank, then by start_line", () => {
    const findings = [
      finding({ id: "sugg", severity: "SUGGESTION", start_line: 1 }),
      finding({ id: "crit-later", severity: "CRITICAL", start_line: 10 }),
      finding({ id: "crit-earlier", severity: "CRITICAL", start_line: 2 }),
      finding({ id: "warn", severity: "WARNING", start_line: 5 }),
    ];
    const sorted = sortFindingsForDiff(findings).map((f) => f.id);
    expect(sorted).toEqual(["crit-earlier", "crit-later", "warn", "sugg"]);
  });
});
