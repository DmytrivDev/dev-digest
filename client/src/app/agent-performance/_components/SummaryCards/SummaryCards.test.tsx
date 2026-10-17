import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PerfSummary } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";
import { perfResponse } from "../../fixtures";
import { SummaryCards } from "./SummaryCards";

afterEach(cleanup);

function show(over: Partial<PerfSummary> = {}, basis = "estimate") {
  const summary = { ...perfResponse().summary, ...over };
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <SummaryCards summary={summary} costBasis={basis as "estimate"} />
    </NextIntlClientProvider>,
  );
}

const card = (name: string) => screen.getByRole("region", { name });

describe("SummaryCards", () => {
  it("AC-35: Total runs shows the count and the excluded line only when failed > 0", () => {
    const { unmount } = show({ runs: 42, failed_runs: 3 });
    expect(within(card("Total runs")).getByText("42")).toBeInTheDocument();
    expect(within(card("Total runs")).getByText("3 failed or cancelled, not counted")).toBeInTheDocument();
    unmount();
    show({ runs: 42, failed_runs: 0 });
    expect(screen.queryByText(/failed or cancelled/)).not.toBeInTheDocument();
  });

  it("AC-36: Total cost goes through formatCost and shows the unpriced line", () => {
    const { unmount } = show({ total_cost_usd: 8.74, runs: 40, priced_runs: 38 });
    const c = card("Total cost");
    expect(within(c).getByText("$8.74")).toBeInTheDocument();
    expect(within(c).getByText("2 of 40 runs unpriced")).toBeInTheDocument();
    expect(within(c).getByText("DevDigest estimate")).toBeInTheDocument();
    unmount();

    const nullCase = show({ total_cost_usd: null, runs: 40, priced_runs: 40 });
    expect(within(card("Total cost")).getByText("—")).toBeInTheDocument();
    nullCase.unmount();

    show({ total_cost_usd: 0, runs: 40, priced_runs: 40 });
    expect(within(card("Total cost")).getByText("$0.00")).toBeInTheDocument();
    expect(screen.queryByText(/unpriced/)).not.toBeInTheDocument();
  });

  it("AC-49: the estimate label is driven by cost_basis", () => {
    show({}, "billed");
    expect(screen.queryByText("DevDigest estimate")).not.toBeInTheDocument();
  });

  it("AC-37: Avg accept rate shows percent and accepted of decided, never 0% for no decisions", () => {
    const { unmount } = show({ accept_rate: 55 / 90, accepted: 55, dismissed: 35 });
    const c = card("Avg accept rate");
    expect(within(c).getByText("61%")).toBeInTheDocument();
    expect(within(c).getByText("55 of 90 decided")).toBeInTheDocument();
    unmount();

    show({ accept_rate: null, accepted: 0, dismissed: 0 });
    const empty = card("Avg accept rate");
    expect(within(empty).getByText("—")).toBeInTheDocument();
    expect(within(empty).getByText("0 decided")).toBeInTheDocument();
    expect(within(empty).queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("AC-38: Most-active agent shows its name and run count", () => {
    show({ most_active: { agent_id: "a1", agent_name: "Security Reviewer", runs: 142 } });
    const c = card("Most-active agent");
    expect(within(c).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(c).getByText("142 runs")).toBeInTheDocument();
  });
});
