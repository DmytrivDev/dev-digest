import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstalledFile } from '../../db/schema/ci.js';
import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import { CI_RUNS_LIMIT } from './constants.js';
import { agentRunStatus, type MappedRun } from './helpers/ingest.js';
import { asRunStatus, type CiRunRow, type InstallationRow, type LastRun } from './helpers/dto.js';

/**
 * ci data-access. Tenancy is TRANSITIVE: `ci_installations` / `ci_runs` carry no
 * `workspace_id`, so every read joins `agents.workspace_id` (and, where a repo is
 * addressed, `repos.workspace_id`). Never filter these tables by id alone.
 */

export interface UpsertInstallation {
  agentId: string;
  repoId: string;
  repoFullName: string;
  workflowPath: string;
  agentSlug: string;
  generatorVersion: number;
  agentVersion: number;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  prUrl: string | null;
  files: CiInstalledFile[];
}

export interface InstallationWithRepo {
  row: InstallationRow;
  repoFullName: string;
  lastRun: LastRun | null;
}

/** An installation of the workspace, resolved to a GitHub repo reference. */
export interface WorkspaceInstallation {
  id: string;
  agentId: string;
  workflowPath: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface RunWrite {
  workspaceId: string;
  agentId: string;
  installationId: string;
  /** Present when the run is already stored (update in place). */
  existing?: { ciRunId: string; agentRunId: string | null };
  githubRunId: number;
  runAttempt: number;
  repositoryId: number;
  commitSha: string;
  prNumber: number | null;
  prTitle: string | null;
  jobUrl: string;
  ranAt: Date;
  mapped: MappedRun;
}

export interface StoredRun {
  row: CiRunRow;
  repoFullName: string;
  agentId: string;
  agentName: string;
  installedAt: Date;
}

export class CiRepository {
  constructor(private db: Db) {}

  async repoInWorkspace(
    workspaceId: string,
    repoId: string,
  ): Promise<{ id: string; fullName: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async installationFor(
    workspaceId: string,
    agentId: string,
    repoId: string,
  ): Promise<InstallationRow | undefined> {
    const [row] = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.ciInstallations.agentId, agentId),
          eq(t.ciInstallations.repoId, repoId),
        ),
      );
    return row?.inst;
  }

  /** Every installation in one repository (any agent of the workspace). */
  async installationsInRepo(workspaceId: string, repoId: string): Promise<InstallationRow[]> {
    const rows = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .innerJoin(t.repos, eq(t.repos.id, t.ciInstallations.repoId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.repos.workspaceId, workspaceId),
          eq(t.ciInstallations.repoId, repoId),
        ),
      );
    return rows.map((r) => r.inst);
  }

  /**
   * One installation per (agent, repo). The slug is frozen at first export, so
   * `agentSlug` is deliberately absent from the conflict update set (AC-14).
   * The caller has already resolved both ids inside the workspace.
   */
  async upsertInstallation(values: UpsertInstallation): Promise<InstallationRow> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        agentId: values.agentId,
        repoId: values.repoId,
        repo: values.repoFullName,
        targetType: 'gha',
        workflowPath: values.workflowPath,
        agentSlug: values.agentSlug,
        generatorVersion: values.generatorVersion,
        agentVersion: values.agentVersion,
        triggers: values.triggers,
        postAs: values.postAs,
        prUrl: values.prUrl,
        files: values.files,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repoId],
        set: {
          repo: values.repoFullName,
          targetType: 'gha',
          workflowPath: values.workflowPath,
          generatorVersion: values.generatorVersion,
          agentVersion: values.agentVersion,
          triggers: values.triggers,
          postAs: values.postAs,
          prUrl: values.prUrl,
          files: values.files,
          installedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  /** An agent's installations (newest first) with the newest ingested run of each. */
  async listInstallations(workspaceId: string, agentId: string): Promise<InstallationWithRepo[]> {
    const rows = await this.db
      .select({ inst: t.ciInstallations, repoFullName: t.repos.fullName })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .leftJoin(t.repos, eq(t.repos.id, t.ciInstallations.repoId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(desc(t.ciInstallations.installedAt));
    if (rows.length === 0) return [];

    const runs = await this.db
      .select({
        installationId: t.ciRuns.ciInstallationId,
        status: t.ciRuns.status,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .where(
        and(
          inArray(
            t.ciRuns.ciInstallationId,
            rows.map((r) => r.inst.id),
          ),
          isNotNull(t.ciRuns.githubRunId),
        ),
      )
      .orderBy(desc(t.ciRuns.ranAt));
    const last = new Map<string, LastRun>();
    for (const run of runs) {
      const status = asRunStatus(run.status);
      if (!run.installationId || !status || last.has(run.installationId)) continue;
      last.set(run.installationId, { status, ranAt: run.ranAt });
    }
    return rows.map((r) => ({
      row: r.inst,
      repoFullName: r.repoFullName ?? r.inst.repo,
      lastRun: last.get(r.inst.id) ?? null,
    }));
  }

  /** Installations the ingest can poll: workspace agent + a repo we can address. */
  async workspaceInstallations(workspaceId: string): Promise<WorkspaceInstallation[]> {
    const rows = await this.db
      .select({
        id: t.ciInstallations.id,
        agentId: t.ciInstallations.agentId,
        workflowPath: t.ciInstallations.workflowPath,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .innerJoin(t.repos, eq(t.repos.id, t.ciInstallations.repoId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId)));
    // Pre-existing rows have an empty workflow path — nothing to poll.
    return rows.filter((r) => r.workflowPath !== '');
  }

  /** The stored run for one GitHub run id of an installation (already workspace-resolved). */
  async ciRunByRunId(installationId: string, githubRunId: number): Promise<CiRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciRuns)
      .where(
        and(eq(t.ciRuns.ciInstallationId, installationId), eq(t.ciRuns.githubRunId, githubRunId)),
      );
    return row;
  }

  /**
   * Insert or update one ingested run: the `agent_runs` mirror row
   * (source='ci', pr_id null — the PR list never sees it) and the `ci_runs`
   * detail row, in one transaction.
   */
  async saveRun(w: RunWrite): Promise<void> {
    const m = w.mapped;
    const agentRunValues = {
      durationMs: m.durationMs,
      costUsd: m.costUsd,
      status: agentRunStatus(m.status),
      error: m.status === 'failed' || m.status === 'rejected' ? m.reason : null,
      findingsCount: m.findingsCount,
      blockers: m.blockers,
    };
    const ciRunValues = {
      prNumber: w.prNumber,
      ranAt: w.ranAt,
      status: m.status,
      findingsCount: m.findingsCount,
      costUsd: m.costUsd,
      githubUrl: w.jobUrl,
      source: 'ci',
      githubRunId: w.githubRunId,
      runAttempt: w.runAttempt,
      repositoryId: w.repositoryId,
      commitSha: w.commitSha,
      prTitle: w.prTitle,
      reason: m.reason,
      verdict: m.verdict,
      critical: m.critical,
      warning: m.warning,
      suggestion: m.suggestion,
      durationMs: m.durationMs,
    };

    await this.db.transaction(async (tx) => {
      if (w.existing) {
        let agentRunId = w.existing.agentRunId;
        if (!agentRunId) {
          const [created] = await tx
            .insert(t.agentRuns)
            .values({
              workspaceId: w.workspaceId,
              agentId: w.agentId,
              prId: null,
              ranAt: w.ranAt,
              provider: 'openrouter',
              source: 'ci',
              ...agentRunValues,
            })
            .returning({ id: t.agentRuns.id });
          agentRunId = created!.id;
          await tx.update(t.ciRuns).set({ agentRunId }).where(eq(t.ciRuns.id, w.existing.ciRunId));
        } else {
          await tx
            .update(t.agentRuns)
            .set({ ...agentRunValues, ranAt: w.ranAt })
            .where(
              and(
                eq(t.agentRuns.id, agentRunId),
                eq(t.agentRuns.workspaceId, w.workspaceId),
              ),
            );
        }
        await tx.update(t.ciRuns).set(ciRunValues).where(eq(t.ciRuns.id, w.existing.ciRunId));
        return;
      }
      const [agentRun] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: w.workspaceId,
          agentId: w.agentId,
          prId: null,
          ranAt: w.ranAt,
          provider: 'openrouter',
          source: 'ci',
          ...agentRunValues,
        })
        .returning({ id: t.agentRuns.id });
      await tx
        .insert(t.ciRuns)
        .values({ ciInstallationId: w.installationId, agentRunId: agentRun!.id, ...ciRunValues });
    });
  }

  /** The workspace's ingested CI runs, newest first, capped (AC-36). */
  async listRuns(workspaceId: string, agentId?: string): Promise<StoredRun[]> {
    const rows = await this.db
      .select({
        row: t.ciRuns,
        repoFullName: t.repos.fullName,
        legacyRepo: t.ciInstallations.repo,
        agentId: t.agents.id,
        agentName: t.agents.name,
        installedAt: t.ciInstallations.installedAt,
      })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciInstallations.id, t.ciRuns.ciInstallationId))
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .leftJoin(t.repos, eq(t.repos.id, t.ciInstallations.repoId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          isNotNull(t.ciRuns.githubRunId),
          agentId ? eq(t.agents.id, agentId) : undefined,
        ),
      )
      .orderBy(desc(t.ciRuns.ranAt))
      .limit(CI_RUNS_LIMIT);
    return rows.map((r) => ({
      row: r.row,
      repoFullName: r.repoFullName ?? r.legacyRepo,
      agentId: r.agentId,
      agentName: r.agentName,
      installedAt: r.installedAt,
    }));
  }
}
