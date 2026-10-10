import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCompare, EvalSuiteRun } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { CompareRunsModal } from "./CompareRunsModal";

function run(version: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: `run-v${version}`,
    agent_id: "a1",
    agent_version: version,
    status: "completed",
    error_reason: null,
    started_at: "2026-05-27T16:40:00.000Z",
    finished_at: null,
    cases_total: 20,
    cases_done: 20,
    cases_passed: 16,
    cases_scored: 20,
    cases_errored: 0,
    recall: 0.78,
    precision: 0.93,
    citation_accuracy: 0.94,
    cost_usd: 0.21,
    duration_ms: 1000,
    config: { system_prompt: "p", model: "gpt-4.1", provider: "openai", strategy: "single", skills: [] },
    ...over,
  } as EvalSuiteRun;
}

function compare(over: Partial<EvalCompare> = {}): EvalCompare {
  return {
    old: run(6),
    new: run(7, { cost_usd: 0.23 }),
    common_case_ids: ["c1", "c2"],
    only_in_old: [],
    only_in_new: [],
    metrics: {
      old: { recall: 0.78, precision: 0.93, citation_accuracy: 0.94 },
      new: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95 },
    },
    deltas: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01, cost_usd: 0.02 },
    config_changes: [],
    prompt_diff: [
      { kind: "context", text: "You are a security-focused PR reviewer." },
      { kind: "removed", text: "Flag every unused import." },
      { kind: "added", text: "Flag unused imports as suggestions." },
    ],
    flips: [],
    ...over,
  };
}

let reply: { status: number; body: unknown };

beforeEach(() => {
  reply = { status: 200, body: compare() };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: reply.status < 300,
      status: reply.status,
      statusText: String(reply.status),
      json: async () => reply.body,
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <CompareRunsModal runAId="run-v7" runBId="run-v6" onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

describe("CompareRunsModal — header and cards (AC-98)", () => {
  it("titles the modal with the old and new versions and shows the common-set size", async () => {
    open();
    expect(await screen.findByText("Compare runs · v6 → v7")).toBeInTheDocument();
    expect(screen.getByText(/on the 2-case common set/)).toBeInTheDocument();
  });

  it("shows four cards: recall, precision and citation in %, cost in $", async () => {
    open();
    await screen.findByText("Compare runs · v6 → v7");

    const recall = within(screen.getByTestId("compare-card-recall"));
    expect(recall.getByText("RECALL")).toBeInTheDocument();
    expect(recall.getByText("78%")).toBeInTheDocument();
    expect(recall.getByText("82%")).toBeInTheDocument();
    expect(recall.getByText("4pt")).toBeInTheDocument();

    const precision = within(screen.getByTestId("compare-card-precision"));
    expect(precision.getByText("93%")).toBeInTheDocument();
    expect(precision.getByText("91%")).toBeInTheDocument();
    expect(precision.getByText("2pt")).toBeInTheDocument();

    const citation = within(screen.getByTestId("compare-card-citation_accuracy"));
    expect(citation.getByText("CITATION")).toBeInTheDocument();
    expect(citation.getByText("1pt")).toBeInTheDocument();

    const cost = within(screen.getByTestId("compare-card-cost"));
    expect(cost.getByText("COST")).toBeInTheDocument();
    expect(cost.getByText("$0.21")).toBeInTheDocument();
    expect(cost.getByText("$0.23")).toBeInTheDocument();
    expect(cost.getByText("$0.02")).toBeInTheDocument();
  });

  it("shows n/a for a metric with no value and no delta", async () => {
    reply = {
      status: 200,
      body: compare({
        metrics: {
          old: { recall: null, precision: 0.93, citation_accuracy: 0.94 },
          new: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95 },
        },
      }),
    };
    open();
    const recall = within(await screen.findByTestId("compare-card-recall"));
    expect(recall.getByText("n/a")).toBeInTheDocument();
    expect(recall.queryByText(/pt$/)).toBeNull();
  });
});

describe("CompareRunsModal — system prompt diff (AC-99, AC-100)", () => {
  it("draws added lines on --code-add and removed lines on --code-del, with a legend", async () => {
    open();
    expect(await screen.findByText("SYSTEM PROMPT DIFF")).toBeInTheDocument();
    expect(screen.getByText("v6 (old)")).toBeInTheDocument();
    expect(screen.getByText("v7 (new)")).toBeInTheDocument();
    expect(screen.getByText("Flag unused imports as suggestions.")).toHaveStyle({ background: "var(--code-add)" });
    expect(screen.getByText("Flag every unused import.")).toHaveStyle({ background: "var(--code-del)" });
    // Negative controls: the tokens are not interchangeable (toHaveStyle must see var()).
    expect(screen.getByText("Flag every unused import.")).not.toHaveStyle({ background: "var(--code-add)" });
    expect(screen.getByText("Flag unused imports as suggestions.")).not.toHaveStyle({ background: "var(--code-del)" });
    expect(screen.getByText("You are a security-focused PR reviewer.")).not.toHaveStyle({
      background: "var(--code-add)",
    });
  });

  it("shows 'No changes' when every line is context", async () => {
    reply = {
      status: 200,
      body: compare({ prompt_diff: [{ kind: "context", text: "same prompt" }] }),
    };
    open();
    expect(await screen.findByText("No changes")).toBeInTheDocument();
    expect(screen.queryByText("same prompt")).toBeNull();
  });

  it("renders a prompt line holding markup as text", async () => {
    reply = {
      status: 200,
      body: compare({ prompt_diff: [{ kind: "added", text: "<img src=x onerror=alert(1)>" }] }),
    };
    open();
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("CompareRunsModal — lists (AC-101)", () => {
  it("lists config changes, case flips and the cases only one run had", async () => {
    reply = {
      status: 200,
      body: compare({
        config_changes: [
          { field: "model", old: "gpt-4.1", new: "gpt-4.1-mini" },
          { field: "skills", old: "", new: "owasp@v2" },
        ],
        flips: [
          { case_id: "c1", name: "stripe-key-leak", direction: "now_passing" },
          { case_id: "c2", name: "sql-injection", direction: "now_failing" },
        ],
        only_in_old: [{ case_id: "c3", name: "removed-case" }],
        only_in_new: [{ case_id: "c4", name: "added-case" }],
      }),
    };
    open();
    expect(await screen.findByText("model: gpt-4.1 → gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.getByText("skills: — → owasp@v2")).toBeInTheDocument();

    const passing = screen.getByText("stripe-key-leak").closest("li")!;
    expect(within(passing).getByText("now passing")).toBeInTheDocument();
    const failing = screen.getByText("sql-injection").closest("li")!;
    expect(within(failing).getByText("now failing")).toBeInTheDocument();

    expect(screen.getByText("Only in v6")).toBeInTheDocument();
    expect(screen.getByText("removed-case")).toBeInTheDocument();
    expect(screen.getByText("Only in v7")).toBeInTheDocument();
    expect(screen.getByText("added-case")).toBeInTheDocument();
  });

  it("omits the sections that have nothing to list", async () => {
    open();
    await screen.findByText("SYSTEM PROMPT DIFF");
    expect(screen.queryByText("Config changes")).toBeNull();
    expect(screen.queryByText("Case changes")).toBeNull();
    expect(screen.queryByText(/^Only in/)).toBeNull();
  });
});

describe("CompareRunsModal — footer, close, errors (AC-102, NFR-3)", () => {
  it("offers Close as its only footer action — no Promote", async () => {
    open();
    await screen.findByText("Compare runs · v6 → v7");
    expect(screen.queryByRole("button", { name: /promote/i })).toBeNull();
    // Every button of the dialog: the header X and the footer Close — nothing else.
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(labels).toEqual(["Close", "Close"]);
  });

  it("closes from the Close button and on Escape", async () => {
    const onClose = open();
    await screen.findByText("Compare runs · v6 → v7");
    fireEvent.click(screen.getByText("Close", { selector: "button" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("explains a refused compare inline, with the mapped message", async () => {
    reply = {
      status: 409,
      body: { error: { code: "run_not_completed", message: "not completed" } },
    };
    open();
    expect(await screen.findByText("Only completed runs can be compared.")).toBeInTheDocument();
  });
});
