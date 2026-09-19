/* hooks/conventions.ts — React Query hooks for the Conventions page.

   Five routes, one page: scan, list, triage/edit, draft the skill, save it.
   The scan is SYNCHRONOUS on the server (one model call, tens of seconds, 5
   requests per minute) — there is no job to poll, so it is a mutation whose
   result is the new list. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScanResult,
  ConventionSkillDraft,
  ConventionStatus,
  Skill,
} from "@devdigest/shared";

export interface ConventionList {
  candidates: ConventionCandidate[];
}

export const conventionsKey = (repoId: string | null | undefined) => ["conventions", repoId];

/** The whole triage list — pending, accepted and rejected. The page filters it. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionsKey(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run the scan.
 *
 * `meta.quietError` suppresses the global mutation toast: a 422 here is an
 * expected answer ("no clone", "no index") and a 429 is the rate limit doing
 * its job, and both are shown in place with the reason the server gave. A
 * system toast would frame them as a malfunction.
 *
 * The response already carries the stored candidates, so it is written into
 * the list cache rather than triggering a refetch of what we just received.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    meta: { quietError: true },
    mutationFn: () => api.post<ConventionScanResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (result) => {
      qc.setQueryData<ConventionList>(conventionsKey(repoId), { candidates: result.candidates });
    },
  });
}

export interface ConventionPatch {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

/**
 * Triage (Accept / Reject) and the inline edit are ONE route, so they are one
 * hook. The server returns the updated row; swapping it into the cached list
 * keeps the card in place instead of blanking the page on every click.
 */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionList>(conventionsKey(repoId), (prev) =>
        prev
          ? { candidates: prev.candidates.map((c) => (c.id === updated.id ? updated : c)) }
          : prev,
      );
    },
  });
}

/**
 * What a save WOULD store, assembled server-side and writing nothing.
 *
 * `staleTime: 0` on purpose: accepting one more rule changes the body, and a
 * cached draft would show the modal a set the user no longer has. Mount the
 * consumer only while the modal is open and this fetches per opening.
 */
export function useConventionSkillDraft(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["convention-skill-draft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill/draft`),
    enabled: !!repoId,
    staleTime: 0,
  });
}

/**
 * Assemble the accepted rules into the `repo-conventions` skill.
 *
 * Every field is optional server-side — omitting one means "use what the
 * server assembled" — so the modal sends only what the user actually changed.
 * Invalidating `["skills"]` is what makes the new skill appear on /skills
 * without a reload.
 */
export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ConventionSkillDraft>) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, patch),
    onSuccess: (skill) => {
      qc.setQueryData(["skill", skill.id], skill);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
    },
  });
}
