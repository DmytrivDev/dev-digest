/* hooks/eval.ts — React Query hooks for the eval pipeline (SPEC-04): the cases
   of an agent, suite runs (started in the background, so polled while running),
   the dashboard aggregates and the run-to-run compare.

   Mutations whose 4xx is an ANSWER (a reason code the user can act on) carry
   `meta.quietError` so the global MutationCache handler stays silent, and map
   the code to ONE human toast themselves (client/INSIGHTS.md, 2026-09-19). */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "../api";
import { notify } from "../toast";
import {
  caseSaveErrorKey,
  createCaseErrorKey,
  runStartErrorKey,
} from "../eval";
import type {
  EvalCase,
  EvalCaseCreate,
  EvalCaseUpdate,
  EvalCompare,
  EvalDashboard,
  EvalOverviewRow,
  EvalRunStartResponse,
  EvalSuiteRun,
  ReviewRecord,
} from "@devdigest/shared";

/** How often a running suite run (and what shows it) is re-read. */
export const EVAL_RUN_POLL_MS = 3000;

export const evalKeys = {
  cases: (agentId: string | null | undefined) => ["eval-cases", agentId] as const,
  runs: (agentId: string | null | undefined) => ["eval-runs", agentId] as const,
  run: (runId: string | null | undefined) => ["eval-run", runId] as const,
  overview: ["eval-overview"] as const,
  dashboard: (agentId: string | null | undefined) => ["eval-dashboard", agentId] as const,
  compare: (a: string | null | undefined, b: string | null | undefined) =>
    ["eval-compare", a, b] as const,
};

const hasRunning = (runs: ReadonlyArray<{ status: string }> | undefined) =>
  (runs ?? []).some((r) => r.status === "running");

/**
 * A run finishing changes every number built from its outcomes: the case rows'
 * last result, the dashboard and the overview. Polling alone only refreshes the
 * list that holds the running run, so when "running" turns off, refresh the rest.
 */
function useRefreshWhenRunSettles(agentId: string | null | undefined, running: boolean) {
  const qc = useQueryClient();
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.overview });
    }
    wasRunning.current = running;
  }, [running, agentId, qc]);
}

// ---- Reads -------------------------------------------------------------------

/** Every case of an agent's suite, each with its latest outcome. */
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.cases(agentId),
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval/cases`),
    enabled: !!agentId,
  });
}

/** The agent's last runs, newest first. Polls while one is running. */
export function useEvalRuns(agentId: string | null | undefined) {
  const q = useQuery({
    queryKey: evalKeys.runs(agentId),
    queryFn: () => api.get<EvalSuiteRun[]>(`/agents/${agentId}/eval/runs`),
    enabled: !!agentId,
    refetchInterval: (query) => (hasRunning(query.state.data) ? EVAL_RUN_POLL_MS : false),
  });
  useRefreshWhenRunSettles(agentId, hasRunning(q.data));
  return q;
}

/** One run with its per-case outcomes. Polls while it is running. */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.run(runId),
    queryFn: () => api.get<EvalSuiteRun>(`/eval/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? EVAL_RUN_POLL_MS : false,
  });
}

/** One row per workspace agent, zero-case agents included. */
export function useEvalOverview() {
  return useQuery({
    queryKey: evalKeys.overview,
    queryFn: () => api.get<EvalOverviewRow[]>("/eval/overview"),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((row) => row.latest_run?.status === "running")
        ? EVAL_RUN_POLL_MS
        : false,
  });
}

/** Dashboard aggregates for one agent. Polls while one of its runs is running. */
export function useEvalDashboard(agentId: string | null | undefined) {
  const q = useQuery({
    queryKey: evalKeys.dashboard(agentId),
    queryFn: () => api.get<EvalDashboard>(`/agents/${agentId}/eval/dashboard`),
    enabled: !!agentId,
    refetchInterval: (query) => (hasRunning(query.state.data?.runs) ? EVAL_RUN_POLL_MS : false),
  });
  useRefreshWhenRunSettles(agentId, hasRunning(q.data?.runs));
  return q;
}

/**
 * Compare two completed runs (the server decides which is "old"). Enabled only
 * with both ids. A 409/422 is an answer the modal shows inline — see
 * `compareErrorKey` — so it is neither retried nor toasted.
 */
export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.compare(a, b),
    queryFn: () => api.get<EvalCompare>(`/eval/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b,
    retry: false,
    meta: { quietError: true },
  });
}

// ---- Writes ------------------------------------------------------------------

/**
 * Turn a triaged finding into an eval case. The server answers 201 (new) or 200
 * (it already existed) with the case. The new id is written straight into the
 * cached PR reviews so the card flips to "In eval suite" with no reload.
 */
export function useCreateEvalCase(prId?: string | null) {
  const qc = useQueryClient();
  const t = useTranslations("prReview");
  return useMutation({
    meta: { quietError: true },
    mutationFn: (findingId: string) => api.post<EvalCase>(`/findings/${findingId}/eval-case`),
    onSuccess: (created, findingId) => {
      if (prId) {
        qc.setQueryData<ReviewRecord[]>(["reviews", prId], (prev) =>
          prev?.map((review) => ({
            ...review,
            findings: review.findings.map((f) =>
              f.id === findingId
                ? { ...f, eval_case_id: created.id, eval_ineligible_reason: null }
                : f,
            ),
          })),
        );
        qc.invalidateQueries({ queryKey: ["reviews", prId] });
      }
      qc.invalidateQueries({ queryKey: evalKeys.cases(created.agent_id) });
      qc.invalidateQueries({ queryKey: evalKeys.overview });
    },
    onError: (err) => notify.error(t(createCaseErrorKey(err))),
  });
}

/**
 * Create a manual case (POST, SPEC-05). A 422 is an ANSWER the modal keeps its
 * fields for, so the global handler stays quiet and this hook shows exactly one
 * mapped toast. The list, the dashboard and the overview all count the new case.
 */
export function useCreateManualEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const t = useTranslations("eval");
  return useMutation({
    meta: { quietError: true },
    mutationFn: (body: EvalCaseCreate) => api.post<EvalCase>(`/agents/${agentId}/eval/cases`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.overview });
    },
    onError: (err) => notify.error(t(caseSaveErrorKey(err))),
  });
}

/** Edit a case's name, notes, expectation or — on a manual case — its input (PATCH). */
export function useUpdateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const t = useTranslations("eval");
  return useMutation({
    meta: { quietError: true },
    mutationFn: ({ id, patch }: { id: string; patch: EvalCaseUpdate }) =>
      api.patch<EvalCase>(`/eval/cases/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<EvalCase[]>(evalKeys.cases(agentId), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
      qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
    },
    onError: (err) => notify.error(t(caseSaveErrorKey(err))),
  });
}

/** Delete a case. Past run outcomes keep their stored result (server-side). */
export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<void>(`/eval/cases/${caseId}`),
    onSuccess: (_res, caseId) => {
      qc.setQueryData<EvalCase[]>(evalKeys.cases(agentId), (prev) =>
        prev?.filter((c) => c.id !== caseId),
      );
      qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.overview });
    },
  });
}

/**
 * Start a suite run (202: it continues on the server whether or not anyone is
 * watching). 409 / 422 / 429 each become ONE mapped toast.
 */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const t = useTranslations("eval");
  return useMutation({
    meta: { quietError: true },
    mutationFn: () => api.post<EvalRunStartResponse>(`/agents/${agentId}/eval/runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.overview });
    },
    onError: (err) => notify.error(t(runStartErrorKey(err))),
  });
}
