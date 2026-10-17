import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerf } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";
import { perfResponse, perfRow } from "../../fixtures";

const { nav, replace } = vi.hoisted(() => ({ nav: { search: "" }, replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/agent-performance",
  useRouter: () => ({ replace }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

const fetchMock = vi.fn();

beforeEach(() => {
  nav.search = "";
  replace.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

function ui() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <AgentPerformanceView />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const requested = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("AgentPerformanceView", () => {
  it("AC-30: shows the selector with 30 days pressed and requests days=30", async () => {
    fetchMock.mockImplementation(() => json(perfResponse()));
    render(ui());
    expect(screen.getByRole("button", { name: "1 day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom range" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    await screen.findByRole("table");
    expect(requested()[0]).toContain("/agents/performance?days=30");
  });

  it("AC-50: while pending the body holds placeholders and no digit, $ or dash", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(ui());
    const region = screen.getByRole("region", { name: "Loading agent performance" });
    expect(region.textContent).toBe("");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toBeEnabled();
  });

  it("AC-51: a failure shows the error with Retry, no figures, usable selector; Retry re-requests", async () => {
    fetchMock.mockImplementation(() => json({ error: { message: "boom" } }, 500));
    render(ui());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load agent performance.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 day" })).toBeEnabled();
    const before = fetchMock.mock.calls.length;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("AC-52: agents but no runs shows the empty state with the window dates", async () => {
    const empty: AgentPerf = perfResponse({
      window: { from: "2026-09-17T12:00:00.000Z", to: "2026-10-17T12:00:00.000Z", days: 30 },
      summary: { ...perfResponse().summary, runs: 0, failed_runs: 0, priced_runs: 0, total_cost_usd: null, accept_rate: null, accepted: 0, dismissed: 0, most_active: null },
      agents: [perfRow({ agent_id: "x", agent_name: "Idle A", runs: 0 }), perfRow({ agent_id: "y", agent_name: "Idle B", runs: 0 })],
      cost_by_agent: [],
      cost_by_model: [],
    });
    fetchMock.mockImplementation(() => json(empty));
    render(ui());
    expect(await screen.findByText("No agent runs in this period")).toBeInTheDocument();
    expect(screen.getByText(/Sep 17, 2026 – Oct 17, 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("AC-53: no agents shows a distinct empty state linking to /agents", async () => {
    fetchMock.mockImplementation(() => json(perfResponse({ agents: [], cost_by_agent: [], cost_by_model: [] })));
    render(ui());
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Agents" })).toHaveAttribute("href", "/agents");
    expect(screen.queryByText("No agent runs in this period")).not.toBeInTheDocument();
  });

  it("AC-54: only the response for the latest window renders", async () => {
    let resolve30: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string) =>
      String(url).includes("days=30")
        ? new Promise<Response>((r) => (resolve30 = r))
        : json(perfResponse({ summary: { ...perfResponse().summary, runs: 7, failed_runs: 0 } })),
    );
    const view = render(ui());
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(replace).toHaveBeenCalledWith("/agent-performance?days=1");
    nav.search = "days=1";
    view.rerender(ui());
    const total = await screen.findByRole("region", { name: "Total runs" });
    expect(within(total).getByText("7")).toBeInTheDocument();

    await act(async () => {
      resolve30(new Response(JSON.stringify(perfResponse()), { status: 200, headers: { "content-type": "application/json" } }));
    });
    expect(within(screen.getByRole("region", { name: "Total runs" })).getByText("7")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Total runs" })).queryByText("42")).not.toBeInTheDocument();
  });

  it("NFR-5: no rendered text is a raw message key", async () => {
    fetchMock.mockImplementation(() => json(perfResponse()));
    const { container } = render(ui());
    await screen.findByRole("table");
    expect(container.textContent).not.toMatch(/agentPerformance\./);
  });
});
