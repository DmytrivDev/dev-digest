/* hooks/multi-agent.ts — React Query hooks for SPEC-08 Multi-Agent Review:
   run estimates, starting a run, and reading one (polled while running). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentRunEstimates,
  MultiAgentRun,
  MultiAgentRunList,
  MultiAgentRunRequest,
  MultiAgentRunStarted,
} from "@devdigest/shared";

/** Poll period of the results page while the run is still going (AC-36). */
export const MULTI_AGENT_POLL_MS = 3000;

/** GET /agents/run-estimates?agent_ids=a,b — averages of each agent's newest done runs. */
export function useAgentRunEstimates(agentIds: string[]) {
  const key = agentIds.join(",");
  return useQuery({
    queryKey: ["agent-run-estimates", key],
    queryFn: () => api.get<AgentRunEstimates>(`/agents/run-estimates?agent_ids=${key}`),
    enabled: agentIds.length > 0,
  });
}

/** POST /pulls/:id/multi-agent-run — one parent run, one agent run per distinct id. */
export function useStartMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) => {
      const body: MultiAgentRunRequest = { agent_ids: agentIds };
      return api.post<MultiAgentRunStarted>(`/pulls/${prId}/multi-agent-run`, body);
    },
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
    },
  });
}

/** GET /multi-agent-runs/:id — re-read every 3 s while running, stops once done. */
export function useMultiAgentRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRun>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? MULTI_AGENT_POLL_MS : false,
  });
}

/** GET /pulls/:id/multi-agent-runs — the PR's recent runs; re-read every 3 s while any is running. */
export function useRecentMultiAgentRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-runs", prId],
    queryFn: () => api.get<MultiAgentRunList>(`/pulls/${prId}/multi-agent-runs`),
    enabled: !!prId,
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === "running") ? MULTI_AGENT_POLL_MS : false,
  });
}
