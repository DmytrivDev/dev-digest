import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
  },
}));

const { mutate, statusData } = vi.hoisted(() => ({
  mutate: vi.fn(),
  statusData: { current: undefined as { updatedAt: string } | undefined },
}));
vi.mock("./repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate, isPending: false }),
  useRepoIntelStatus: () => ({ data: statusData.current }),
}));

import { usePrBlast, usePrHistory, useBlastResync } from "./blast";

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("usePrBlast", () => {
  afterEach(() => {
    get.mockReset();
  });

  it("queries /pulls/:id/blast under the [\"pr-blast\", prId] key", async () => {
    get.mockResolvedValue({ changed_symbols: [], downstream: [], summary: "s" });
    const qc = new QueryClient();
    const { result } = renderHook(() => usePrBlast("pr-1"), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/pulls/pr-1/blast");
    expect(qc.getQueryState(["pr-blast", "pr-1"])).toBeDefined();
  });

  it("is not enabled with no prId", () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => usePrBlast(undefined), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});

describe("usePrHistory", () => {
  afterEach(() => {
    get.mockReset();
  });

  it("does not fetch while enabled:false, and fetches once enabled:true", async () => {
    get.mockResolvedValue({ history: [] });
    const qc = new QueryClient();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePrHistory("pr-1", { enabled }),
      { wrapper: wrapper(qc), initialProps: { enabled: false } },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/pulls/pr-1/history");
  });
});

describe("useBlastResync", () => {
  afterEach(() => {
    mutate.mockReset();
    statusData.current = undefined;
  });

  it("invalidates the blast query once updatedAt advances after start()", async () => {
    statusData.current = { updatedAt: "2026-01-01T00:00:00Z" };
    const qc = new QueryClient();
    qc.setQueryData(["pr-blast", "pr-1"], { changed_symbols: [] });
    const { result, rerender } = renderHook(() => useBlastResync("repo-1", "pr-1"), {
      wrapper: wrapper(qc),
    });

    act(() => {
      result.current.start();
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(qc.getQueryState(["pr-blast", "pr-1"])?.isInvalidated).toBe(false);

    // The index state advances — simulate the poll picking up new data.
    statusData.current = { updatedAt: "2026-01-01T00:05:00Z" };
    rerender();

    await waitFor(() =>
      expect(qc.getQueryState(["pr-blast", "pr-1"])?.isInvalidated).toBe(true),
    );
  });

  it("sets justCompleted once the resync lands, per the invalidation above", async () => {
    statusData.current = { updatedAt: "2026-01-01T00:00:00Z" };
    const qc = new QueryClient();
    const { result, rerender } = renderHook(() => useBlastResync("repo-1", "pr-1"), {
      wrapper: wrapper(qc),
    });

    act(() => {
      result.current.start();
    });
    expect(result.current.justCompleted).toBe(false);

    statusData.current = { updatedAt: "2026-01-01T00:05:00Z" };
    rerender();

    await waitFor(() => expect(result.current.justCompleted).toBe(true));
  });
});
