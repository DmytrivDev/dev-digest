/**
 * Ring 2 — the conversation with the DevDigest API, not its HTTP shape.
 * Method names describe WHAT they do (`startReview`, `runResult`), never a
 * verb+path. Justified per onion-architecture §2: it crosses a process
 * boundary (HTTP to localhost:3001) AND tests substitute it (`test/fake-api.ts`).
 *
 * This port intentionally lives in `mcp/src/ports/`, not `@devdigest/shared`
 * (D8): only `mcp` consumes it, and adding it to shared would mean editing
 * both hand-vendored copies for a port the server and client never call.
 */
import type { Agent, BlastRadius, ConventionCandidate, PrDetail, PrMeta, Repo, RunSummary } from '@devdigest/shared';

/** `GET /pulls/:id/runs/active` — one row per agent with a run in flight. */
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

import type { RunResultReviewFinding } from '../core/results.js';
export type { RunResultReviewFinding };

/** The `review` part of `GET /runs/:id/result` — null while running/failed (D2). */
export interface RunResultReview {
  verdict: string | null;
  summary: string | null;
  score: number | null;
  findings: RunResultReviewFinding[];
}

/** The `pr` part of `GET /runs/:id/result` (D2). */
export interface RunResultPr {
  id: string;
  number: number;
  repo_id: string;
  repo_full_name: string;
}

/** `GET /runs/:id/result` response (D2) — composed server-side, not a shared contract. */
export interface RunResult {
  run: RunSummary;
  pr: RunResultPr;
  review: RunResultReview | null;
}

/** One row of `POST /pulls/:id/review`'s `runs[]`. */
export interface StartedRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

export interface DevDigestApi {
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string): Promise<PrMeta[]>;
  getPull(prId: string): Promise<PrDetail>;
  listAgents(): Promise<Agent[]>;
  activeRuns(prId: string): Promise<ActiveRun[]>;
  startReview(prId: string, agentId: string): Promise<StartedRun[]>;
  runResult(runId: string): Promise<RunResult>;
  listConventions(repoId: string): Promise<ConventionCandidate[]>;
  /** `GET /pulls/:id/blast` — symbols, callers, endpoints/crons; no LLM. */
  blastRadius(prId: string): Promise<BlastRadius>;
}
