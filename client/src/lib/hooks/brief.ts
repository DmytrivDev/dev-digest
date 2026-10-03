/* hooks/brief.ts — React Query hooks for the PR Brief.
     GET  /pulls/:id/brief → usePrBrief          (stored brief + generating + stale)
     POST /pulls/:id/brief → useGeneratePrBrief  (one model call; 200 = the same envelope)
   Failures are shown inline by the banner (the server's 4xx/5xx wording is the
   answer), so both opt out of the global error toast with `meta.quietError`. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

/** While the server reports `generating`, re-read the brief this often. */
export const BRIEF_POLL_MS = 3000;

export const briefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.generating ? BRIEF_POLL_MS : false),
    meta: { quietError: true },
  });
}

export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    meta: { quietError: true },
    onSuccess: (data) => qc.setQueryData(briefKey(prId), data),
    onSettled: () => qc.invalidateQueries({ queryKey: briefKey(prId) }),
  });
}
