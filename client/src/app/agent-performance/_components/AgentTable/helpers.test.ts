import { describe, it, expect } from "vitest";
import { perfRow } from "../../fixtures";
import { COLUMN_KEYS, GRID, GRID_TRACKS } from "./constants";
import { defaultOrder, sortRows } from "./helpers";

const names = (rows: { agent_name: string }[]) => rows.map((r) => r.agent_name);

describe("constants", () => {
  it("keeps COLUMN_KEYS and GRID tracks length-aligned", () => {
    expect(GRID_TRACKS.length).toBe(COLUMN_KEYS.length);
    expect(GRID.split(" ").length).toBeGreaterThanOrEqual(COLUMN_KEYS.length);
  });
});

describe("defaultOrder (AC-42)", () => {
  const ranked70 = perfRow({ agent_id: "r", agent_name: "Ranked", accepted: 14, dismissed: 6, accept_rate: 0.7 });
  const small100 = perfRow({ agent_id: "s", agent_name: "Small", accepted: 3, dismissed: 0, accept_rate: 1, small_sample: true });
  const none = perfRow({ agent_id: "n", agent_name: "None", accepted: 0, dismissed: 0, accept_rate: null });

  it("puts ranked rows first, small samples next, no-decision rows last", () => {
    expect(names(defaultOrder([none, small100, ranked70], 5))).toEqual(["Ranked", "Small", "None"]);
  });

  it("breaks ties by runs descending, then name", () => {
    const a = perfRow({ agent_id: "a", agent_name: "Alpha", runs: 10, accept_rate: 0.8 });
    const b = perfRow({ agent_id: "b", agent_name: "Bravo", runs: 30, accept_rate: 0.8 });
    const c = perfRow({ agent_id: "c", agent_name: "Charlie", runs: 30, accept_rate: 0.8 });
    expect(names(defaultOrder([a, c, b], 5))).toEqual(["Bravo", "Charlie", "Alpha"]);
  });
});

describe("sortRows (AC-43)", () => {
  const a = perfRow({ agent_id: "a", agent_name: "Alpha", runs: 5, avg_cost_usd: 0.5, avg_duration_ms: 3000, last_run_at: "2026-10-01T00:00:00Z" });
  const b = perfRow({ agent_id: "b", agent_name: "Bravo", runs: 9, avg_cost_usd: 0.1, avg_duration_ms: 9000, last_run_at: "2026-10-10T00:00:00Z" });
  const z = perfRow({ agent_id: "z", agent_name: "Zero", runs: 0, avg_cost_usd: null, avg_duration_ms: null, last_run_at: null, accepted: 0, dismissed: 0, accept_rate: null });
  const rows = [z, a, b];

  it.each([
    ["agent", "asc", ["Alpha", "Bravo", "Zero"]],
    ["agent", "desc", ["Zero", "Bravo", "Alpha"]],
    ["runs", "desc", ["Bravo", "Alpha", "Zero"]],
    ["runs", "asc", ["Zero", "Alpha", "Bravo"]],
    ["avgCost", "asc", ["Bravo", "Alpha", "Zero"]],
    ["avgCost", "desc", ["Alpha", "Bravo", "Zero"]],
    ["avgDuration", "asc", ["Alpha", "Bravo", "Zero"]],
    ["avgDuration", "desc", ["Bravo", "Alpha", "Zero"]],
    ["lastRun", "asc", ["Alpha", "Bravo", "Zero"]],
    ["lastRun", "desc", ["Bravo", "Alpha", "Zero"]],
  ] as const)("%s %s keeps nulls last", (key, dir, expected) => {
    expect(names(sortRows(rows, key, dir, 5))).toEqual([...expected]);
  });

  it("keeps the tiers for Accept rate in both directions", () => {
    const ranked = perfRow({ agent_name: "Ranked", accepted: 14, dismissed: 6, accept_rate: 0.7 });
    const small = perfRow({ agent_name: "Small", accepted: 3, dismissed: 0, accept_rate: 1, small_sample: true });
    const none = perfRow({ agent_name: "None", accepted: 0, dismissed: 0, accept_rate: null });
    expect(names(sortRows([none, small, ranked], "acceptRate", "asc", 5))).toEqual(["Ranked", "Small", "None"]);
    expect(names(sortRows([none, small, ranked], "acceptRate", "desc", 5))).toEqual(["Ranked", "Small", "None"]);
  });
});
