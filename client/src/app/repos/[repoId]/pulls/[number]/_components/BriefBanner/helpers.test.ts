import { describe, it, expect } from "vitest";
import type { BriefInput, ReviewRecord } from "@devdigest/shared";
import { blockersOf, costText, droppedCount, inputsLine, isBriefStale } from "./helpers";

const usage = (o: Partial<Parameters<typeof costText>[0]> = {}) => ({
  llm_calls: 1,
  tokens_in: 8200,
  tokens_out: 1300,
  cost_usd: 0.014,
  duration_ms: 900,
  ...o,
});

describe("costText", () => {
  it("formats cost and tokens as `$<cost> <in>K→<out>K` (AC-18)", () => {
    expect(costText(usage())).toBe("$0.014 8.2K→1.3K");
  });

  it("reads an unknown cost as an em dash", () => {
    expect(costText(usage({ cost_usd: null, tokens_in: null, tokens_out: null }))).toBe("—");
  });

  it("omits the token part unless both counts are known (A-C3)", () => {
    expect(costText(usage({ tokens_out: null }))).toBe("$0.014");
    expect(costText(usage({ tokens_in: null }))).toBe("$0.014");
  });

  it("keeps a genuine zero distinct from missing", () => {
    expect(costText(usage({ cost_usd: 0, tokens_in: null, tokens_out: null }))).toBe("$0.00");
  });
});

describe("isBriefStale", () => {
  it("is stale when the server flag says so", () => {
    expect(isBriefStale(true, "aaa", "aaa")).toBe(true);
  });

  it("is stale when the live head differs from the brief's head", () => {
    expect(isBriefStale(false, "aaa", "bbb")).toBe(true);
  });

  it("is not stale for equal SHAs", () => {
    expect(isBriefStale(false, "aaa", "aaa")).toBe(false);
  });

  it("is not stale when the live head is unknown", () => {
    expect(isBriefStale(false, "aaa", null)).toBe(false);
    expect(isBriefStale(false, "aaa", undefined)).toBe(false);
  });
});

const labels = {
  builtWithout: "Built without:",
  truncated: "Truncated:",
  source: (s: BriefInput["source"]) => s.replace("_", " "),
  reason: (r: string) => r.replace(/_/g, " "),
};

describe("inputsLine", () => {
  it("names each missing and truncated input with its reason (AC-21)", () => {
    const inputs: BriefInput[] = [
      { source: "intent", status: "used" },
      { source: "linked_issue", status: "missing", reason: "github_unavailable" },
      { source: "specs", status: "truncated", reason: "over_budget" },
    ];
    expect(inputsLine(inputs, labels)).toBe(
      "Built without: linked issue (github unavailable) · Truncated: specs (over budget)",
    );
  });

  it("joins several entries of one kind", () => {
    const inputs: BriefInput[] = [
      { source: "linked_issue", status: "missing", reason: "no_linked_issue" },
      { source: "specs", status: "missing", reason: "none_attached" },
    ];
    expect(inputsLine(inputs, labels)).toBe(
      "Built without: linked issue (no linked issue) · specs (none attached)",
    );
  });

  it("returns null when every input was used", () => {
    expect(inputsLine([{ source: "intent", status: "used" }], labels)).toBeNull();
    expect(inputsLine([], labels)).toBeNull();
  });
});

describe("droppedCount", () => {
  it("sums risks and focus items (AC-22)", () => {
    expect(droppedCount({ risks: 1, review_focus: 1 })).toBe(2);
    expect(droppedCount({ risks: 0, review_focus: 0 })).toBe(0);
  });
});

describe("blockersOf", () => {
  it("counts CRITICAL findings that are not dismissed", () => {
    const f = (severity: string, dismissed_at: string | null) => ({ severity, dismissed_at });
    const review = {
      findings: [f("CRITICAL", null), f("CRITICAL", "2026-01-01"), f("WARNING", null)],
    } as unknown as ReviewRecord;
    expect(blockersOf(review)).toBe(1);
  });
});
