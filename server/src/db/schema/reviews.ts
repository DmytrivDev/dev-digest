import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
},
  (t) => ({
    // Postgres does not index FK columns automatically. Every read of a PR's
    // reviews filters on pr_id and orders by created_at desc — without this the
    // PR list and PR detail both sequential-scan the whole table.
    byPr: index('reviews_pr_created_idx').on(t.prId, t.createdAt.desc()),
    // `SkillsRepository.findingsForRuns` resolves run_id -> review rows before
    // joining findings, so /skills/:id/stats scans this table without it.
    byRun: index('reviews_run_idx').on(t.runId),
  }),
);

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
},
  (t) => ({
    // review_id is the ONLY way findings are ever queried (tenancy is inherited
    // transitively through reviews.workspace_id), so it carries every read.
    byReview: index('findings_review_idx').on(t.reviewId),
  }),
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // ---- intent-layer additions (see docs/plans/intent-layer.plan.md §3) ----
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] }).notNull().default('low'),
  sources: jsonb('sources').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  model: text('model'),
  sourceKey: text('source_key').notNull().default(''),
  derivedAt: timestamp('derived_at', { withTimezone: true }).notNull().defaultNow(),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costUsd: doublePrecision('cost_usd'),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
