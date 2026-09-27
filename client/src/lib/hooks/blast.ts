/* hooks/blast.ts — React Query hooks for the Blast Radius card.
     GET /pulls/:id/blast    → usePrBlast
     GET /pulls/:id/history  → usePrHistory (W10)
   Resync composes the existing repo-intel hooks (`useResyncRepoIntel`,
   `useRepoIntelStatus`) rather than adding a new server endpoint: clicking
   Resync kicks off the SAME index refresh the repo settings page uses, and
   this hook only watches for it to land. */
"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useResyncRepoIntel, useRepoIntelStatus } from "./repo-intel";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

/** Stop polling for a completed resync after this long — the resync job itself
    has its own ceiling, but a UI-side stop prevents an endless poll if the job
    dies without ever updating the index row. */
export const RESYNC_POLL_MAX_MS = 120_000;

/** How long the card shows "Resync complete" after a resync actually lands. */
export const RESYNC_DONE_NOTICE_MS = 4_000;

export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** 5 minutes — history comes straight from GitHub (no server cache, no
    resync path touches it), so this is its whole freshness policy: a repeat
    open within the window reuses the cached answer instead of re-fetching. */
const HISTORY_STALE_MS = 5 * 60 * 1000;

/** GET /pulls/:id/history — lazy: pass `enabled: false` while the "Prior
    PRs" panel is collapsed (the caller does, via `open`) so the request
    never fires until it's opened. */
export function usePrHistory(prId: string | null | undefined, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId && (opts.enabled ?? true),
    staleTime: HISTORY_STALE_MS,
  });
}

/**
 * Resync-and-refresh for the Blast Radius card. `start()` records the index
 * state's `updatedAt` at click time, kicks off the existing resync mutation,
 * then polls `useRepoIntelStatus` until `updatedAt` advances — at which point
 * it invalidates `["pr-blast", prId]` once and stops polling. The effect only
 * reacts to server state (an external system), which is the case
 * `useEffect` exists for.
 */
export function useBlastResync(repoId: string | null | undefined, prId: string | null | undefined) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [polling, setPolling] = React.useState(false);
  const [justCompleted, setJustCompleted] = React.useState(false);
  const startedAtRef = React.useRef<string | null>(null);
  const status = useRepoIntelStatus(repoId, polling);

  React.useEffect(() => {
    if (!polling) return;
    const updatedAt = status.data?.updatedAt;
    if (updatedAt && updatedAt !== startedAtRef.current) {
      qc.invalidateQueries({ queryKey: ["pr-blast", prId] });
      setPolling(false);
      setJustCompleted(true);
    }
  }, [polling, status.data?.updatedAt, qc, prId]);

  React.useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => setPolling(false), RESYNC_POLL_MAX_MS);
    return () => clearTimeout(timer);
  }, [polling]);

  // The "Resync complete" notice is itself transient — clear it after a
  // few seconds rather than leaving it up until the next resync.
  React.useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => setJustCompleted(false), RESYNC_DONE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  const start = React.useCallback(() => {
    startedAtRef.current = status.data?.updatedAt ?? null;
    setJustCompleted(false);
    setPolling(true);
    resync.mutate();
  }, [resync, status.data?.updatedAt]);

  return { start, isRunning: polling || resync.isPending, justCompleted };
}
