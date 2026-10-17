import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

const { get, replace, nav } = vi.hoisted(() => ({
  get: vi.fn(),
  replace: vi.fn(),
  nav: { search: "" },
}));

vi.mock("@/lib/api", () => ({ api: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/agents/a1",
  useRouter: () => ({ replace }),
}));

import { useAgentPerformance, useAgentStats, usePerfWindow } from "./agent-performance";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

let savedTz: string | undefined;
beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  nav.search = "";
  savedTz = process.env.TZ;
  process.env.TZ = "Europe/Kyiv";
});
afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe("usePerfWindow", () => {
  it("defaults to 30 days without touching the URL", () => {
    const { result } = renderHook(() => usePerfWindow(), { wrapper: wrapper() });
    expect(result.current.window).toEqual({ kind: "days", days: 30 });
    expect(result.current.apiQuery).toBe("days=30");
    expect(replace).not.toHaveBeenCalled();
  });

  it("replaces a malformed window once, keeping tab=stats", () => {
    nav.search = "tab=stats&days=7";
    renderHook(() => usePerfWindow(), { wrapper: wrapper() });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/agents/a1?tab=stats&days=30");
  });

  it("writes a custom range as from/to and drops days", () => {
    nav.search = "tab=stats&days=1";
    const { result } = renderHook(() => usePerfWindow(), { wrapper: wrapper() });
    act(() => result.current.setWindow({ kind: "custom", start: "2026-09-01", end: "2026-09-30" }));
    const url = new URL(replace.mock.calls.at(-1)![0], "http://x");
    expect(url.searchParams.get("tab")).toBe("stats");
    expect(url.searchParams.get("from")).toBe("2026-09-01");
    expect(url.searchParams.get("to")).toBe("2026-09-30");
    expect(url.searchParams.has("days")).toBe(false);
  });

  it("encodes the + of a custom range's offsets in the API query", () => {
    nav.search = "from=2026-09-01&to=2026-09-30";
    const { result } = renderHook(() => usePerfWindow(), { wrapper: wrapper() });
    expect(result.current.apiQuery).toContain("%2B03%3A00");
    expect(new URLSearchParams(result.current.apiQuery).get("from")).toBe("2026-09-01T00:00:00+03:00");
  });
});

describe("queries", () => {
  it("useAgentPerformance requests /agents/performance with the window query", async () => {
    get.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAgentPerformance("days=30"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/agents/performance?days=30");
  });

  it("useAgentStats requests the agent's stats and stays idle without an id", async () => {
    get.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAgentStats("a1", "days=1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/agents/a1/stats?days=1");

    get.mockClear();
    const idle = renderHook(() => useAgentStats(undefined, "days=1"), { wrapper: wrapper() });
    expect(idle.result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});
