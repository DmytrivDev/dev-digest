import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { EvalSuiteRun } from "@devdigest/shared";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => get(...args), post: vi.fn() },
}));

import { evalKeys, useEvalRun } from "./eval";

function runOf(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "ag1",
    agent_version: 1,
    status: "running",
    error_reason: null,
    started_at: "2026-10-09T10:00:00.000Z",
    finished_at: null,
    cases_total: 1,
    cases_done: 0,
    cases_passed: 0,
    cases_scored: 0,
    cases_errored: 0,
    recall: null,
    precision: null,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    config: { system_prompt: "p", model: "gpt-4.1", provider: "openai", strategy: "single-pass", skills: [] },
    scope: "case",
    case_id: "c1",
    ...over,
  };
}

const KEYS = [
  evalKeys.cases("ag1"),
  evalKeys.runs("ag1"),
  evalKeys.dashboard("ag1"),
  evalKeys.overview,
];

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  const invalidatedKeys = () => spy.mock.calls.map(([filter]) => filter?.queryKey);
  return { qc, wrapper, invalidatedKeys, spy };
}

afterEach(() => {
  get.mockReset();
});

describe("useEvalRun(runId, agentId) — a followed run refreshes the agent's numbers once it is final (SPEC-07 AC-16)", () => {
  it("refreshes cases, runs, dashboard and overview when the FIRST read already finds the run final", async () => {
    get.mockResolvedValue(runOf("r1", { status: "failed", error_reason: "all_cases_errored" }));
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useEvalRun("r1", "ag1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("failed"));
    await waitFor(() => expect(invalidatedKeys()).toHaveLength(4));
    expect(invalidatedKeys()).toEqual(KEYS);
  });

  it("refreshes once when a run read as running turns final", async () => {
    get.mockResolvedValueOnce(runOf("r1"));
    const { qc, wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useEvalRun("r1", "ag1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("running"));
    expect(invalidatedKeys()).toHaveLength(0);

    qc.setQueryData(evalKeys.run("r1"), runOf("r1", { status: "completed" }));
    await waitFor(() => expect(invalidatedKeys()).toHaveLength(4));
    // Later reads of the same final run do not refresh again.
    qc.setQueryData(evalKeys.run("r1"), runOf("r1", { status: "completed", cost_usd: 0.1 }));
    await Promise.resolve();
    expect(invalidatedKeys()).toHaveLength(4);
  });

  it("does not refresh while the run is still running", async () => {
    get.mockResolvedValue(runOf("r1"));
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useEvalRun("r1", "ag1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("running"));
    expect(invalidatedKeys()).toHaveLength(0);
  });

  it("does not refresh when the tracked id changes (running to a not-yet-read id is no settle)", async () => {
    get.mockImplementation(async (path: string) => {
      if (path.endsWith("/r1")) return runOf("r1");
      return new Promise(() => {}); // r2 never answers
    });
    const { wrapper, invalidatedKeys } = setup();
    const { result, rerender } = renderHook(({ id }) => useEvalRun(id, "ag1"), {
      wrapper,
      initialProps: { id: "r1" as string | null },
    });
    await waitFor(() => expect(result.current.data?.status).toBe("running"));
    rerender({ id: "r2" });
    await waitFor(() => expect(result.current.data).toBeUndefined());
    expect(invalidatedKeys()).toHaveLength(0);
    rerender({ id: null });
    expect(invalidatedKeys()).toHaveLength(0);
  });

  it("refreshes for the new id once it is read final, after a change of tracked id", async () => {
    get.mockImplementation(async (path: string) =>
      path.endsWith("/r1") ? runOf("r1") : runOf("r2", { status: "completed" }),
    );
    const { wrapper, invalidatedKeys } = setup();
    const { result, rerender } = renderHook(({ id }) => useEvalRun(id, "ag1"), {
      wrapper,
      initialProps: { id: "r1" as string | null },
    });
    await waitFor(() => expect(result.current.data?.id).toBe("r1"));
    rerender({ id: "r2" });
    await waitFor(() => expect(invalidatedKeys()).toHaveLength(4));
  });

  it("does not refresh on mount without a followed id", () => {
    const { wrapper, invalidatedKeys } = setup();
    renderHook(() => useEvalRun(null, "ag1"), { wrapper });
    expect(get).not.toHaveBeenCalled();
    expect(invalidatedKeys()).toHaveLength(0);
  });

  it("is a plain read without an agentId: a final run refreshes nothing", async () => {
    get.mockResolvedValue(runOf("r1", { status: "completed" }));
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useEvalRun("r1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("completed"));
    await Promise.resolve();
    expect(invalidatedKeys()).toHaveLength(0);
  });
});
