import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/agentPerformance.json";
import { CostBreakdown } from "./CostBreakdown";

afterEach(cleanup);

const BY_AGENT = [
  { agent_id: "a", agent_name: "Security Reviewer", cost_usd: 5 },
  { agent_id: "b", agent_name: "Perf Reviewer", cost_usd: 3.5 },
  { agent_id: "c", agent_name: "Style Reviewer", cost_usd: 0.0013 },
];
const BY_MODEL = [
  { model: "gpt-4.1", cost_usd: 6, runs: 10 },
  { model: "claude-sonnet", cost_usd: 2.5, runs: 4 },
  { model: null, cost_usd: 0.0013, runs: 1 },
];

function show(props: Partial<React.ComponentProps<typeof CostBreakdown>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <CostBreakdown
        byAgent={BY_AGENT}
        byModel={BY_MODEL}
        totalCostUsd={8.5013}
        runs={15}
        costBasis="estimate"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("CostBreakdown", () => {
  it("AC-47: both legends list every segment with its formatCost amount; null model is labelled", () => {
    const { container } = show();
    expect(screen.getByText("By agent")).toBeInTheDocument();
    expect(screen.getByText("By model")).toBeInTheDocument();
    for (const label of ["Security Reviewer", "Perf Reviewer", "Style Reviewer", "gpt-4.1", "claude-sonnet", "Model not recorded"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("$3.50")).toBeInTheDocument();
    // the same tiny amount appears once per donut
    expect(screen.getAllByText("$0.0013")).toHaveLength(2);
    expect(container.querySelectorAll(".recharts-wrapper")).toHaveLength(2);
  });

  it("AC-48: with runs but no priced total both panels explain and draw no donut", () => {
    const { container } = show({ totalCostUsd: null, byAgent: [], byModel: [], runs: 5 });
    expect(screen.getAllByText("No priced runs in this period")).toHaveLength(2);
    expect(container.querySelector(".recharts-wrapper")).toBeNull();
  });

  it("AC-49: the section carries the estimate label", () => {
    show();
    expect(screen.getByText("DevDigest estimate")).toBeInTheDocument();
  });
});
