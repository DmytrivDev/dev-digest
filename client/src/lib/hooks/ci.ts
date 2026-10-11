/* hooks/ci.ts — React Query hooks for Export to CI (SPEC-09): the installations
   of an agent, the CI runs list, the wizard's preview, the export and the
   refresh that ingests runs from GitHub.

   Preview, export and refresh carry `meta.quietError`: their 4xx/5xx replies
   (provider_not_supported, slug_conflict, workflow_invalid, github_error,
   runner_bundle_missing) are ANSWERS the wizard / page shows inline, so the
   global handler must not toast them a second time (client/INSIGHTS.md). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetchBlob } from "../api";
import type {
  CiExport,
  CiExportInput,
  CiInstallationList,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRunList,
} from "@devdigest/shared";

export const ciKeys = {
  installations: (agentId: string | null | undefined) => ["ci-installations", agentId] as const,
  /** `null` = every run of the workspace (the /ci-runs page). */
  runs: (agentId?: string | null) => ["ci-runs", agentId ?? null] as const,
  preview: (agentId: string | null | undefined, input: CiPreviewInput | null) =>
    ["ci-preview", agentId, input] as const,
};

/** Where the zip is saved when the server sends no (readable) file name. */
const FALLBACK_ZIP_NAME = "devdigest-ci.zip";

export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ciKeys.installations(agentId),
    queryFn: () => api.get<CiInstallationList>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

export function useCiRuns(agentId?: string | null) {
  return useQuery({
    queryKey: ciKeys.runs(agentId),
    queryFn: () =>
      api.get<CiRunList>(agentId ? `/ci/runs?agent_id=${encodeURIComponent(agentId)}` : "/ci/runs"),
  });
}

/**
 * The files the wizard would create. A query (the same input gives the same
 * files) that POSTs, and only runs once there is an input — the wizard passes
 * `null` on its first step, so opening and closing it sends nothing.
 */
export function useCiPreview(agentId: string | null | undefined, input: CiPreviewInput | null) {
  return useQuery({
    queryKey: ciKeys.preview(agentId, input),
    queryFn: () => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
    enabled: !!agentId && input != null,
    retry: false,
    meta: { quietError: true },
  });
}

/** What an export produced: a PR (or an existing PR's URL) or a downloaded zip. */
export type CiExportOutcome =
  | { kind: "open_pr"; result: CiExport }
  | { kind: "zip"; fileName: string };

/** Saves a blob through a throw-away object URL. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { quietError: true },
    mutationFn: async (input: CiExportInput): Promise<CiExportOutcome> => {
      const path = `/agents/${agentId}/export-ci`;
      if (input.action === "zip") {
        const { blob, fileName } = await apiFetchBlob(path, {
          method: "POST",
          body: JSON.stringify(input),
        });
        const name = fileName ?? FALLBACK_ZIP_NAME;
        saveBlob(blob, name);
        return { kind: "zip", fileName: name };
      }
      return { kind: "open_pr", result: await api.post<CiExport>(path, input) };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ciKeys.installations(agentId) }),
  });
}

/** Ingests the workflow runs from GitHub; failures per repo come back inline. */
export function useRefreshCi() {
  const qc = useQueryClient();
  return useMutation({
    meta: { quietError: true },
    mutationFn: () => api.post<CiRefreshResult>("/ci/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
      qc.invalidateQueries({ queryKey: ["ci-installations"] });
    },
  });
}
