import { describe, it, expect } from "vitest";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { countByStatus, filterCandidates, parseFilter, scanErrorMessage } from "./helpers";

const candidate = (id: string, status: ConventionStatus): ConventionCandidate => ({
  id,
  category: "naming",
  rule: `rule ${id}`,
  evidence_path: "src/a.ts",
  evidence_line: 3,
  evidence_snippet: "const a = 1;",
  evidence_url: null,
  confidence: 0.5,
  status,
  created_at: "2026-09-19T12:00:00.000Z",
});

const LIST = [
  candidate("a", "pending"),
  candidate("b", "accepted"),
  candidate("c", "rejected"),
  candidate("d", "pending"),
];

/** Stand-in for next-intl's `t`: returns the key, so assertions name the key. */
const t = (key: string) => key;

describe("parseFilter", () => {
  it("falls back to the triage view rather than throwing on junk", () => {
    expect(parseFilter(null)).toBe("pending");
    expect(parseFilter("nonsense")).toBe("pending");
  });

  it("accepts every declared view", () => {
    expect(parseFilter("all")).toBe("all");
    expect(parseFilter("rejected")).toBe("rejected");
  });
});

describe("filterCandidates", () => {
  it("keeps everything in the all view", () => {
    expect(filterCandidates(LIST, "all")).toHaveLength(4);
  });

  it("narrows to one status", () => {
    expect(filterCandidates(LIST, "rejected").map((c) => c.id)).toEqual(["c"]);
  });
});

describe("countByStatus", () => {
  it("counts every view, including all", () => {
    expect(countByStatus(LIST)).toEqual({ all: 4, pending: 2, accepted: 1, rejected: 1 });
  });
});

describe("scanErrorMessage", () => {
  it("re-words the two statuses whose raw text explains nothing", () => {
    expect(scanErrorMessage(new ApiError("429 Too Many Requests", 429), t)).toBe(
      "errors.rateLimited",
    );
    expect(scanErrorMessage(new ApiError("down", 0, "network_error"), t)).toBe("errors.network");
  });

  // A 422 carries the server's own cause ("no clone", "no index", "nothing
  // accepted"), which is more useful than anything this page could invent.
  it("passes a 4xx through with the server's wording", () => {
    expect(scanErrorMessage(new ApiError("Repository has no clone", 422), t)).toBe(
      "Repository has no clone",
    );
  });

  it("falls back for anything that is not an ApiError", () => {
    expect(scanErrorMessage(new Error("boom"), t)).toBe("errors.generic");
  });
});
