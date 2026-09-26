import { describe, it, expect } from "vitest";
import { callerHref, canResync, buildGraphLayout, clipLabel } from "./helpers";
import type { DownstreamImpact } from "@devdigest/shared";

describe("callerHref", () => {
  it("uses indexed_sha when present", () => {
    expect(callerHref("o/r", "sha-index", "sha-head", "a.ts", 12)).toBe(
      "https://github.com/o/r/blob/sha-index/a.ts#L12",
    );
  });

  it("falls back to headSha when there is no indexed_sha", () => {
    expect(callerHref("o/r", undefined, "sha-head", "a.ts", 12)).toBe(
      "https://github.com/o/r/blob/sha-head/a.ts#L12",
    );
  });

  it("returns null with no repoFullName", () => {
    expect(callerHref(null, "sha-index", "sha-head", "a.ts", 12)).toBeNull();
  });

  it("returns null with no sha at all", () => {
    expect(callerHref("o/r", undefined, null, "a.ts", 12)).toBeNull();
  });
});

describe("canResync", () => {
  it("false when data is undefined", () => {
    expect(canResync(undefined)).toBe(false);
  });

  it("false when not degraded", () => {
    expect(
      canResync({ changed_symbols: [], downstream: [], summary: "s", degraded: false }),
    ).toBe(false);
  });

  it("true when degraded with a resyncable reason", () => {
    expect(
      canResync({
        changed_symbols: [],
        downstream: [],
        summary: "s",
        degraded: true,
        reason: "index_partial",
      }),
    ).toBe(true);
  });

  it("false when degraded with reason files_unavailable — resync would not help", () => {
    expect(
      canResync({
        changed_symbols: [],
        downstream: [],
        summary: "s",
        degraded: true,
        reason: "files_unavailable",
      }),
    ).toBe(false);
  });
});

describe("clipLabel", () => {
  it("leaves a short label untouched", () => {
    expect(clipLabel("short")).toBe("short");
  });

  it("clips a >16-char label with an ellipsis", () => {
    expect(clipLabel("aVeryLongSymbolNameIndeed")).toBe("aVeryLongSymbol…");
  });
});

function impact(overrides: Partial<DownstreamImpact> = {}): DownstreamImpact {
  return {
    symbol: "rateLimit",
    callers: [{ name: "publicRouter", file: "a.ts", line: 1 }],
    endpoints_affected: [],
    crons_affected: [],
    ...overrides,
  };
}

describe("buildGraphLayout", () => {
  it("node count with no overflow: 1 symbol + N callers, no extra node", () => {
    const { nodes } = buildGraphLayout(impact({ callers: [{ name: "a", file: "a.ts", line: 1 }, { name: "b", file: "b.ts", line: 2 }] }), {
      width: 600,
      height: 300,
      maxCallers: 8,
    });
    expect(nodes).toHaveLength(3); // symbol + 2 callers
  });

  it("collapses callers beyond maxCallers into one 'more' node", () => {
    const callers = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}`, file: `f${i}.ts`, line: i + 1 }));
    const { nodes } = buildGraphLayout(impact({ callers }), { width: 600, height: 300, maxCallers: 8 });
    const more = nodes.find((n) => n.kind === "more");
    expect(more?.moreCount).toBe(2);
    expect(nodes.filter((n) => n.kind === "caller")).toHaveLength(8);
  });

  it("draws no caller→endpoint edge when the caller has no endpoints", () => {
    const { edges } = buildGraphLayout(
      impact({ callers: [{ name: "a", file: "a.ts", line: 1 }] }),
      { width: 600, height: 300, maxCallers: 8 },
    );
    expect(edges.every((e) => !e.to.startsWith("endpoint:"))).toBe(true);
  });

  it("draws a caller→endpoint edge only for that caller's own endpoints", () => {
    const { edges, nodes } = buildGraphLayout(
      impact({
        callers: [
          { name: "a", file: "a.ts", line: 1, endpoints: ["GET /x"] },
          { name: "b", file: "b.ts", line: 2 },
        ],
      }),
      { width: 600, height: 300, maxCallers: 8 },
    );
    const callerA = nodes.find((n) => n.id === "caller:a.ts:1")!;
    const endpointNode = nodes.find((n) => n.kind === "endpoint")!;
    expect(edges.some((e) => e.from === callerA.id && e.to === endpointNode.id)).toBe(true);
    const callerB = nodes.find((n) => n.id === "caller:b.ts:2")!;
    expect(edges.some((e) => e.to === callerB.id)).toBe(true); // symbol → callerB still drawn
    expect(edges.some((e) => e.from === callerB.id && e.to === endpointNode.id)).toBe(false);
  });

  it("produces deterministic coordinates for the same input", () => {
    const a = buildGraphLayout(impact(), { width: 600, height: 300, maxCallers: 8 });
    const b = buildGraphLayout(impact(), { width: 600, height: 300, maxCallers: 8 });
    expect(a).toEqual(b);
  });
});
