/**
 * Parse-only test for the PrBrief contract in the CLIENT copy of
 * `@devdigest/shared`. The server has the same cases in
 * `server/test/contracts.test.ts`; both run so a drifted copy fails whichever
 * package's CI job is filtered in. No rendering.
 */
import { describe, it, expect } from "vitest";
import { PrBrief, PrBriefResponse } from "@devdigest/shared";

const brief = {
  summary: "Adds per-key rate limiting to the public webhook route.",
  risks: {
    risks: [
      {
        kind: "security",
        title: "Unauthenticated route",
        explanation: "The route accepts unsigned payloads.",
        severity: "high",
        file_refs: ["src/api/public/webhooks.ts:61-74"],
      },
    ],
  },
  review_focus: [{ file: "src/api/public/webhooks.ts", line: 61, reason: "Check the signature path." }],
  intent: null,
  blast: null,
  head_sha: "a1b2c3d4e5f6",
  generated_at: "2026-10-03T10:00:00.000Z",
  model: "openai/gpt-4.1",
  usage: { llm_calls: 1, tokens_in: 4200, tokens_out: 380, cost_usd: 0.004, duration_ms: 5100 },
  inputs: [
    { source: "intent", status: "missing", reason: "not_derived" },
    { source: "blast", status: "used" },
    { source: "diff_stats", status: "truncated", reason: "over_budget", omitted: 12 },
    { source: "description", status: "used" },
    { source: "linked_issue", status: "missing", reason: "no_linked_issue" },
    { source: "specs", status: "missing", reason: "none_attached" },
  ],
  dropped: { risks: 0, review_focus: 1 },
};

describe("PrBrief contract (client copy)", () => {
  it("parses a full PrBriefResponse, and a response with brief: null", () => {
    const parsed = PrBriefResponse.parse({ brief, generating: false, stale: false });
    expect(parsed.brief?.summary).toBe(brief.summary);
    expect(parsed.brief?.review_focus).toHaveLength(1);
    expect(parsed.brief?.inputs).toHaveLength(6);
    expect(() => PrBriefResponse.parse({ brief: null, generating: true, stale: false })).not.toThrow();
  });

  it("rejects a focus item with line 0", () => {
    const bad = { ...brief, review_focus: [{ file: "a.ts", line: 0, reason: "r" }] };
    expect(PrBrief.safeParse(bad).success).toBe(false);
  });

  it("rejects a 401-character summary and accepts exactly 400", () => {
    expect(PrBrief.safeParse({ ...brief, summary: "x".repeat(401) }).success).toBe(false);
    expect(PrBrief.safeParse({ ...brief, summary: "x".repeat(400) }).success).toBe(true);
  });

  it("requires a reason on an input that is not used", () => {
    const bad = { ...brief, inputs: [{ source: "specs", status: "missing" }] };
    expect(PrBrief.safeParse(bad).success).toBe(false);
    expect(PrBrief.safeParse({ ...brief, inputs: [{ source: "specs", status: "used" }] }).success).toBe(true);
  });

  it("rejects an unknown input source", () => {
    const bad = { ...brief, inputs: [{ source: "history", status: "used" }] };
    expect(PrBrief.safeParse(bad).success).toBe(false);
  });
});
