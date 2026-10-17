import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentPerfRow, AgentStats } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import perfMessages from "../../../../../../../../messages/en/agentPerformance.json";

const { get, replace, nav } = vi.hoisted(() => ({
  get: vi.fn(),
  replace: vi.fn(),
  nav: { search: "tab=stats" },
}));

vi.mock("@/lib/api", () => ({ api: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/agents/ag1",
  useRouter: () => ({ replace }),
}));

import { metricStrings } from "@/lib/agent-performance";
import { StatsTab } from "./StatsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const ROW: AgentPerfRow = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  enabled: true,
  runs: 1234,
  failed_runs: 0,
  priced_runs: 1200,
  total_cost_usd: 61.7,
  avg_cost_usd: 0.05,
  avg_duration_ms: 6234,
  findings: 10,
  accepted: 3,
  dismissed: 1,
  accept_rate: 0.75,
  small_sample: true,
  last_run_at: "2026-10-17T10:00:00Z",
  recent_runs: [],
};

function stats(row: Partial<AgentPerfRow> = {}): AgentStats {
  return {
    window: { from: "2026-09-17T00:00:00Z", to: "2026-10-17T00:00:00Z", days: 30 },
    cost_basis: "estimate",
    min_decisions: 5,
    agent: { ...ROW, ...row },
  } as AgentStats;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, agentPerformance: perfMessages }}>
        <StatsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  nav.search = "tab=stats";
});
afterEach(cleanup);

describe("StatsTab", () => {
  it("requests the default 30-day window for this agent (AC-58)", async () => {
    get.mockResolvedValue(stats());
    renderTab();
    await screen.findByText("Total runs");
    expect(get).toHaveBeenCalledWith("/agents/ag1/stats?days=30");
    expect(replace).not.toHaveBeenCalled();
  });

  it("writes a preset to the URL and keeps tab=stats (AC-58)", async () => {
    get.mockResolvedValue(stats());
    renderTab();
    await screen.findByText("Total runs");
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(replace).toHaveBeenCalledWith("/agents/ag1?tab=stats&days=1");
  });

  it("renders the four cards with the formatter the dashboard uses (AC-59, AC-62)", async () => {
    get.mockResolvedValue(stats());
    renderTab();
    const m = metricStrings(ROW);
    await screen.findByText("Total runs");
    expect(screen.getByText(m.runs)).toBeInTheDocument();
    expect(screen.getByText("Avg cost / run")).toBeInTheDocument();
    expect(screen.getByText(m.avgCost)).toBeInTheDocument();
    expect(screen.getByText("Avg duration")).toBeInTheDocument();
    expect(screen.getByText("6.2s")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Accept rate")).toBeInTheDocument();
  });

  it("prints the accept-rate string with the small-sample note (AC-60)", async () => {
    get.mockResolvedValue(stats());
    renderTab();
    expect(await screen.findByText("75% · 3 of 4 decided · small sample (n = 4)")).toBeInTheDocument();
  });

  it("prints a dash and '0 decided' when nothing was decided (AC-60)", async () => {
    get.mockResolvedValue(stats({ accepted: 0, dismissed: 0, accept_rate: null, small_sample: false }));
    renderTab();
    expect(await screen.findByText("— · 0 decided")).toBeInTheDocument();
  });

  it("omits the small-sample note for a large sample", async () => {
    get.mockResolvedValue(stats({ accepted: 30, dismissed: 10, accept_rate: 0.75, small_sample: false }));
    renderTab();
    expect(await screen.findByText("75% · 30 of 40 decided")).toBeInTheDocument();
  });

  it("labels the cost an estimate and says how many runs were priced (AC-61)", async () => {
    get.mockResolvedValue(stats());
    renderTab();
    expect(await screen.findByText("DevDigest estimate")).toBeInTheDocument();
    expect(screen.getByText("1200 of 1234 runs priced")).toBeInTheDocument();
  });

  it("hides the priced note when every run was priced (AC-61)", async () => {
    get.mockResolvedValue(stats({ priced_runs: 1234 }));
    renderTab();
    await screen.findByText("DevDigest estimate");
    expect(screen.queryByText(/runs priced/)).not.toBeInTheDocument();
  });

  it("shows placeholders without digits, $ or dashes while pending (AC-63)", () => {
    get.mockReturnValue(new Promise(() => {}));
    renderTab();
    const region = screen.getByRole("status").parentElement!;
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region.textContent).not.toMatch(/[0-9$—]/);
    expect(screen.queryByText("Total runs")).not.toBeInTheDocument();
  });

  it("shows an error with Retry that refetches (AC-64)", async () => {
    get.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(stats());
    renderTab();
    expect(await screen.findByText("Could not load this agent's stats.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Total runs")).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("says the agent has never run (AC-65)", async () => {
    get.mockResolvedValue(stats({ runs: 0, last_run_at: null, avg_cost_usd: null, avg_duration_ms: null }));
    renderTab();
    expect(await screen.findByText("This agent has not run yet")).toBeInTheDocument();
    expect(screen.queryByText("Total runs")).not.toBeInTheDocument();
  });

  it("says there were no runs in the period and when it last ran (AC-65)", async () => {
    const lastRun = new Date(Date.now() - 3 * 86_400_000).toISOString();
    get.mockResolvedValue(stats({ runs: 0, last_run_at: lastRun }));
    renderTab();
    expect(await screen.findByText("No runs in this period · last run 3d ago")).toBeInTheDocument();
    expect(screen.queryByText("Total runs")).not.toBeInTheDocument();
  });

  it("never renders a raw i18n key in loaded, empty or error states (NFR-5)", async () => {
    const RAW_KEY = /^(agents|agentPerformance|stats)\.[\w.]+$/;
    const rawKeys = () =>
      Array.from(document.body.querySelectorAll("*"))
        .flatMap((el) => Array.from(el.childNodes))
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? "").trim())
        .filter((x) => RAW_KEY.test(x));

    get.mockResolvedValue(stats());
    renderTab();
    await screen.findByText("Total runs");
    expect(rawKeys()).toEqual([]);
    cleanup();

    get.mockResolvedValue(stats({ runs: 0, last_run_at: null }));
    renderTab();
    await screen.findByText("This agent has not run yet");
    expect(rawKeys()).toEqual([]);
    cleanup();

    get.mockReset();
    get.mockRejectedValue(new Error("boom"));
    renderTab();
    await screen.findByText("Could not load this agent's stats.");
    expect(rawKeys()).toEqual([]);
  });
});
