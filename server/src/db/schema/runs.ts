import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { skills } from './skills';

// ============================================================ Observability

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  durationMs: integer('duration_ms'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  /** Generation cost in USD for this run; null when the provider/price book
   *  couldn't price it (or on failed/cancelled runs) — UI shows "—", not "$0". */
  costUsd: doublePrecision('cost_usd'),
  status: text('status'),
  /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
  error: text('error'),
  source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
  findingsCount: integer('findings_count'),
  grounding: text('grounding'),
  /** Review score (0-100) for this run; null on failed/cancelled runs. */
  score: integer('score'),
  /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
  blockers: integer('blockers'),
},
  (t) => ({
    // activeRunsForPull / listRunsForPull / costByPr all filter
    // (workspace_id, pr_id) and order by ran_at desc.
    byPr: index('agent_runs_ws_pr_ran_idx').on(t.workspaceId, t.prId, t.ranAt.desc()),
  }),
);

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

/**
 * Which skills a run's prompt actually carried.
 *
 * The queryable index over a fact the trace already holds as prose: without it
 * the only record of "this run used that skill" is the `skills` STRING inside
 * the `run_traces` jsonb document, and per-skill statistics would mean scanning
 * every trace. `agent_skills` cannot answer it either — that table says what is
 * linked RIGHT NOW, so reading it for history silently re-labels past runs
 * every time someone edits the picker.
 *
 * Only skills that REACHED the model are recorded, so every query over this
 * table is honest without remembering a filter; a linked-but-disabled skill is
 * still visible in the run's trace document. `skill_version` is the version at
 * assembly time, which is what makes an old run explainable after an edit.
 *
 * Attribution caveat, for anything built on this: a run carries several skills
 * at once, so a finding can only be attributed to ALL of them together. This
 * table supports "runs/findings that carried skill X", never "findings caused
 * by skill X".
 */
export const runSkills = pgTable(
  'run_skills',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    /** The skill's `version` when this run assembled it, not its current one. */
    skillVersion: integer('skill_version').notNull(),
    /** 0-based position in the agent's link list — the prompt-block order. */
    order: integer('order').notNull(),
    /** Tokens this skill's rendered block contributed to the prompt. */
    tokens: integer('tokens'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.skillId] }),
    // The stats page reads by skill, never by run — the run side is served by
    // the primary key.
    bySkill: index('run_skills_skill_idx').on(t.skillId),
  }),
);

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
});
