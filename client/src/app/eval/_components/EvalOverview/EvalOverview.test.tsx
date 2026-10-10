import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalOverviewRow, EvalSuiteRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalOverview } from "./EvalOverview";

function run(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "run1",
    agent_id: "a1",
    agent_version: 7,
    status: "completed",
    error_reason: null,
    started_at: "2026-05-29T09:14:00.000Z",
    finished_at: "2026-05-29T09:16:00.000Z",
    cases_total: 8,
    cases_done: 8,
    cases_passed: 6,
    cases_scored: 8,
    cases_errored: 0,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.23,
    duration_ms: 120000,
    config: { system_prompt: "p", model: "gpt-4.1", provider: "openai", strategy: "single", skills: [] },
    ...over,
  } as EvalSuiteRun;
}

const withRun: EvalOverviewRow = {
  agent_id: "a1",
  agent_name: "Security Reviewer",
  model: "gpt-4.1",
  cases_total: 8,
  latest_run: run(),
};
const zeroCase: EvalOverviewRow = {
  agent_id: "a2",
  agent_name: "Style Bot",
  model: "gpt-4.1-mini",
  cases_total: 0,
  latest_run: null,
};

let rows: EvalOverviewRow[] = [];

beforeEach(() => {
  push.mockReset();
  rows = [withRun, zeroCase];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => rows,
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderOverview() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalOverview />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalOverview (AC-79, AC-80)", () => {
  it("renders every agent's name, model, case count and latest run fields", async () => {
    renderOverview();
    const row = await screen.findByTestId("eval-row-a1");
    const r = within(row);
    expect(r.getByText("Security Reviewer")).toBeInTheDocument();
    expect(r.getByText("gpt-4.1")).toBeInTheDocument();
    expect(r.getByText("8 cases")).toBeInTheDocument();
    expect(r.getByText("v7")).toBeInTheDocument();
    expect(r.getByText("82%")).toBeInTheDocument();
    expect(r.getByText("91%")).toBeInTheDocument();
    expect(r.getByText("95%")).toBeInTheDocument();
    expect(r.getByText("6/8")).toBeInTheDocument();
    expect(r.getByText("$0.23")).toBeInTheDocument();
    const cells = r.getAllByRole("cell");
    // ran-at is the last cell; it is a formatted date, never the raw ISO string.
    expect(cells[cells.length - 1]!.textContent).not.toContain("2026-05-29T");
    expect(cells[cells.length - 1]!.textContent).toMatch(/2026/);
  });

  it("lists a header cell per column", async () => {
    renderOverview();
    await screen.findByTestId("eval-row-a1");
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Agent",
      "Cases",
      "Version",
      "Recall",
      "Precision",
      "Citation",
      "Pass",
      "Cost",
      "Ran at",
    ]);
  });

  it("shows '0 cases · never run' with a link to the Evals tab for a zero-case agent", async () => {
    renderOverview();
    const row = await screen.findByTestId("eval-row-a2");
    expect(within(row).getByText("0 cases · never run")).toBeInTheDocument();
    const link = within(row).getByRole("link", { name: "Configure eval cases →" });
    expect(link).toHaveAttribute("href", "/agents/a2?tab=evals");
  });

  it("does not open the dashboard when the Evals-tab link is clicked", async () => {
    renderOverview();
    const row = await screen.findByTestId("eval-row-a2");
    const link = within(row).getByRole("link", { name: "Configure eval cases →" });
    // jsdom cannot navigate; keep the anchor from trying.
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to the agent's detail URL on a row click", async () => {
    renderOverview();
    const row = await screen.findByTestId("eval-row-a1");
    fireEvent.click(row);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/eval/a1");
  });

  it("makes the row reachable from the keyboard through a native button", async () => {
    renderOverview();
    const button = await screen.findByRole("button", { name: "Security Reviewer" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).not.toHaveAttribute("tabindex", "-1");
    button.focus();
    expect(button).toHaveFocus();
    // Enter/Space on a button dispatch a click, which bubbles to the row.
    fireEvent.click(button);
    expect(push).toHaveBeenCalledWith("/eval/a1");
  });

  it("shows a running latest run with n/a metrics and a status badge", async () => {
    rows = [
      {
        ...withRun,
        latest_run: run({
          status: "running",
          recall: null,
          precision: null,
          citation_accuracy: null,
          cost_usd: null,
          finished_at: null,
        }),
      },
    ];
    renderOverview();
    const row = await screen.findByTestId("eval-row-a1");
    expect(within(row).getAllByText("n/a")).toHaveLength(3);
    expect(within(row).getByText("running")).toBeInTheDocument();
  });

  it("renders a hostile agent name as text", async () => {
    rows = [{ ...withRun, agent_name: "<img src=x onerror=alert(1)>" }];
    const { container } = renderOverview();
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows an empty state when the workspace has no agents", async () => {
    rows = [];
    renderOverview();
    expect(await screen.findByText("No agents in this workspace yet.")).toBeInTheDocument();
  });
});
