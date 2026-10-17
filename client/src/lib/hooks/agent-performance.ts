/* hooks/agent-performance.ts — the period window (kept in the URL) and the two
   Agent Performance queries (SPEC-10). Pure rules live in lib/agent-performance.ts. */
"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { AgentPerf, AgentStats } from "@devdigest/shared";
import { api } from "../api";
import {
  DEFAULT_WINDOW,
  parseWindowParams,
  todayLocal,
  windowApiQuery,
  windowParams,
  type UiWindow,
} from "../agent-performance";

const WINDOW_KEYS = ["days", "from", "to"];

/** `search` with its window params replaced by `w`; every other param is kept. */
function withWindow(search: URLSearchParams, w: UiWindow): URLSearchParams {
  const next = new URLSearchParams(search.toString());
  for (const k of WINDOW_KEYS) next.delete(k);
  for (const [k, v] of windowParams(w)) next.set(k, v);
  return next;
}

/** The selected window, read from and written to the URL (AC-31, AC-32). */
export function usePerfWindow() {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const { window, repaired } = parseWindowParams(
    new URLSearchParams(search.toString()),
    todayLocal(new Date()),
  );

  const replaceWith = useCallback(
    (w: UiWindow) => {
      const next = withWindow(new URLSearchParams(search.toString()), w);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [search, pathname, router],
  );

  // A malformed window in the URL is replaced by the default — the router is the external system.
  useEffect(() => {
    if (repaired) replaceWith(DEFAULT_WINDOW);
  }, [repaired, replaceWith]);

  return {
    window,
    setWindow: replaceWith,
    apiQuery: windowApiQuery(window),
    params: windowParams(window),
  };
}

/** GET /agents/performance — no keep-previous data: a new window shows placeholders (AC-50, AC-54). */
export function useAgentPerformance(apiQuery: string) {
  return useQuery({
    queryKey: ["agent-performance", apiQuery],
    queryFn: () => api.get<AgentPerf>(`/agents/performance?${apiQuery}`),
  });
}

/** GET /agents/:id/stats for the Stats tab. */
export function useAgentStats(agentId: string | undefined, apiQuery: string) {
  return useQuery({
    queryKey: ["agent-stats", agentId, apiQuery],
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats?${apiQuery}`),
    enabled: !!agentId,
  });
}
