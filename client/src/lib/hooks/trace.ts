/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { RunTrace } from "@devdigest/shared";

/** How often a 404 is retried, one second apart. */
const TRACE_404_RETRIES = 5;

export function useRunTrace(runId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["run-trace", runId],
    queryFn: () => api.get<RunTrace>(`/runs/${runId}/trace`),
    enabled: !!runId && enabled,
    // The executor marks a run `done` a moment BEFORE it saves the trace, so a
    // caller that enables this query on the status flip (the multi-agent results
    // page polls the status) can read a 404 that becomes a 200 shortly after.
    // Retry only that case; every other error stays a single attempt.
    retry: (count, err) => err instanceof ApiError && err.status === 404 && count < TRACE_404_RETRIES,
    retryDelay: 1000,
  });
}
