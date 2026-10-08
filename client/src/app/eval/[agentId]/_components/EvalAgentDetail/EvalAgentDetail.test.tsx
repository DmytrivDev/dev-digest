import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCompare, EvalDashboard, EvalSuiteRun, EvalTrendPoint } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import messages from "../../../../../../messages/en/eval.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "a1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The chart and sparkline are drawn by Recharts / SVG maths jsdom cannot size;
// what matters here is the data and the domain each one is handed.
const lineChartProps: Array<{ series: Array<{ name: string; data: number[] }>; yMin?: number; yMax?: number }> = [];
vi.mock("@devdigest/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@devdigest/ui")>();
  return {
    ...actual,
    LineChart: (props: (typeof lineChartProps)[number]) => {
      lineChartProps.push(props);
      return <div data-testid="line-chart" />;
    },
    Sparkline: ({ data }: { data: number[] }) => (
      <span data-testid="sparkline" data-points={JSON.stringify(data)} />
    ),
  };
});

import { EvalAgentDetail } from "./EvalAgentDetail";
import EvalAgentPage from "../../page";

function run(version: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: `run-v${version}`,
    agent_id: "a1",
    agent_version: version,
    status: "completed",
    error_reason: null,
    started_at: `2026-05-${String(10 + version).padStart(2, "0")}T09:14:00.000Z`,
    finished_at: `2026-05-${String(10 + version).padStart(2, "0")}T09:16:00.000Z`,
    cases_total: 20,
    cases_done: 20,
    cases_passed: 16,
    cases_scored: 20,
    cases_errored: 0,
    recall: 0.78,
    precision: 0.91,
    citation_accuracy: 0.94,
    cost_usd: 0.21,
    duration_ms: 1000,
    config: { system_prompt: "p", model: "gpt-4.1", provider: "openai", strategy: "single", skills: [] },
    ...over,
  } as EvalSuiteRun;
}

const point = (recall: number, precision: number, citation: number, day: number): EvalTrendPoint => ({
  started_at: `2026-05-${String(day).padStart(2, "0")}T09:14:00.000Z`,
  recall,
  precision,
  citation_accuracy: citation,
});

function dashboard(over: Partial<EvalDashboard> = {}): EvalDashboard {
  return {
    agent: { id: "a1", name: "Security Reviewer", provider: "openai", model: "gpt-4.1" },
    cases_total: 8,
    runs: [
      run(8, { recall: 0.82, precision: 0.85, citation_accuracy: 0.95, cost_usd: 0.23 }),
      run(7),
    ],
    trend: [point(0.78, 0.91, 0.94, 17), point(0.82, 0.85, 0.95, 18)],
    alert: null,
    ...over,
  };
}

let reply: EvalDashboard = dashboard();
let compareReply: { status: number; body: unknown } = { status: 404, body: {} };
const requests: string[] = [];

beforeEach(() => {
  requests.length = 0;
  lineChartProps.length = 0;
  reply = dashboard();
  compareReply = { status: 404, body: { error: { code: "not_found", message: "no" } } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = String(input);
      requests.push(url);
      const isCompare = url.includes("/eval/compare");
      const status = isCompare ? compareReply.status : 200;
      return {
        ok: status < 300,
        status,
        statusText: String(status),
        json: async () => (isCompare ? compareReply.body : reply),
      };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ToastProvider>{node}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

async function renderDetail() {
  const view = render(wrap(<EvalAgentDetail agentId="a1" />));
  await screen.findByRole("heading", { name: "Security Reviewer" });
  return view;
}

describe("EvalAgentDetail — header (AC-81)", () => {
  it("shows the back link, name + model, subtitle, configure link and the run button", async () => {
    await renderDetail();
    expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("Regression harness · 2 runs on the 8-case set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configure eval cases →" })).toHaveAttribute(
      "href",
      "/agents/a1?tab=evals",
    );
    expect(screen.getByRole("button", { name: "Run eval (8 cases)" })).toBeEnabled();
  });

  it("is URL-addressable: the page renders the agent named in the route (AC-80)", async () => {
    render(wrap(<EvalAgentPage />));
    expect(await screen.findByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(requests.some((u) => u.endsWith("/agents/a1/eval/dashboard"))).toBe(true);
  });

  it("shows a load error with retry when the dashboard cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, statusText: "x", json: async () => ({}) })),
    );
    render(wrap(<EvalAgentDetail agentId="a1" />));
    expect(await screen.findByText("Could not load this agent's eval dashboard.")).toBeInTheDocument();
  });
});

describe("EvalAgentDetail — metric cards (AC-82)", () => {
  it("shows the latest completed value, its delta in whole points and the sparkline", async () => {
    await renderDetail();
    const recall = within(screen.getByTestId("metric-card-recall"));
    expect(recall.getByText("RECALL")).toBeInTheDocument();
    expect(recall.getByText("82")).toBeInTheDocument();
    expect(recall.getByText("4pt")).toBeInTheDocument();
    expect(JSON.parse(recall.getByTestId("sparkline").dataset.points!)).toEqual([0.78, 0.82]);

    const precision = within(screen.getByTestId("metric-card-precision"));
    expect(precision.getByText("85")).toBeInTheDocument();
    expect(precision.getByText("6pt")).toBeInTheDocument();
    expect(JSON.parse(precision.getByTestId("sparkline").dataset.points!)).toEqual([0.91, 0.85]);

    const citation = within(screen.getByTestId("metric-card-citation_accuracy"));
    expect(citation.getByText("CITATION ACCURACY")).toBeInTheDocument();
    expect(citation.getByText("95")).toBeInTheDocument();
    expect(citation.getByText("1pt")).toBeInTheDocument();
  });

  it("keeps only the last 20 trend points and skips null values", async () => {
    const trend = Array.from({ length: 25 }, (_, i) => point(0.5 + i / 100, 0.9, 0.9, 1 + i));
    trend[24] = { ...trend[24]!, recall: null };
    reply = dashboard({ trend });
    await renderDetail();
    const spark = JSON.parse(
      within(screen.getByTestId("metric-card-recall")).getByTestId("sparkline").dataset.points!,
    ) as number[];
    // 24 non-null recall values, last 20 of them.
    expect(spark).toHaveLength(20);
    expect(spark[19]).toBeCloseTo(0.5 + 23 / 100);
  });

  it("shows n/a and no delta with no completed run", async () => {
    reply = dashboard({ runs: [run(1, { status: "running", recall: null, precision: null, citation_accuracy: null })], trend: [] });
    await renderDetail();
    const recall = within(screen.getByTestId("metric-card-recall"));
    expect(recall.getByText("n/a")).toBeInTheDocument();
    expect(recall.queryByText(/pt$/)).toBeNull();
  });
});

describe("EvalAgentDetail — trend chart (AC-83)", () => {
  it("hands LineChart a 0–1 domain, so a 0.30 precision lies inside it", async () => {
    reply = dashboard({ trend: [point(0.78, 0.3, 0.94, 17), point(0.82, 0.35, 0.95, 18)] });
    await renderDetail();
    const props = lineChartProps[lineChartProps.length - 1]!;
    expect(props.yMin).toBe(0);
    expect(props.yMax).toBe(1);
    const precision = props.series.find((s) => s.name === "precision")!;
    expect(precision.data).toEqual([0.3, 0.35]);
    expect(Math.min(...precision.data)).toBeGreaterThanOrEqual(props.yMin!);
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
  });
});

describe("EvalAgentDetail — runs table (AC-84)", () => {
  it("renders the 20 newest of 25 runs in the given order, with the table columns", async () => {
    const runs = Array.from({ length: 25 }, (_, i) => run(25 - i));
    reply = dashboard({ runs });
    await renderDetail();
    const table = screen.getByRole("table", { name: "Recent runs" });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"]);
    const rows = within(table).getAllByTestId(/^run-row-/);
    expect(rows).toHaveLength(20);
    expect(rows[0]).toHaveAttribute("data-testid", "run-row-run-v25");
    expect(rows[19]).toHaveAttribute("data-testid", "run-row-run-v6");
    expect(within(rows[0]!).getByText("v25")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("16/20")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("$0.21")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("78%")).toBeInTheDocument();
  });

  it("says so when there are no runs yet", async () => {
    reply = dashboard({ runs: [], trend: [] });
    await renderDetail();
    expect(screen.getByText("No runs yet. Run the eval to see metrics here.")).toBeInTheDocument();
  });
});

describe("EvalAgentDetail — regression banner (AC-86)", () => {
  it("names each dropped metric with its drop and versions, and lists the failing cases", async () => {
    reply = dashboard({
      alert: {
        drops: [{ metric: "precision", old_value: 0.91, new_value: 0.85, old_version: 7, new_version: 8 }],
        now_failing: [{ case_id: "c1", name: "stripe-key-leak" }],
      },
    });
    await renderDetail();
    const banner = screen.getByRole("alert");
    expect(within(banner).getByText("Precision dropped 6 pts on v8 vs v7")).toBeInTheDocument();
    expect(within(banner).getByText("stripe-key-leak")).toBeInTheDocument();
  });

  it("is absent without an alert", async () => {
    await renderDetail();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders a hostile case name as text", async () => {
    reply = dashboard({
      alert: {
        drops: [{ metric: "recall", old_value: 0.9, new_value: 0.8, old_version: 1, new_version: 2 }],
        now_failing: [{ case_id: "c1", name: "<img src=x onerror=alert(1)>" }],
      },
    });
    const { container } = await renderDetail();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("EvalAgentDetail — selecting runs to compare (AC-87…89)", () => {
  const box = (version: number) => screen.getByRole("checkbox", { name: `Select run v${version}` });

  beforeEach(() => {
    reply = dashboard({
      runs: [run(8), run(7), run(6), run(5, { status: "running" }), run(4, { status: "failed" })],
    });
  });

  it("enables Compare only at exactly two selected, and shows '2 selected'", async () => {
    await renderDetail();
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();
    fireEvent.click(box(8));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();
    fireEvent.click(box(7));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compare).toBeEnabled();
  });

  it("disables every other checkbox once two are selected, and re-enables on uncheck", async () => {
    await renderDetail();
    fireEvent.click(box(8));
    fireEvent.click(box(7));
    expect(box(6)).toBeDisabled();
    expect(box(8)).toBeEnabled();
    expect(box(7)).toBeEnabled();
    fireEvent.click(box(7));
    expect(box(6)).toBeEnabled();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("disables the checkbox of a running or failed run", async () => {
    await renderDetail();
    expect(box(5)).toBeDisabled();
    expect(box(4)).toBeDisabled();
    expect(box(6)).toBeEnabled();
  });

  it("is keyboard-operable: the checkbox is a focusable native button that toggles", async () => {
    await renderDetail();
    const b = box(8);
    expect(b.tagName).toBe("BUTTON");
    expect(b).not.toHaveAttribute("tabindex", "-1");
    b.focus();
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute("aria-checked", "false");
    fireEvent.click(b); // Space / Enter on a native button dispatch a click
    expect(b).toHaveAttribute("aria-checked", "true");
  });

  it("opens the compare modal for the two selected runs", async () => {
    compareReply = {
      status: 200,
      body: {
        old: run(7),
        new: run(8),
        common_case_ids: ["c1"],
        only_in_old: [],
        only_in_new: [],
        metrics: {
          old: { recall: 0.78, precision: 0.91, citation_accuracy: 0.94 },
          new: { recall: 0.82, precision: 0.85, citation_accuracy: 0.95 },
        },
        deltas: { recall: 0.04, precision: -0.06, citation_accuracy: 0.01, cost_usd: 0.02 },
        config_changes: [],
        prompt_diff: [],
        flips: [],
      } satisfies EvalCompare,
    };
    await renderDetail();
    fireEvent.click(box(8));
    fireEvent.click(box(7));
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Compare runs · v7 → v8")).toBeInTheDocument();
    expect(requests.some((u) => u.includes("/eval/compare?a=run-v8&b=run-v7"))).toBe(true);
    // Escape closes it.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Compare runs · v7 → v8")).toBeNull());
  });
});
