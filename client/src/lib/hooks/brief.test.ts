import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { usePrBrief, useGeneratePrBrief, briefKey, BRIEF_POLL_MS } from "./brief";

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

const IDLE = { brief: null, generating: false, stale: false };
const BUSY = { brief: null, generating: true, stale: false };

afterEach(() => {
  vi.useRealTimers();
  get.mockReset();
  post.mockReset();
});

describe("usePrBrief", () => {
  it('queries /pulls/:id/brief under the ["pr-brief", prId] key and never POSTs on mount', async () => {
    get.mockResolvedValue(IDLE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePrBrief("pr-1"), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/pulls/pr-1/brief");
    expect(qc.getQueryState(briefKey("pr-1"))).toBeDefined();
    expect(post).not.toHaveBeenCalled();
  });

  it("is not enabled with no prId", () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => usePrBrief(null), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("opts out of the global error toast with meta.quietError", async () => {
    get.mockResolvedValue(IDLE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePrBrief("pr-1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryCache().find({ queryKey: briefKey("pr-1") })?.meta?.quietError).toBe(true);
  });

  it("re-requests exactly once, 3 s after a `generating: true` answer, and stops once it is false", async () => {
    vi.useFakeTimers();
    get.mockResolvedValueOnce(BUSY).mockResolvedValue(IDLE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => usePrBrief("pr-1"), { wrapper: wrapper(qc) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BRIEF_POLL_MS - 1);
    });
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(get).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BRIEF_POLL_MS * 4);
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("useGeneratePrBrief", () => {
  it("one mutate sends exactly one POST and writes the response into the cache", async () => {
    const stored = { brief: null, generating: false, stale: true };
    post.mockResolvedValue(stored);
    const qc = new QueryClient();
    const { result } = renderHook(() => useGeneratePrBrief("pr-1"), { wrapper: wrapper(qc) });

    act(() => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/pulls/pr-1/brief");
    expect(qc.getQueryData(briefKey("pr-1"))).toEqual(stored);
  });

  it("opts out of the global error toast with meta.quietError", async () => {
    post.mockResolvedValue(IDLE);
    const qc = new QueryClient();
    const { result } = renderHook(() => useGeneratePrBrief("pr-1"), { wrapper: wrapper(qc) });
    act(() => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getMutationCache().getAll()[0]?.meta?.quietError).toBe(true);
  });
});
