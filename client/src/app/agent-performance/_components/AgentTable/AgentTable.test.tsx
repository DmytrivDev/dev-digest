import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/agentPerformance.json";
import { perfRow } from "../../fixtures";
import { metricStrings } from "@/lib/agent-performance";
import { AgentTable } from "./AgentTable";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DAYS_PARAMS: [string, string][] = [["days", "30"]];

function show(
  agents: ReturnType<typeof perfRow>[],
  windowParams: [string, string][] = DAYS_PARAMS,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <AgentTable agents={agents} minDecisions={5} costBasis="estimate" windowParams={windowParams} />
    </NextIntlClientProvider>,
  );
}

const bodyRows = () => screen.getAllByRole("row").slice(1);
const rowNames = () => bodyRows().map((r) => within(r).getAllByRole("cell")[0]!.textContent);
const header = (name: RegExp) => screen.getByRole("columnheader", { name });

describe("AgentTable", () => {
  it("AC-39: renders 7 column headers and one row per agent", () => {
    show([
      perfRow({ agent_id: "a", agent_name: "Alpha" }),
      perfRow({ agent_id: "b", agent_name: "Bravo" }),
      perfRow({ agent_id: "c", agent_name: "Charlie" }),
    ]);
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(bodyRows()).toHaveLength(3);
  });

  it("AC-40: shows rate and accepted/decided, or a dash with 0 decided", () => {
    show([
      perfRow({ agent_id: "a", agent_name: "Alpha", accepted: 18, dismissed: 5, accept_rate: 18 / 23 }),
      perfRow({ agent_id: "b", agent_name: "Bravo", accepted: 0, dismissed: 0, accept_rate: null }),
    ]);
    const [alpha, bravo] = bodyRows();
    expect(within(alpha!).getByText("78% · 18/23")).toBeInTheDocument();
    expect(within(bravo!).getByText("0 decided")).toBeInTheDocument();
    expect(within(bravo!).queryByText(/%/)).not.toBeInTheDocument();
  });

  it("AC-41: marks a small sample only below the threshold", () => {
    show([
      perfRow({ agent_id: "a", agent_name: "Alpha", accepted: 3, dismissed: 0, accept_rate: 1, small_sample: true }),
      perfRow({ agent_id: "b", agent_name: "Bravo", accepted: 5, dismissed: 0, accept_rate: 1, small_sample: false }),
    ]);
    expect(screen.getAllByText(/small sample/)).toHaveLength(1);
    expect(screen.getByText("small sample (n = 3)")).toBeInTheDocument();
  });

  it("AC-42: orders by accept rate in three tiers on load", () => {
    show([
      perfRow({ agent_id: "n", agent_name: "None", accepted: 0, dismissed: 0, accept_rate: null }),
      perfRow({ agent_id: "s", agent_name: "Small", accepted: 3, dismissed: 0, accept_rate: 1, small_sample: true }),
      perfRow({ agent_id: "r", agent_name: "Ranked", accepted: 14, dismissed: 6, accept_rate: 0.7 }),
    ]);
    expect(rowNames()).toEqual(["Ranked", "Small", "None"]);
  });

  it("AC-43: sorts client-side, toggles direction, keeps nulls last, sends no request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    show([
      perfRow({ agent_id: "a", agent_name: "Alpha", runs: 5, avg_cost_usd: 0.5 }),
      perfRow({ agent_id: "b", agent_name: "Bravo", runs: 9, avg_cost_usd: 0.1 }),
      perfRow({ agent_id: "z", agent_name: "Zero", runs: 0, avg_cost_usd: null }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Runs/ }));
    expect(rowNames()).toEqual(["Bravo", "Alpha", "Zero"]);
    expect(header(/^Runs/)).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /^Runs/ }));
    expect(rowNames()).toEqual(["Zero", "Alpha", "Bravo"]);
    expect(header(/^Runs/)).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(screen.getByRole("button", { name: /^Avg cost/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Avg cost/ }));
    expect(rowNames()).toEqual(["Bravo", "Alpha", "Zero"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("AC-44: expands one row at a time from loaded data, newest runs first, no request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const runs = (id: string, cost: number) => [
      { run_id: `${id}-old`, ran_at: "2026-10-01T10:00:00.000Z", source: "local" as const, duration_ms: 4000, cost_usd: cost },
      { run_id: `${id}-new`, ran_at: "2026-10-05T10:00:00.000Z", source: "ci" as const, duration_ms: 8000, cost_usd: cost },
    ];
    show([
      perfRow({ agent_id: "a", agent_name: "Alpha", accept_rate: 0.9, recent_runs: runs("a", 0.11) }),
      perfRow({ agent_id: "b", agent_name: "Bravo", accept_rate: 0.5, recent_runs: runs("b", 0.22) }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Show recent runs for Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Show recent runs for Bravo" }));
    expect(screen.getAllByRole("region", { name: "Recent runs" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Show recent runs for Alpha" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Show recent runs for Bravo" })).toHaveAttribute("aria-expanded", "true");
    const items = within(screen.getByRole("region", { name: "Recent runs" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("CI");
    expect(items[1]).toHaveTextContent("Local");
    expect(items[0]).toHaveTextContent("$0.22");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("AC-45: zero-run rows show dashes, the relative last run or Never, and an empty expansion", () => {
    show([
      perfRow({
        agent_id: "a", agent_name: "Alpha", runs: 0, avg_cost_usd: null, avg_duration_ms: null,
        accepted: 0, dismissed: 0, accept_rate: null,
        last_run_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      }),
      perfRow({
        agent_id: "b", agent_name: "Bravo", runs: 0, avg_cost_usd: null, avg_duration_ms: null,
        accepted: 0, dismissed: 0, accept_rate: null, last_run_at: null,
      }),
    ]);
    const [alpha, bravo] = bodyRows();
    expect(within(alpha!).getByText("40d ago")).toBeInTheDocument();
    expect(within(bravo!).getByText("Never")).toBeInTheDocument();
    expect(within(alpha!).getAllByText("—")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show recent runs for Alpha" }));
    expect(screen.getByText("No runs in this period")).toBeInTheDocument();
  });

  it("AC-46: View carries the window parameters", () => {
    const { unmount } = show([perfRow({ agent_id: "a1" })], [["days", "1"]]);
    expect(screen.getByRole("link", { name: /View stats for/ })).toHaveAttribute("href", "/agents/a1?tab=stats&days=1");
    unmount();
    show([perfRow({ agent_id: "a1" })], [["from", "2026-10-01"], ["to", "2026-10-07"]]);
    expect(screen.getByRole("link", { name: /View stats for/ })).toHaveAttribute(
      "href",
      "/agents/a1?tab=stats&from=2026-10-01&to=2026-10-07",
    );
  });

  it("AC-49: the Avg cost header carries the estimate label", () => {
    show([perfRow()]);
    expect(within(header(/^Avg cost/)).getByText("DevDigest estimate")).toBeInTheDocument();
  });

  it("AC-55: a long name is truncated by style and exposed in full as title", () => {
    const long = "N".repeat(120);
    show([perfRow({ agent_name: long })]);
    const el = screen.getByText(long);
    expect(el).toHaveAttribute("title", long);
    expect(el).toHaveStyle({ textOverflow: "ellipsis", overflow: "hidden" });
    expect(screen.getByRole("link", { name: `View stats for ${long}` })).toBeInTheDocument();
  });

  it("AC-62 (dashboard side): displayed values equal metricStrings(row)", () => {
    const row = perfRow({ runs: 1234, avg_duration_ms: 6234, avg_cost_usd: 0.2 });
    const m = metricStrings(row);
    show([row]);
    const cells = within(bodyRows()[0]!).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent(m.runs);
    expect(cells[2]).toHaveTextContent(m.avgCost);
    expect(cells[3]).toHaveTextContent(m.avgDuration);
    expect(cells[4]).toHaveTextContent(`${m.rate} · ${m.accepted}/${m.decided}`);
    expect(m.runs).toBe("1,234");
  });
});
