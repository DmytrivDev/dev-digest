import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { act, render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCase, EvalCaseOutcome, EvalSuiteRun } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const nav = vi.hoisted(() => ({ search: "tab=evals", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/agents/ag1",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// jsdom gives ResponsiveContainer a 0x0 box, so Recharts draws nothing (and
// warns). A fixed size lets the trend chart lay out, so its dots can be counted.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 200 } as object),
  };
});

import { EvalsTab } from "./EvalsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const EXPECTATION = { kind: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 } as const;

function outcome(over: Partial<EvalCaseOutcome> = {}): EvalCaseOutcome {
  return {
    case_id: "c1",
    case_name: "stripe-key-leak",
    kind: "must_find",
    expectation: EXPECTATION,
    status: "scored",
    pass: true,
    error_reason: null,
    findings_matched: 1,
    findings_total: 1,
    grounding_kept: 1,
    grounding_total: 1,
    duration_ms: 1800,
    cost_usd: 0.02,
    actual: [],
    ...over,
  };
}

function makeCase(id: string, name: string, over: Partial<EvalCase> = {}): EvalCase {
  return {
    id,
    agent_id: "ag1",
    name,
    notes: null,
    input_diff: "@@ -1,1 +1,1 @@\n+x",
    input_meta: { pr_number: 483, title: "Add Stripe integration", body: null },
    expectation: EXPECTATION,
    origin: "finding",
    labels: { severity: "CRITICAL", category: "security", title: "Hardcoded Stripe secret key" },
    source: { finding_id: "f1", pr_number: 483, repo: "acme/payments-api", available: true },
    created_at: "2026-10-01T10:00:00.000Z",
    last_outcome: null,
    ...over,
  };
}

function makeRun(version: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: `run${version}`,
    agent_id: "ag1",
    agent_version: version,
    status: "completed",
    error_reason: null,
    started_at: `2026-10-0${version}T10:00:00.000Z`,
    finished_at: `2026-10-0${version}T10:05:00.000Z`,
    cases_total: 8,
    cases_done: 8,
    cases_passed: 5,
    cases_scored: 7,
    cases_errored: 1,
    recall: 0.82,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: 0.12,
    duration_ms: 1000,
    config: {
      system_prompt: "p",
      model: "gpt-4.1",
      provider: "openai",
      strategy: "single-pass",
      skills: [],
    },
    ...over,
  };
}

const fetchMock = vi.fn();
let cases: EvalCase[] = [];
let runs: EvalSuiteRun[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  nav.search = "tab=evals";
  nav.replace.mockReset();
  cases = [];
  runs = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "DELETE") {
      const id = url.split("/").pop()!;
      cases = cases.filter((c) => c.id !== id);
      return jsonResponse(null, 204);
    }
    if (method === "POST" && url.endsWith("/agents/ag1/eval/cases")) {
      const body = JSON.parse(init!.body as string);
      const created = makeCase("new1", body.name, {
        origin: "manual",
        labels: null,
        source: null,
        input_diff: body.input_diff,
        input_meta: { pr_number: null, title: body.input_meta?.title ?? "", body: null },
        expectation: body.expectation,
      });
      cases = [...cases, created];
      return jsonResponse(created, 201);
    }
    if (url.endsWith("/eval/cases")) return jsonResponse(cases);
    if (url.endsWith("/eval/runs")) return jsonResponse(runs);
    return jsonResponse({ error: { code: "not_found", message: "no" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages, shell: shellMessages }}>
        <ToastProvider>
          <EvalsTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalsTab — metric cards (AC-27, AC-28, AC-31)", () => {
  it("shows four cards for the latest completed run with deltas against the previous one", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    runs = [
      makeRun(3, { recall: 0.82, precision: 0.5, citation_accuracy: 1, cases_passed: 5, cases_scored: 7 }),
      // A newer failed run must be ignored: the cards read the latest COMPLETED run.
      makeRun(4, { status: "failed", error_reason: "interrupted", recall: null, precision: null, citation_accuracy: null }),
      makeRun(2, { recall: 0.78, precision: 0.6, citation_accuracy: 1 }),
    ];
    renderTab();
    await screen.findByText("RECALL");
    // The run history repeats these numbers, so read each value inside its card.
    const card = (label: string) => within(screen.getByText(label).parentElement!);
    expect(card("RECALL").getByText("82%")).toBeInTheDocument();
    expect(card("RECALL").getByText("4pt")).toBeInTheDocument();
    expect(card("PRECISION").getByText("50%")).toBeInTheDocument();
    expect(card("PRECISION").getByText("10pt")).toBeInTheDocument();
    expect(card("CITATION ACCURACY").getByText("100%")).toBeInTheDocument();
    expect(card("CITATION ACCURACY").getByText("0pt")).toBeInTheDocument();
    expect(card("CASES PASSED").getByText("5/7")).toBeInTheDocument();
  });

  it("shows '5 / 7 passing' from 7 scored cases of which 5 passed and 1 errored", async () => {
    cases = [makeCase("c1", "a")];
    runs = [makeRun(1, { cases_total: 8, cases_scored: 7, cases_passed: 5, cases_errored: 1 })];
    renderTab();
    expect(await screen.findByText("5 / 7 passing")).toBeInTheDocument();
  });

  it("shows 'No runs yet' and no metric value when no run has completed", async () => {
    cases = [makeCase("c1", "a")];
    renderTab();
    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
    expect(screen.queryByText("RECALL")).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(screen.queryByText(/passing$/)).toBeNull();
  });
});

describe("EvalsTab — case list (AC-29, AC-30, AC-32)", () => {
  it("renders a row per case with its parts and no Run control", async () => {
    cases = [
      makeCase("c1", "stripe-key-leak", { last_outcome: outcome() }),
      makeCase("c2", "no-flag-comment", {
        expectation: { kind: "must_not_flag", file: "src/util.ts", start_line: 3, end_line: 9 },
        labels: { severity: "WARNING", category: "style", title: "x" },
      }),
    ];
    renderTab();
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(first.getByText("must find")).toBeInTheDocument();
    expect(first.getByText("security")).toBeInTheDocument();
    expect(first.getByLabelText("Passed")).toBeInTheDocument();
    expect(first.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(first.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(rows[1]!).getByText("must not flag")).toBeInTheDocument();
    for (const row of rows) {
      expect(within(row).queryByRole("button", { name: /^run/i })).toBeNull();
      expect(within(row).queryByLabelText(/^run/i)).toBeNull();
    }
  });

  it("renders the four result-line variants", async () => {
    cases = [
      makeCase("c1", "found", { last_outcome: outcome({ findings_matched: 1 }) }),
      makeCase("c2", "clean", {
        expectation: { kind: "must_not_flag", file: "src/util.ts", start_line: 3, end_line: 9 },
        last_outcome: outcome({ kind: "must_not_flag", pass: false, findings_matched: 2 }),
      }),
      makeCase("c3", "broken", {
        last_outcome: outcome({ status: "errored", pass: null, error_reason: "timeout" }),
      }),
      makeCase("c4", "fresh"),
    ];
    renderTab();
    expect(await screen.findByText("expected a finding at src/config.ts:12–12, got 1")).toBeInTheDocument();
    expect(screen.getByText("expected none at src/util.ts:3–9, got 2")).toBeInTheDocument();
    expect(screen.getByText("errored · timeout")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getByLabelText("Failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Errored")).toBeInTheDocument();
    expect(screen.getByLabelText("Never run")).toBeInTheDocument();
  });

  it("shows the EmptyState when the agent has no cases", async () => {
    renderTab();
    expect(await screen.findByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.getByText(/Turn an accepted or dismissed finding into a case/)).toBeInTheDocument();
    // SPEC-05 AC-49: the second source of a case is named too.
    expect(screen.getByText(/"Turn into eval case"/)).toBeInTheDocument();
    expect(screen.getByText(/"New eval case"/)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Run all evals (0 cases)" })).toBeDisabled();
  });

  it("renders a case name containing markup as literal text", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    cases = [makeCase("c1", evil)];
    renderTab();
    expect(await screen.findByText(evil)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("EvalsTab — run history (AC-33)", () => {
  it("lists the last 5 of 7 runs newest first and links to the agent's dashboard", async () => {
    cases = [makeCase("c1", "a")];
    runs = [1, 2, 3, 4, 5, 6, 7].map((v) => makeRun(v));
    renderTab();
    const table = await screen.findByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows.map((r) => within(r).getByText(/^v\d$/).textContent)).toEqual([
      "v7",
      "v6",
      "v5",
      "v4",
      "v3",
    ]);
    for (const col of ["Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost", "Status"]) {
      expect(within(table).getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    expect(within(bodyRows[0]!).getByText("5/7")).toBeInTheDocument();
    expect(within(bodyRows[0]!).getByText("$0.12")).toBeInTheDocument();
    expect(within(bodyRows[0]!).getByText("completed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/ag1");
  });

  it("passes a running run to the run button", async () => {
    cases = [makeCase("c1", "a")];
    runs = [makeRun(1, { status: "running", cases_done: 3, cases_total: 8, recall: null, precision: null, citation_accuracy: null })];
    renderTab();
    const button = await screen.findByRole("button", { name: "Running 3 / 8 cases" });
    expect(button).toBeDisabled();
  });
});

describe("EvalsTab — delete (AC-34)", () => {
  it("opens the ConfirmDialog, deletes on confirm and drops the row", async () => {
    cases = [makeCase("c1", "stripe-key-leak"), makeCase("c2", "other-case")];
    renderTab();
    const row = (await screen.findByText("stripe-key-leak")).closest("[role=listitem]") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete eval case stripe-key-leak?")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete case" }));
    await waitFor(() => expect(screen.queryByText("stripe-key-leak")).toBeNull());
    const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(del![0]).toMatch(/\/eval\/cases\/c1$/);
    expect(screen.getByText("other-case")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not delete when the dialog is cancelled", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
  });
});

describe("EvalsTab — the open case lives in the URL (AC-5, AC-36)", () => {
  it("opens the modal for ?case=c1", async () => {
    nav.search = "tab=evals&case=c1";
    cases = [makeCase("c1", "stripe-key-leak"), makeCase("c2", "other-case")];
    renderTab();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Eval case · stripe-key-leak")).toBeInTheDocument();
    expect(within(dialog).getByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();
  });

  it("opens no modal for a case id that is not in the suite", async () => {
    nav.search = "tab=evals&case=gone";
    cases = [makeCase("c1", "stripe-key-leak")];
    renderTab();
    await screen.findByText("stripe-key-leak");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("writes ?case= when a row is clicked and keeps the other params", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    renderTab();
    fireEvent.click(await screen.findByText("stripe-key-leak"));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace.mock.calls[0]![0]).toBe("/agents/ag1?tab=evals&case=c1");
  });

  it("opens through the Edit icon exactly once", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it("clears ?case= when the modal closes on Escape", async () => {
    nav.search = "tab=evals&case=c1";
    cases = [makeCase("c1", "stripe-key-leak")];
    renderTab();
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(nav.replace).toHaveBeenCalledWith("/agents/ag1?tab=evals", { scroll: false });
  });
});

describe("EvalsTab — keyboard (NFR-3)", () => {
  it("makes every control a native, focusable button or link", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    runs = [makeRun(1)];
    renderTab();
    const row = (await screen.findByText("stripe-key-leak")).closest("[role=listitem]") as HTMLElement;
    const controls = [
      ...within(row).getAllByRole("button"),
      screen.getByRole("button", { name: "Run all evals (1 cases)" }),
      screen.getByRole("link", { name: "View full dashboard →" }),
    ];
    for (const control of controls) {
      expect(control.getAttribute("tabindex")).not.toBe("-1");
      control.focus();
      expect(document.activeElement).toBe(control);
    }
  });
});

// ---- SPEC-05: New eval case --------------------------------------------------

const newCaseButton = () => screen.getByRole("button", { name: "New eval case" });

describe("EvalsTab — New eval case button (SPEC-05 AC-1, AC-2)", () => {
  it("is a primary Plus button right after the run button (AC-1)", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    runs = [makeRun(1)];
    renderTab();
    const run = await screen.findByRole("button", { name: "Run all evals (1 cases)" });
    const add = newCaseButton();
    expect(run.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.parentElement).toBe(run.parentElement);
    expect(add.nextElementSibling).toBeNull();
    expect(add).toHaveStyle({ background: "var(--accent)" });
    expect(add.querySelector("svg.lucide-plus")).not.toBeNull();
  });

  it("stays enabled with zero cases, with no run, and while a run is running (AC-2)", async () => {
    renderTab();
    await screen.findByText("No eval cases yet");
    expect(newCaseButton()).toBeEnabled();
    cleanup();
    cases = [makeCase("c1", "stripe-key-leak")];
    runs = [];
    renderTab();
    await screen.findByText("stripe-key-leak");
    expect(newCaseButton()).toBeEnabled();
    cleanup();
    runs = [makeRun(1, { status: "running", finished_at: null, cases_done: 2, cases_total: 8 })];
    renderTab();
    await screen.findByText("stripe-key-leak");
    expect(await screen.findByRole("button", { name: /Running 2 \/ 8 cases/ })).toBeDisabled();
    expect(newCaseButton()).toBeEnabled();
  });
});

describe("EvalsTab — creating a case (SPEC-05 AC-16)", () => {
  it("lists the new case and counts it in the run button, with no reload", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    renderTab();
    await screen.findByText("stripe-key-leak");
    expect(screen.getByRole("button", { name: "Run all evals (1 cases)" })).toBeInTheDocument();

    fireEvent.click(newCaseButton());
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("New eval case")).toBeInTheDocument();
    const change = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
    change(dialog.getByRole("textbox", { name: "Name" }), "hand-written");
    change(
      dialog.getByRole("textbox", { name: "Diff" }),
      "+++ b/src/config.ts\n@@ -10,2 +12,3 @@\n+added\n ctx\n+more\n",
    );
    change(
      dialog.getByRole("textbox", { name: /Expected output/ }),
      JSON.stringify({ kind: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 }),
    );
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("hand-written")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals (2 cases)" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens no create modal until the button is clicked, and closes it on Cancel", async () => {
    renderTab();
    await screen.findByText("No eval cases yet");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(newCaseButton());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
  });
});

describe("EvalsTab — the manual badge (SPEC-05 AC-41)", () => {
  it("shows 'manual' in place of severity and category on a manual row, and leaves a finding row alone", async () => {
    cases = [
      makeCase("c1", "stripe-key-leak"),
      makeCase("c2", "hand-written", { origin: "manual", labels: null, source: null }),
    ];
    renderTab();
    const manual = (await screen.findByText("hand-written")).closest("[role=listitem]") as HTMLElement;
    const finding = screen.getByText("stripe-key-leak").closest("[role=listitem]") as HTMLElement;
    expect(within(manual).getByText("must find")).toBeInTheDocument();
    expect(within(manual).getByText("manual")).toBeInTheDocument();
    expect(within(manual).queryByText(/critical/i)).toBeNull();
    expect(within(manual).queryByText(/security/i)).toBeNull();
    expect(within(finding).queryByText("manual")).toBeNull();
    expect(within(finding).getByText(/critical/i)).toBeInTheDocument();
  });
});

describe("EvalsTab — the metric trend (SPEC-05 AC-50, AC-56)", () => {
  const dots = (container: HTMLElement) => container.querySelectorAll(".recharts-line-dot");

  it("sits between the EVAL METRICS section and the case list", async () => {
    cases = [makeCase("c1", "stripe-key-leak")];
    runs = [makeRun(2), makeRun(1)];
    renderTab();
    const trend = await screen.findByRole("group", { name: "Metric trend by run" });
    const metrics = screen.getByText("Eval metrics");
    const list = await screen.findByRole("list");
    expect(metrics.compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trend.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
  });

  it("adds a point when a polled run changes from running to completed, without a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      cases = [makeCase("c1", "stripe-key-leak")];
      runs = [
        makeRun(3, { status: "running", finished_at: null, recall: null, precision: null, citation_accuracy: null }),
        makeRun(2),
        makeRun(1),
      ];
      const { container } = renderTab();
      await waitFor(() => expect(dots(container)).toHaveLength(6)); // 2 completed runs x 3 lines

      runs = [makeRun(3), makeRun(2), makeRun(1)];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100); // the runs list polls every 3 s while one runs
      });
      await waitFor(() => expect(dots(container)).toHaveLength(9));
    } finally {
      vi.useRealTimers();
    }
  });
});
