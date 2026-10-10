import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import { formatWhen } from "@/lib/datetime";
import messages from "../../../messages/en/eval.json";

// jsdom gives ResponsiveContainer a 0x0 box, so Recharts draws nothing.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 200 } as object),
  };
});

import { EvalTrendChart } from "./EvalTrendChart";

afterEach(cleanup);

const point = (over: Partial<EvalTrendPoint>): EvalTrendPoint => ({
  started_at: "2026-05-17T09:14:00.000Z",
  run_id: "r1",
  agent_version: 5,
  cost_usd: 0.05,
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 0.5,
  ...over,
});

const POINTS: EvalTrendPoint[] = [
  point({ started_at: "2026-05-15T09:14:00.000Z", run_id: "r1", agent_version: 5 }),
  point({ started_at: "2026-05-16T09:14:00.000Z", run_id: "r2", agent_version: 6, cost_usd: null }),
  point({
    started_at: "2026-05-17T09:14:00.000Z",
    run_id: "r3",
    agent_version: 7,
    cost_usd: 0.03,
    recall: 0.8249,
    precision: null,
    citation_accuracy: 0.9,
  }),
];

function renderChart(points: EvalTrendPoint[], dots = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalTrendChart points={points} dots={dots} />
    </NextIntlClientProvider>,
  );
}

describe("EvalTrendChart (SPEC-05 AC-54)", () => {
  it("draws the card title, the legend and a focusable chart", () => {
    renderChart(POINTS);
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    for (const label of ["Recall", "Precision", "Citation"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("group", { name: "Metric trend by run" })).toHaveAttribute("tabindex", "0");
  });

  it("focus shows the newest run: date, version, cost and the three metrics", () => {
    renderChart(POINTS);
    fireEvent.focus(screen.getByRole("group"));
    const tip = within(screen.getByRole("tooltip"));
    expect(tip.getByText(formatWhen("2026-05-17T09:14:00.000Z"))).toBeInTheDocument();
    expect(tip.getByText("v7")).toBeInTheDocument();
    expect(tip.getByText("Cost $0.03")).toBeInTheDocument();
    expect(tip.getByText("Recall 82%")).toBeInTheDocument();
    expect(tip.getByText("Precision n/a")).toBeInTheDocument();
    expect(tip.getByText("Citation 90%")).toBeInTheDocument();
  });

  it("an arrow key moves to the previous run; a missing cost reads \"—\"", () => {
    renderChart(POINTS);
    const group = screen.getByRole("group");
    fireEvent.focus(group);
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    const tip = within(screen.getByRole("tooltip"));
    expect(tip.getByText("v6")).toBeInTheDocument();
    expect(tip.getByText("Cost —")).toBeInTheDocument();
    expect(tip.getByText("Precision 50%")).toBeInTheDocument();
  });

  it("hovering a point shows that run", () => {
    const { container } = renderChart(POINTS);
    const wrapper = container.querySelector(".recharts-wrapper") as HTMLElement;
    fireEvent.mouseMove(wrapper, { clientX: 28, clientY: 100 });
    expect(within(screen.getByRole("tooltip")).getByText("v5")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole("group"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("omits the version for a point from an older payload", () => {
    renderChart([point({ agent_version: undefined }), point({ agent_version: undefined })]);
    fireEvent.focus(screen.getByRole("group"));
    expect(within(screen.getByRole("tooltip")).queryByText(/^v\d/)).toBeNull();
  });

  it("draws a dot per point only when asked to", () => {
    const withDots = renderChart(POINTS, true);
    // 3 points x 3 lines, minus the one null precision
    expect(withDots.container.querySelectorAll(".recharts-line-dot")).toHaveLength(8);
    cleanup();
    const plain = renderChart(POINTS, false);
    expect(plain.container.querySelectorAll(".recharts-line-dot")).toHaveLength(0);
  });

  it("renders a value as text, never as markup (NFR-3)", () => {
    // no digit in it: V8's lenient Date parser would otherwise read a date out of it
    const evil = '<img src=x onerror="alert">';
    const { container } = renderChart([point({ started_at: evil }), point({ started_at: evil })]);
    fireEvent.focus(screen.getByRole("group"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(evil);
    expect(container.querySelector("img")).toBeNull();
  });
});
