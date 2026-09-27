import { describe, it, expect } from "vitest";
import { callerHref, canResync, buildGraphLayout, toFlow } from "./helpers";
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
  it("lays out 1 symbol + every caller, with no collapsed node", () => {
    const callers = Array.from({ length: 12 }, (_, i) => ({ name: `c${i}`, file: `f${i}.ts`, line: i + 1 }));
    const { nodes } = buildGraphLayout(impact({ callers }));
    expect(nodes.filter((n) => n.kind === "symbol")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "caller")).toHaveLength(12);
  });

  it("sizes a node to its full label and caller detail — nothing is clipped", () => {
    const long = "server/src/modules/reviews/repository/review.repo.ts";
    const { nodes } = buildGraphLayout(
      impact({ callers: [{ name: "aVeryLongSymbolNameIndeed", file: long, line: 42, endpoints: ["GET /api/public/webhooks/:id"] }] }),
    );
    const caller = nodes.find((n) => n.kind === "caller")!;
    expect(caller.label).toBe("aVeryLongSymbolNameIndeed");
    expect(caller.detail).toBe(`${long}:42`);
    expect(caller.width).toBeGreaterThan(`${long}:42`.length * 7);
    const endpoint = nodes.find((n) => n.kind === "endpoint")!;
    expect(endpoint.label).toBe("GET /api/public/webhooks/:id");
  });

  it("places columns left to right and the canvas holds every node", () => {
    const layout = buildGraphLayout(
      impact({ callers: [{ name: "a", file: "a.ts", line: 1, endpoints: ["GET /x"], crons: ["nightly"] }] }),
    );
    const x = (kind: string) => layout.nodes.find((n) => n.kind === kind)!.x;
    expect(x("symbol")).toBeLessThan(x("caller"));
    expect(x("caller")).toBeLessThan(x("endpoint"));
    for (const n of layout.nodes) {
      expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("draws no caller→endpoint edge when the caller has no endpoints", () => {
    const { edges } = buildGraphLayout(impact({ callers: [{ name: "a", file: "a.ts", line: 1 }] }));
    expect(edges.every((e) => !e.to.startsWith("endpoint:"))).toBe(true);
  });

  it("draws a caller→endpoint edge only for that caller's own endpoints, once per shared endpoint node", () => {
    const { edges, nodes } = buildGraphLayout(
      impact({
        callers: [
          { name: "a", file: "a.ts", line: 1, endpoints: ["GET /x"] },
          { name: "b", file: "b.ts", line: 2 },
          { name: "c", file: "c.ts", line: 3, endpoints: ["GET /x"] },
        ],
      }),
    );
    expect(nodes.filter((n) => n.kind === "endpoint")).toHaveLength(1);
    const endpointId = "endpoint:GET /x";
    expect(edges.filter((e) => e.to === endpointId).map((e) => e.from).sort()).toEqual(["caller:a.ts:1", "caller:c.ts:3"]);
    expect(edges.find((e) => e.to === endpointId)?.toKind).toBe("endpoint");
    expect(edges.some((e) => e.to === "caller:b.ts:2")).toBe(true); // symbol → b still drawn
  });

  it("produces deterministic coordinates for the same input", () => {
    expect(buildGraphLayout(impact())).toEqual(buildGraphLayout(impact()));
  });
});

describe("toFlow", () => {
  it("keeps every laid-out position and size, and styles each edge by its target kind", () => {
    const layout = buildGraphLayout(
      impact({ callers: [{ name: "a", file: "a.ts", line: 1, endpoints: ["GET /x"] }] }),
    );
    const { nodes, edges } = toFlow(layout, (kind) => ({ stroke: kind }));
    expect(nodes).toHaveLength(layout.nodes.length);
    for (const n of layout.nodes) {
      const flowNode = nodes.find((f) => f.id === n.id)!;
      expect(flowNode).toMatchObject({ type: "blast", position: { x: n.x, y: n.y }, width: n.width, height: n.height });
      expect(flowNode.handles?.map((h) => h.type)).toEqual(["target", "source"]);
    }
    expect(edges.find((e) => e.target === "endpoint:GET /x")?.style).toEqual({ stroke: "endpoint" });
    expect(edges.find((e) => e.target === "caller:a.ts:1")?.style).toEqual({ stroke: "caller" });
  });
});
