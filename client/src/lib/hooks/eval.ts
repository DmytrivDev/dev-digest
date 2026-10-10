/* hooks/eval.ts — React Query hooks for the eval pipeline (SPEC-04): the cases
   of an agent, suite runs and single-case runs (SPEC-07, started in the
   background, so polled while running), the dashboard aggregates and the
   run-to-run compare.

   Mutations whose 4xx is an ANSWER (a reason code the user can act on) carry
   `meta.quietError` so the global MutationCache handler stays silent, and map
   the code to ONE human toast themselves (client/INSIGHTS.md, 2026-09-19). */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

/** Everything built from a run's outcomes: case rows, run lists, dashboard, overview. */
function refreshRunDependents(qc: QueryClient, agentId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
  qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
  qc.invalidateQueries({ queryKey: evalKeys.dashboard(agentId) });
  qc.invalidateQueries({ queryKey: evalKeys.overview });
}

/**
 * A run finishing changes every number built from its outcomes: the case rows'
 * last result, the dashboard and the overview. Polling alone only refreshes the
 * list that holds the running run, so when "running" turns off, refresh the rest.
 */
function useRefreshWhenRunSettles(agentId: string | null | undefined, running: boolean) {
  const qc = useQueryClient();
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running) refreshRunDependents(qc, agentId);
    wasRunning.current = running;
  }, [running, agentId, qc]);
}

/**
 * The same refresh for a run FOLLOWED BY ID: its id came from a 202 (or from a
 * list that showed it `running`), so it is KNOWN to have been running. The first
 * read that finds it final refreshes, even when no read ever saw it `running` (an
 * instant provider error). Keyed on the run, not on a transition: switching to
 * another id (whose data is still undefined) is not a settle, and a run refreshes
 * once.
 */
function useRefreshWhenFollowedRunIsFinal(
  agentId: string | null | undefined,
  runId: string | null | undefined,
  run: Pick<EvalSuiteRun, "id" | "status"> | undefined,
) {
  const qc = useQueryClient();
  const refreshedFor = React.useRef<string | null>(null);
  const status = run && run.id === runId ? run.status : undefined;
  React.useEffect(() => {
    if (status === "running") refreshedFor.current = null; // a re-run under the same id settles again
    if (!agentId || !runId || !status || status === "running") return;
    if (refreshedFor.current === runId) return;
    refreshedFor.current = runId;
    refreshRunDependents(qc, agentId);
  }, [agentId, runId, status, qc]);
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

/**
 * One run with its per-case outcomes. Polls while it is running. With `agentId`
 * the caller declares `runId` a run it STARTED (the id of a 202) or saw running:
 * the first read that finds it final also refreshes that agent's cases, runs,
 * dashboard and overview (SPEC-07 AC-16). The case modal and the case rows follow
 * their own case run through this. Without `agentId` it is a plain read.
 */
export function useEvalRun(runId: string | null | undefined, agentId?: string | null) {
  const q = useQuery({
    queryKey: evalKeys.run(runId),
    queryFn: () => api.get<EvalSuiteRun>(`/eval/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? EVAL_RUN_POLL_MS : false,
  });
  useRefreshWhenFollowedRunIsFinal(agentId, runId, q.data);
  return q;
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
    onSuccess: (created) => {
      // In the cached list before any refetch, so the edit modal the create flow
      // hands over to (SPEC-07 AC-7) finds its case at once.
      qc.setQueryData<EvalCase[]>(evalKeys.cases(agentId), (prev) => [...(prev ?? []), created]);
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

/**
 * Start a run of ONE case (SPEC-07, 202: it continues on the server whether or
 * not anyone is watching). 409 / 422 / 429 each become ONE mapped toast; after a
 * save (`afterSave`) it reads "Case saved; not run: <reason>" so the user knows
 * the edit went through. `onSuccess` returns the invalidations, so the mutation
 * stays pending until the runs list holds the running case run — a second click
 * cannot start a second run in that window (AC-8, AC-21).
 */
export function useStartCaseRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const t = useTranslations("eval");
  return useMutation({
    meta: { quietError: true },
    mutationFn: ({ caseId }: { caseId: string; afterSave: boolean }) =>
      api.post<EvalRunStartResponse>(`/eval/cases/${caseId}/runs`),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) }),
        qc.invalidateQueries({ queryKey: evalKeys.dashboard(agentId) }),
      ]),
    onError: (err, vars) => {
      const reason = t(runStartErrorKey(err));
      notify.error(vars.afterSave ? t("caseRun.savedNotRun", { reason }) : reason);
    },
  });
}
