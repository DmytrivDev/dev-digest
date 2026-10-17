import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AgentPerfRow } from "@devdigest/shared";
import {
  DEFAULT_WINDOW,
  customRangeInstants,
  formatCount,
  formatDurationMs,
  formatPercent,
  localMidnightIso,
  metricStrings,
  parseWindowParams,
  relativeAge,
  todayLocal,
  validateCustomRange,
  windowApiQuery,
  windowDateLabels,
  windowParams,
} from "./agent-performance";

const TODAY = "2026-10-15";
let savedTz: string | undefined;

beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = "Europe/Kyiv";
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe("custom range -> instants (AC-33)", () => {
  it("uses local midnights with the browser offset", () => {
    expect(customRangeInstants("2026-10-01", "2026-10-07")).toEqual({
      from: "2026-10-01T00:00:00+03:00",
      to: "2026-10-08T00:00:00+03:00",
    });
  });

  it("gives each end its own offset across a DST change", () => {
    expect(customRangeInstants("2026-10-20", "2026-10-25")).toEqual({
      from: "2026-10-20T00:00:00+03:00",
      to: "2026-10-26T00:00:00+02:00",
    });
    expect(localMidnightIso("2026-01-10")).toBe("2026-01-10T00:00:00+02:00");
  });

  it("todayLocal is the local calendar day", () => {
    expect(todayLocal(new Date(2026, 9, 15, 23, 59))).toBe("2026-10-15");
  });
});

describe("parseWindowParams (AC-32)", () => {
  const parse = (qs: string) => parseWindowParams(new URLSearchParams(qs), TODAY);

  it("defaults without repair when the URL has no window", () => {
    expect(parse("tab=stats")).toEqual({ window: DEFAULT_WINDOW, repaired: false });
  });

  it("accepts days=1, days=30 and a valid custom range", () => {
    expect(parse("days=1")).toEqual({ window: { kind: "days", days: 1 }, repaired: false });
    expect(parse("days=30").window).toEqual({ kind: "days", days: 30 });
    expect(parse("from=2026-09-01&to=2026-09-30")).toEqual({
      window: { kind: "custom", start: "2026-09-01", end: "2026-09-30" },
      repaired: false,
    });
  });

  it.each([
    "from=2026-13-01&to=2026-09-30",
    "days=7",
    "days=abc",
    "days=1&from=2026-09-01&to=2026-09-30",
    "from=2026-09-01",
    "from=2026-09-30&to=2026-09-01",
    "from=2026-09-01&to=2026-12-01",
    "from=2026-02-30&to=2026-03-01",
  ])("repairs %s to the default", (qs) => {
    expect(parse(qs)).toEqual({ window: DEFAULT_WINDOW, repaired: true });
  });
});

describe("validateCustomRange (AC-34)", () => {
  it("reports each reason", () => {
    expect(validateCustomRange("", "2026-10-01", TODAY)).toBe("empty");
    expect(validateCustomRange("2026-10-01", "", TODAY)).toBe("empty");
    expect(validateCustomRange("2026-10-05", "2026-10-01", TODAY)).toBe("reversed");
    expect(validateCustomRange("2026-10-01", "2026-10-16", TODAY)).toBe("future");
    expect(validateCustomRange("2025-01-01", "2026-10-01", TODAY)).toBe("tooLong");
  });

  it("accepts a valid range, including a single day and today", () => {
    expect(validateCustomRange("2026-10-15", "2026-10-15", TODAY)).toBeNull();
    expect(validateCustomRange("2026-09-01", "2026-09-30", TODAY)).toBeNull();
  });
});

describe("window query strings", () => {
  it("writes days or from/to to the URL", () => {
    expect(windowParams({ kind: "days", days: 30 })).toEqual([["days", "30"]]);
    expect(windowParams({ kind: "custom", start: "2026-09-01", end: "2026-09-30" })).toEqual([
      ["from", "2026-09-01"],
      ["to", "2026-09-30"],
    ]);
  });

  it("builds the API query, encoding the + of the offset", () => {
    expect(windowApiQuery(DEFAULT_WINDOW)).toBe("days=30");
    const q = windowApiQuery({ kind: "custom", start: "2026-10-01", end: "2026-10-07" });
    expect(q).toContain("%2B03%3A00");
    expect(new URLSearchParams(q).get("from")).toBe("2026-10-01T00:00:00+03:00");
    expect(new URLSearchParams(q).get("to")).toBe("2026-10-08T00:00:00+03:00");
  });

  it("labels the inclusive end of the window", () => {
    const labels = windowDateLabels({
      from: new Date(2026, 8, 1).toISOString(),
      to: new Date(2026, 9, 1).toISOString(),
      days: null,
    });
    expect(labels).toEqual({ from: "Sep 1, 2026", to: "Sep 30, 2026" });
  });
});

describe("formatters (AC-56)", () => {
  it("formats duration, counts and percent", () => {
    expect(formatDurationMs(6234)).toBe("6.2s");
    expect(formatDurationMs(null)).toBe("—");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatPercent(0.7777)).toBe("78%");
    expect(formatPercent(null)).toBe("—");
  });

  it("computes relative age", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(relativeAge("2026-10-15T11:59:40Z", now)).toEqual({ key: "now", n: 0 });
    expect(relativeAge("2026-10-15T11:30:00Z", now)).toEqual({ key: "minutes", n: 30 });
    expect(relativeAge("2026-10-15T09:00:00Z", now)).toEqual({ key: "hours", n: 3 });
    expect(relativeAge("2026-10-10T12:00:00Z", now)).toEqual({ key: "days", n: 5 });
    expect(relativeAge("nope", now)).toBeNull();
  });
});

describe("metricStrings (AC-62)", () => {
  const row = {
    runs: 1234,
    avg_cost_usd: 0.05,
    avg_duration_ms: 6234,
    accept_rate: 18 / 23,
    accepted: 18,
    dismissed: 5,
  } as AgentPerfRow;

  it("renders every value through the shared formatters", () => {
    expect(metricStrings(row)).toEqual({
      runs: "1,234",
      avgCost: "$0.05",
      avgDuration: "6.2s",
      rate: "78%",
      accepted: "18",
      decided: "23",
    });
  });

  it("uses the empty marker for missing values", () => {
    expect(
      metricStrings({ ...row, avg_cost_usd: null, avg_duration_ms: null, accept_rate: null }),
    ).toMatchObject({ avgCost: "—", avgDuration: "—", rate: "—" });
  });
});
