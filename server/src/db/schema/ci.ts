import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { repos } from './repos';
import { agentRuns } from './runs';

/** One exported file recorded on an installation (drives slug-conflict checks). */
export interface CiInstalledFile {
  path: string;
  kind: 'manifest' | 'workflow' | 'skill';
  skill_id?: string;
}

// Tenancy: neither table carries `workspace_id`. Scope is TRANSITIVE — every
// query goes through `agents.workspace_id` (installations) / the installation's
// agent (runs). Never filter these tables by id alone.
export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    /** Nullable only because the table pre-exists; every new row sets it. */
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    workflowPath: text('workflow_path').notNull().default(''),
    /** Frozen at first export — later renames of the agent never change it. */
    agentSlug: text('agent_slug').notNull().default(''),
    generatorVersion: integer('generator_version').notNull().default(1),
    agentVersion: integer('agent_version').notNull().default(1),
    triggers: jsonb('triggers').$type<string[]>().notNull().default([]),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] })
      .notNull()
      .default('github_review'),
    prUrl: text('pr_url'),
    files: jsonb('files').$type<CiInstalledFile[]>().notNull().default([]),
  },
  (t) => ({
    agentRepoUq: uniqueIndex('ci_installations_agent_repo_uq').on(t.agentId, t.repoId),
    byRepo: index('ci_installations_repo_idx').on(t.repoId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
    /** The `agent_runs` row this CI run is mirrored into (source='ci', pr_id null). */
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    githubRunId: bigint('github_run_id', { mode: 'number' }),
    runAttempt: integer('run_attempt'),
    repositoryId: bigint('repository_id', { mode: 'number' }),
    commitSha: text('commit_sha'),
    prTitle: text('pr_title'),
    reason: text('reason'),
    verdict: text('verdict', { enum: ['blocked', 'passed'] }),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    durationMs: integer('duration_ms'),
  },
  (t) => ({
    agentRunUq: uniqueIndex('ci_runs_agent_run_uq').on(t.agentRunId),
    installationRunUq: uniqueIndex('ci_runs_installation_github_run_uq').on(
      t.ciInstallationId,
      t.githubRunId,
    ),
  }),
);
