import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { useDerivePrIntent } from "./reviews";

/**
 * Pins the decision the whole smart-diff invalidation story rests on:
 * `["reviews", prId, "smart-diff"]` sits under the `["reviews", prId]` prefix,
 * so invalidating the reviews query also invalidates smart-diff — no new
 * call site is needed in `useRunReview`/`useFindingAction`/`useDeleteRun`/
 * `useDeleteReview`. If TanStack ever stops prefix-matching by default, this
 * test goes red first.
 */
describe("smart-diff query key sits under the reviews prefix", () => {
  it("invalidating [\"reviews\", prId] also invalidates [\"reviews\", prId, \"smart-diff\"]", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["reviews", "p1"], []);
    qc.setQueryData(["reviews", "p1", "smart-diff"], {
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });

    await qc.invalidateQueries({ queryKey: ["reviews", "p1"] });

    expect(qc.getQueryState(["reviews", "p1", "smart-diff"])?.isInvalidated).toBe(true);
  });
});

describe("useDerivePrIntent", () => {
  afterEach(() => {
    post.mockReset();
  });

  function wrapper(qc: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: qc }, children);
    };
  }

  it("mutate(true) posts { force: true }", async () => {
    post.mockResolvedValue({ intent: { pr_id: "pr-1" } });
    const qc = new QueryClient();
    const { result } = renderHook(() => useDerivePrIntent("pr-1"), { wrapper: wrapper(qc) });

    result.current.mutate(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(post).toHaveBeenCalledWith("/pulls/pr-1/intent", { force: true });
  });

  it("mutate(undefined) posts with no body", async () => {
    post.mockResolvedValue({ intent: { pr_id: "pr-1" } });
    const qc = new QueryClient();
    const { result } = renderHook(() => useDerivePrIntent("pr-1"), { wrapper: wrapper(qc) });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(post).toHaveBeenCalledWith("/pulls/pr-1/intent", undefined);
  });

  it("invalidates [\"pr-intent\", prId] on success", async () => {
    post.mockResolvedValue({ intent: { pr_id: "pr-1" } });
    const qc = new QueryClient();
    qc.setQueryData(["pr-intent", "pr-1"], { intent: null });
    const { result } = renderHook(() => useDerivePrIntent("pr-1"), { wrapper: wrapper(qc) });

    result.current.mutate(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryState(["pr-intent", "pr-1"])?.isInvalidated).toBe(true);
  });
});
