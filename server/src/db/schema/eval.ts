import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

/**
 * An eval case: a frozen single-file diff plus one expectation, owned by an agent.
 * `expected_output` holds the expectation `{kind, file, start_line, end_line}`.
 * `source_finding_id` is SET NULL when the finding goes away, so the case stays
 * runnable (it carries its own diff, meta and labels).
 *
 * `origin` says which kind a row is. A `manual` case is written by hand: it has no source
 * finding, PR number, repo or labels, so those columns are nullable (a `finding` case always
 * carries all three; the CHECK ties `source_pr_number` to `origin`).
 */
export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  sourceFindingId: uuid('source_finding_id').references(() => findings.id, { onDelete: 'set null' }),
  origin: text('origin', { enum: ['finding', 'manual'] }).notNull().default('finding'),
  sourcePrNumber: integer('source_pr_number'),
  sourceRepo: text('source_repo'),
  labels: jsonb('labels'),
  createdAt: now(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
},
  (t) => ({
    // Postgres does not index FK columns automatically; every case read filters by agent.
    byAgent: index('eval_cases_agent_idx').on(t.agentId),
    // One case per (agent, source finding): the idempotency key of "turn into eval case".
    // NULL source_finding_id rows never collide (NULLs are distinct).
    agentFinding: uniqueIndex('eval_cases_agent_finding_uq').on(t.agentId, t.sourceFindingId),
    // Only a manual case may lack a source PR; a finding-born case always has one.
    originSource: check('eval_cases_origin_source_ck', sql`(${t.origin} = 'manual') = (${t.sourcePrNumber} IS NULL)`),
  }),
);

/** One execution of an agent's whole case suite, or of exactly one case (`scope`). */
export const evalSuiteRuns = pgTable('eval_suite_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  agentVersion: integer('agent_version').notNull(),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
  errorReason: text('error_reason', { enum: ['all_cases_errored', 'interrupted'] }),
  /** EvalRunConfig recorded at start (prompt, model, provider, strategy, skills). */
  config: jsonb('config').notNull(),
  /** Ids of the cases that were in the suite at start. */
  caseIds: jsonb('case_ids').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  casesTotal: integer('cases_total').notNull(),
  casesDone: integer('cases_done').notNull().default(0),
  casesPassed: integer('cases_passed').notNull().default(0),
  casesScored: integer('cases_scored').notNull().default(0),
  casesErrored: integer('cases_errored').notNull().default(0),
  recall: doublePrecision('recall'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  costUsd: doublePrecision('cost_usd'),
  durationMs: integer('duration_ms'),
  /** `suite` = the agent's whole suite; `case` = exactly one case (SPEC-07). */
  scope: text('scope', { enum: ['suite', 'case'] }).notNull().default('suite'),
  /**
   * The run's one case when scope = 'case'. Deliberately NO foreign key: deleting the
   * case must keep the run and its outcome (like `eval_case_outcomes.case_id`).
   */
  caseId: uuid('case_id'),
},
  (t) => ({
    byAgentStarted: index('eval_suite_runs_agent_started_idx').on(t.agentId, t.startedAt.desc()),
    // At most one running run per agent (409 run_in_progress is this index firing).
    oneRunning: uniqueIndex('eval_suite_runs_one_running_uq')
      .on(t.agentId)
      .where(sql`status = 'running'`),
    // A case run names its case; a suite run names none.
    scopeCase: check('eval_suite_runs_scope_case_ck', sql`(${t.scope} = 'case') = (${t.caseId} IS NOT NULL)`),
  }),
);

/**
 * The stored result of one case in one suite run. `case_id` deliberately has NO
 * foreign key: editing or deleting a case must leave past outcomes untouched.
 */
export const evalCaseOutcomes = pgTable('eval_case_outcomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
  caseId: uuid('case_id').notNull(),
  caseName: text('case_name').notNull(),
  kind: text('kind', { enum: ['must_find', 'must_not_flag'] }).notNull(),
  /** Snapshot of the expectation at run time. */
  expectation: jsonb('expectation').notNull(),
  status: text('status', { enum: ['scored', 'errored'] }).notNull(),
  pass: boolean('pass'),
  errorReason: text('error_reason'),
  findingsMatched: integer('findings_matched').notNull().default(0),
  findingsTotal: integer('findings_total').notNull().default(0),
  groundingKept: integer('grounding_kept').notNull().default(0),
  groundingTotal: integer('grounding_total').notNull().default(0),
  durationMs: integer('duration_ms').notNull(),
  costUsd: doublePrecision('cost_usd'),
  actual: jsonb('actual').notNull().default([]),
  createdAt: now(),
},
  (t) => ({
    byRun: index('eval_case_outcomes_run_idx').on(t.runId),
    byCase: index('eval_case_outcomes_case_created_idx').on(t.caseId, t.createdAt.desc()),
    runCase: uniqueIndex('eval_case_outcomes_run_case_uq').on(t.runId, t.caseId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
