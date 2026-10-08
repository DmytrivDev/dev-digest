import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalSuiteRun } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import messages from "../../../messages/en/eval.json";
import { EvalRunButton } from "./EvalRunButton";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function runningRun(done: number, total = 8): EvalSuiteRun {
  return { id: "run1", agent_id: "a1", status: "running", cases_done: done, cases_total: total } as EvalSuiteRun;
}

function ui(props: Partial<React.ComponentProps<typeof EvalRunButton>> = {}) {
  return (
    <EvalRunButton agentId="a1" caseCount={8} variant="tab" {...props} />
  );
}

function wrap(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ToastProvider>{node}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("EvalRunButton — labels (AC-62, AC-63)", () => {
  it("carries the case count in both variants", () => {
    render(wrap(ui({ variant: "tab", caseCount: 8 })));
    expect(screen.getByRole("button", { name: "Run all evals (8 cases)" })).toBeEnabled();
    cleanup();
    render(wrap(ui({ variant: "dashboard", caseCount: 3 })));
    expect(screen.getByRole("button", { name: "Run eval (3 cases)" })).toBeEnabled();
  });

  it("is disabled with zero cases, in both variants", () => {
    render(wrap(ui({ variant: "tab", caseCount: 0 })));
    expect(screen.getByRole("button", { name: "Run all evals (0 cases)" })).toBeDisabled();
    cleanup();
    render(wrap(ui({ variant: "dashboard", caseCount: 0 })));
    expect(screen.getByRole("button", { name: "Run eval (0 cases)" })).toBeDisabled();
  });
});

describe("EvalRunButton — progress (AC-61)", () => {
  it("shows 'Running k / N cases', disabled, and follows the polled progress", () => {
    const { rerender } = render(wrap(ui({ runningRun: runningRun(2) })));
    expect(screen.getByRole("button", { name: "Running 2 / 8 cases" })).toBeDisabled();

    rerender(wrap(ui({ runningRun: runningRun(3) })));
    expect(screen.getByRole("button", { name: "Running 3 / 8 cases" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Run all evals/ })).toBeNull();
  });

  it("returns to the run label once the run is gone", () => {
    const { rerender } = render(wrap(ui({ runningRun: runningRun(8) })));
    rerender(wrap(ui({ runningRun: null })));
    expect(screen.getByRole("button", { name: "Run all evals (8 cases)" })).toBeEnabled();
  });
});

describe("EvalRunButton — starting", () => {
  it("posts one start request per click, even on a double click", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ run_id: "run1", status: "running", cases_total: 8 }, 202),
    );
    render(wrap(ui()));
    const button = screen.getByRole("button", { name: "Run all evals (8 cases)" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/agents\/a1\/eval\/runs$/);
    expect(init.method).toBe("POST");
  });

  const REFUSALS: [string, number, string | undefined, string][] = [
    ["409 run_in_progress", 409, "run_in_progress", messages.errors.run_in_progress],
    ["422 no_cases", 422, "no_cases", messages.errors.no_cases],
    ["422 provider_key_missing", 422, "provider_key_missing", messages.errors.provider_key_missing],
    ["429", 429, undefined, messages.errors.rateLimited],
  ];

  it.each(REFUSALS)("%s → exactly one toast with the mapped text", async (_n, status, code, text) => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code, message: "server wording" } }, status),
    );
    render(wrap(ui()));
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (8 cases)" }));
    const toasts = await screen.findByRole("status");
    await waitFor(() => expect(within(toasts).getAllByText(text)).toHaveLength(1));
    expect(within(toasts).getAllByRole("button", { name: "Dismiss" })).toHaveLength(1);
    expect(screen.queryByText("server wording")).toBeNull();
  });
});
