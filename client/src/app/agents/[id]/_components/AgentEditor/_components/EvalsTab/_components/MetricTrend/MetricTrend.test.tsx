/* LineChart is mocked (the way EvalAgentDetail.test.tsx does it): what matters
   here is the data, the domain, the ticks and the dots this card hands it. Its
   own rendering is covered in LineChart.test.tsx / EvalTrendChart.test.tsx. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/eval.json";

interface ChartProps {
  series: Array<{ name: string; color: string; data: Array<number | null> }>;
  yMin?: number;
  yMax?: number;
  ticks?: number[];
  dots?: boolean;
}
const chartProps: ChartProps[] = [];
vi.mock("@devdigest/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@devdigest/ui")>();
  return {
    ...actual,
    LineChart: (props: ChartProps) => {
      chartProps.push(props);
      return <div data-testid="line-chart" />;
    },
  };
});

import { MetricTrend } from "./MetricTrend";

function makeRun(n: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: `run${n}`,
    agent_id: "ag1",
    agent_version: n,
    status: "completed",
    error_reason: null,
    started_at: `2026-10-${String(n).padStart(2, "0")}T10:00:00.000Z`,
    finished_at: `2026-10-${String(n).padStart(2, "0")}T10:05:00.000Z`,
    cases_total: 8,
    cases_done: 8,
    cases_passed: 5,
    cases_scored: 7,
    cases_errored: 1,
    recall: n / 10,
    precision: 0.3,
    citation_accuracy: 1,
    cost_usd: 0.12,
    duration_ms: 1000,
    config: { system_prompt: "p", model: "gpt-4.1", provider: "openai", strategy: "single-pass", skills: [] },
    ...over,
  };
}

beforeEach(() => {
  chartProps.length = 0;
});
afterEach(cleanup);

function renderTrend(runs: EvalSuiteRun[], flags: { isLoading?: boolean; isError?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <MetricTrend runs={runs} isLoading={flags.isLoading ?? false} isError={flags.isError ?? false} />
    </NextIntlClientProvider>,
  );
}

const last = () => chartProps[chartProps.length - 1]!;
const seriesOf = (name: string) => last().series.find((s) => s.name === name)!;

describe("MetricTrend — the points (AC-51)", () => {
  it("plots one dotted point per completed run, oldest first", () => {
    renderTrend([
      makeRun(6),
      makeRun(5, { status: "running", finished_at: null, recall: null, precision: null, citation_accuracy: null }),
      makeRun(4),
      makeRun(3, { status: "failed", error_reason: "interrupted", recall: null, precision: null, citation_accuracy: null }),
      makeRun(2),
      makeRun(1),
    ]);
    expect(last().dots).toBe(true);
    // recall is n / 10 for run n: the 4 completed runs, in start-time order
    expect(seriesOf("recall").data).toEqual([0.1, 0.2, 0.4, 0.6]);
    for (const s of last().series) expect(s.data).toHaveLength(4);
  });

  it("keeps only the last 20 completed runs", () => {
    const runs = Array.from({ length: 25 }, (_, i) => makeRun(i + 1, { recall: (i + 1) / 100 }));
    renderTrend(runs);
    const recall = seriesOf("recall").data;
    expect(recall).toHaveLength(20);
    expect(recall[0]).toBe(0.06);
    expect(recall[19]).toBe(0.25);
  });
});

describe("MetricTrend — the axis (AC-52)", () => {
  it("hands the chart a 0–1 domain with ticks every 0.2, so a 0.30 precision lies inside it", () => {
    renderTrend([makeRun(1), makeRun(2)]);
    expect(last().yMin).toBe(0);
    expect(last().yMax).toBe(1);
    expect(last().ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(Math.min(...(seriesOf("precision").data as number[]))).toBeGreaterThanOrEqual(last().yMin!);
  });
});

describe("MetricTrend — a null metric (AC-53)", () => {
  it("is null, not 0, while the same run's other metrics still plot", () => {
    renderTrend([makeRun(1), makeRun(2, { precision: null }), makeRun(3)]);
    expect(seriesOf("precision").data).toEqual([0.3, null, 0.3]);
    expect(seriesOf("recall").data[1]).toBe(0.2);
    expect(seriesOf("citation_accuracy").data[1]).toBe(1);
  });
});

describe("MetricTrend — the legend (AC-50)", () => {
  it("draws recall, precision and citation in accent, ok and warn, with the dashboard's legend", () => {
    renderTrend([makeRun(1), makeRun(2)]);
    expect(last().series.map((s) => [s.name, s.color])).toEqual([
      ["recall", "var(--accent)"],
      ["precision", "var(--ok)"],
      ["citation_accuracy", "var(--warn)"],
    ]);
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    for (const label of ["Recall", "Precision", "Citation"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("MetricTrend — states (AC-55, AC-57)", () => {
  it.each([
    ["no completed run", []],
    ["a single completed run", [makeRun(1)]],
    ["one completed run among others", [makeRun(1), makeRun(2, { status: "running", finished_at: null })]],
  ])("shows the hint and no chart with %s", (_label, runs) => {
    renderTrend(runs);
    expect(screen.getByText("Run the suite at least twice to see a trend")).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).toBeNull();
  });

  it("shows a one-line load error and no chart when the runs fail to load", () => {
    renderTrend([makeRun(1), makeRun(2)], { isError: true });
    expect(screen.getByText("Could not load the run history for the trend.")).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(screen.queryByText("Run the suite at least twice to see a trend")).toBeNull();
  });

  it("shows nothing while the runs load", () => {
    const { container } = renderTrend([], { isLoading: true });
    expect(container).toBeEmptyDOMElement();
  });
});
