/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour page.

   Two routes: read the tour (+ readiness + in-flight flag) and generate it.
   Generation is SYNCHRONOUS on the server (one model call, up to 2 minutes), so
   it is a mutation whose response is the new document; the read poll covers the
   cases where the page is not the one that started it (EC-27). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingTourResponse } from "@devdigest/shared";

/** Poll period while indexing or generating — the spec allows at most 5 s (AC-9). */
export const ONBOARDING_POLL_MS = 3000;

export const onboardingKey = (repoId: string | null | undefined) => ["onboarding", repoId];

/**
 * The tour read: readiness, the in-flight flag and the stored tour (or null).
 * Polls only while there is something to wait for — `not_indexed` (the index job
 * may finish) or `generating` (another tab or a previous visit started a run).
 */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingKey(repoId),
    queryFn: () => api.get<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (q) =>
      q.state.data?.readiness === "not_indexed" || q.state.data?.generating
        ? ONBOARDING_POLL_MS
        : false,
  });
}

/**
 * Generate (or regenerate) the tour. The response already carries the stored
 * document, so it is written into the read cache straight away, then the read is
 * invalidated to pick up `stale` / `generating` as the server now reports them.
 * A 404 / 409 / 429 goes through the app's default mutation toast (A-8).
 */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTourResponse>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (data) => {
      qc.setQueryData<OnboardingTourResponse>(onboardingKey(repoId), data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: onboardingKey(repoId) }),
  });
}
