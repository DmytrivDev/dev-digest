/** Row → wire mappers (ring 1). Drizzle rows never leave the module. */
import type { CiInstallation, CiRun, CiRunStatus } from '@devdigest/shared';
import type { ciInstallations, ciRuns } from '../../../db/schema/ci.js';

export type InstallationRow = typeof ciInstallations.$inferSelect;
export type CiRunRow = typeof ciRuns.$inferSelect;

export interface LastRun {
  status: CiRunStatus;
  ranAt: Date | null;
}

const RUN_STATUSES: readonly string[] = ['running', 'succeeded', 'failed', 'rejected'];

/** Narrow a free-text `ci_runs.status` (legacy rows may hold anything) to the wire enum. */
export function asRunStatus(value: string | null): CiRunStatus | null {
  return value !== null && RUN_STATUSES.includes(value) ? (value as CiRunStatus) : null;
}

export function toInstallationDto(
  row: InstallationRow,
  repoFullName: string,
  lastRun: LastRun | null,
): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo_id: row.repoId ?? '',
    repo: repoFullName,
    target_type: row.targetType,
    workflow_path: row.workflowPath,
    agent_slug: row.agentSlug,
    generator_version: row.generatorVersion,
    agent_version: row.agentVersion,
    triggers: row.triggers as CiInstallation['triggers'],
    post_as: row.postAs,
    pr_url: row.prUrl,
    installed_at: row.installedAt.toISOString(),
    last_run: lastRun
      ? { status: lastRun.status, ran_at: lastRun.ranAt ? lastRun.ranAt.toISOString() : null }
      : null,
  };
}

export function toRunDto(
  row: CiRunRow,
  ctx: { repo: string; agentId: string | null; agentName: string; installedAt: Date },
): CiRun {
  return {
    id: row.id,
    repo: ctx.repo,
    pr_number: row.prNumber,
    pr_title: row.prTitle,
    agent_id: ctx.agentId,
    agent_name: ctx.agentName,
    commit_sha: row.commitSha ?? '',
    status: asRunStatus(row.status) ?? 'failed',
    reason: row.reason,
    verdict: row.verdict,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    job_url: row.githubUrl ?? '',
    ran_at: (row.ranAt ?? ctx.installedAt).toISOString(),
  };
}
