/* Does NOT mock LineChart: the dashboard trend must show the per-point tooltip
   (SPEC-05 AC-59) and stay dot-less (AC-60). */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import { formatWhen } from "@/lib/datetime";
import messages from "../../../../../../../../messages/en/eval.json";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 200 } as object),
  };
});

import { TrendChart } from "./TrendChart";

afterEach(cleanup);

const point = (day: number, over: Partial<EvalTrendPoint> = {}): EvalTrendPoint => ({
  started_at: `2026-05-${String(day).padStart(2, "0")}T09:14:00.000Z`,
  run_id: `r${day}`,
  agent_version: day - 10,
  cost_usd: 0.03,
  recall: 0.82,
  precision: 0.9,
  citation_accuracy: 0.95,
  ...over,
});

function renderTrend(trend: EvalTrendPoint[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <TrendChart trend={trend} />
    </NextIntlClientProvider>,
  );
}

describe("TrendChart tooltip (AC-59)", () => {
  it("shows that run's date, version, cost and three metrics on focus and on hover", () => {
    // the run of day 18 has a null metric: the dashboard leaves it out, as before
    const { container } = renderTrend([
      point(17),
      point(18, { cost_usd: null, precision: null }),
      point(19, { recall: 0.4, citation_accuracy: 0.6 }),
    ]);
    const group = screen.getByRole("group", { name: "Metric trend by run" });

    fireEvent.focus(group);
    let tip = within(screen.getByRole("tooltip"));
    expect(tip.getByText(formatWhen("2026-05-19T09:14:00.000Z"))).toBeInTheDocument();
    expect(tip.getByText("v9")).toBeInTheDocument();
    expect(tip.getByText("Cost $0.03")).toBeInTheDocument();
    expect(tip.getByText("Recall 40%")).toBeInTheDocument();
    expect(tip.getByText("Precision 90%")).toBeInTheDocument();
    expect(tip.getByText("Citation 60%")).toBeInTheDocument();

    fireEvent.blur(group);
    const wrapper = container.querySelector(".recharts-wrapper") as HTMLElement;
    fireEvent.mouseMove(wrapper, { clientX: 28, clientY: 100 });
    tip = within(screen.getByRole("tooltip"));
    expect(tip.getByText(formatWhen("2026-05-17T09:14:00.000Z"))).toBeInTheDocument();
    expect(tip.getByText("v7")).toBeInTheDocument();
  });

  it("stays dot-less", () => {
    const { container } = renderTrend([point(17), point(18)]);
    expect(container.querySelectorAll(".recharts-line-dot")).toHaveLength(0);
  });
});
