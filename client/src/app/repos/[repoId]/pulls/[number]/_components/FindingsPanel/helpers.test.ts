/**
 * The pure rules behind the severity pills (`FindingsPanel/helpers.ts`).
 *
 * `countBySeverity` is what makes the pill numbers trustworthy: it is a plain
 * group/count over `severity`, so expanding a run card or toggling a pill never
 * costs a model call. It is unit-tested apart from the panel because the
 * "pill number === cards below it" rule is the acceptance criterion, not the render.
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("countBySeverity", () => {
  it("returns a zero for every pill severity when there is nothing to count", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("tallies all three levels at once", () => {
    const counts = countBySeverity([
      finding({ id: "a", severity: "CRITICAL" }),
      finding({ id: "b", severity: "CRITICAL" }),
      finding({ id: "c", severity: "WARNING" }),
      finding({ id: "d", severity: "SUGGESTION" }),
    ]);
    expect(counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("ignores a severity outside the contract enum (the DB column is plain text)", () => {
    const counts = countBySeverity([
      finding({ id: "a", severity: "CRITICAL" }),
      finding({ id: "b", severity: "WEIRD" as Severity }),
    ]);
    expect(counts).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });

  it("counts accepted and dismissed findings like any other — they stay on screen", () => {
    const counts = countBySeverity([
      finding({ id: "a", severity: "WARNING", dismissed_at: "2026-09-16T00:00:00.000Z" }),
      finding({ id: "b", severity: "WARNING", accepted_at: "2026-09-16T00:00:00.000Z" }),
    ]);
    expect(counts.WARNING).toBe(2);
  });
});

describe("visibleFindings", () => {
  const MIXED = [
    finding({ id: "sugg", severity: "SUGGESTION", confidence: 0.6 }),
    finding({ id: "crit", severity: "CRITICAL", confidence: 0.95 }),
    finding({ id: "warn", severity: "WARNING", confidence: 0.9 }),
  ];

  it("sorts by severity and keeps everything when nothing is filtered", () => {
    expect(visibleFindings(MIXED, false).map((f) => f.id)).toEqual(["crit", "warn", "sugg"]);
  });

  it("drops low-confidence findings when hideLow is on", () => {
    expect(visibleFindings(MIXED, true).map((f) => f.id)).toEqual(["crit", "warn"]);
  });

  it("keeps only the picked severity", () => {
    expect(visibleFindings(MIXED, false, "WARNING").map((f) => f.id)).toEqual(["warn"]);
  });

  it("applies the severity filter on top of hideLow, so counts and cards agree", () => {
    // SUGGESTION survives the severity filter but not the confidence one.
    expect(visibleFindings(MIXED, true, "SUGGESTION")).toEqual([]);
    expect(countBySeverity(visibleFindings(MIXED, true)).SUGGESTION).toBe(0);
  });

  it("does not mutate the array it was given", () => {
    const input = [...MIXED];
    visibleFindings(input, false);
    expect(input.map((f) => f.id)).toEqual(["sugg", "crit", "warn"]);
  });
});
