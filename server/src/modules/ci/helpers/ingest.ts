/**
 * Pure rules of the CI-runs ingest (ring 1 — I/O-free by hand).
 *
 * Trust model: the artifact is written by a workflow whose inputs a PR author
 * can influence, so GitHub's own metadata is the source of identity (AC-31) and
 * the artifact is only cross-checked against it (AC-32).
 */
import { CiResultArtifact } from '@devdigest/shared';
import type { CiRunStatus, CiRunVerdict, WorkflowRunMeta } from '@devdigest/shared';
import { CI_ARTIFACT_MAX_BYTES } from '../constants.js';

export type RejectReason = 'artifact_invalid' | 'identity_mismatch';

export type ArtifactCheck =
  | { ok: true; artifact: CiResultArtifact }
  | { ok: false; reason: RejectReason };

/**
 * Size → JSON → strict schema → identity against GitHub's run metadata.
 * The size check precedes `JSON.parse` so an oversize body is never parsed.
 * `prNumber` is GitHub's value; when GitHub knows none the PR is not compared.
 */
export function checkArtifact(
  text: string,
  meta: WorkflowRunMeta,
  prNumber: number | null,
): ArtifactCheck {
  if (Buffer.byteLength(text, 'utf8') > CI_ARTIFACT_MAX_BYTES) {
    return { ok: false, reason: 'artifact_invalid' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'artifact_invalid' };
  }
  const parsed = CiResultArtifact.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'artifact_invalid' };
  const a = parsed.data;

  const mismatch =
    a.repository_id !== meta.repository_id ||
    a.commit_sha.toLowerCase() !== meta.head_sha.toLowerCase() ||
    a.run_id !== meta.id ||
    a.run_attempt !== meta.run_attempt ||
    (prNumber !== null && a.pr_number !== prNumber);
  if (mismatch) return { ok: false, reason: 'identity_mismatch' };
  return { ok: true, artifact: a };
}

/** What the ingest found for one completed run's artifact. */
export type ArtifactOutcome = ArtifactCheck | { ok: false; reason: 'absent' };

export interface MappedRun {
  status: CiRunStatus;
  reason: string | null;
  verdict: CiRunVerdict | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  costUsd: number | null;
  durationMs: number | null;
  findingsCount: number | null;
  blockers: number | null;
}

const EMPTY: Omit<MappedRun, 'status' | 'reason'> = {
  verdict: null,
  critical: null,
  warning: null,
  suggestion: null,
  costUsd: null,
  durationMs: null,
  findingsCount: null,
  blockers: null,
};

/**
 * One status per run (AC-33): not completed → running; completed without an
 * artifact → failed with GitHub's conclusion; invalid → rejected (no counts or
 * cost); valid → succeeded with verdict, counts, cost and duration.
 */
export function mapRun(meta: WorkflowRunMeta, outcome: ArtifactOutcome | null): MappedRun {
  if (meta.status !== 'completed' || outcome === null) {
    return { ...EMPTY, status: 'running', reason: null };
  }
  if (!outcome.ok && outcome.reason === 'absent') {
    return { ...EMPTY, status: 'failed', reason: meta.conclusion ?? 'unknown' };
  }
  if (!outcome.ok) {
    return { ...EMPTY, status: 'rejected', reason: outcome.reason };
  }
  const a = outcome.artifact;
  return {
    status: 'succeeded',
    reason: null,
    verdict: a.gate_triggered ? 'blocked' : 'passed',
    critical: a.critical ?? 0,
    warning: a.warning ?? 0,
    suggestion: a.suggestion ?? 0,
    costUsd: a.cost_usd,
    durationMs: a.duration_ms ?? null,
    findingsCount: a.findings_count,
    blockers: a.blockers,
  };
}

/** `agent_runs.status` for a mapped run — null while running (plan assumption A2). */
export function agentRunStatus(status: CiRunStatus): 'done' | 'failed' | null {
  if (status === 'running') return null;
  return status === 'succeeded' ? 'done' : 'failed';
}

/** The workflow file's basename, as the Actions API addresses it. */
export function workflowBasename(workflowPath: string): string {
  const i = workflowPath.lastIndexOf('/');
  return i === -1 ? workflowPath : workflowPath.slice(i + 1);
}
