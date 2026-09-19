import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * Convention candidates proposed by the extractor (L02) and triaged by a human.
 *
 * `status` — not a boolean — because REJECTED and NEVER-TRIAGED must stay
 * distinguishable: a rejected rule may never come back on a re-scan, while an
 * untouched one is replaced by the fresh proposal.
 *
 * `fingerprint` is the sha256 of the NORMALIZED rule text and nothing else. It
 * is what makes "the same candidate" recognisable across scans, and evidence is
 * deliberately excluded from it — a model re-proposing the same rule rarely
 * cites the same file twice, so keying on evidence would resurrect every
 * rejected rule.
 *
 * `evidenceSha` is the repo HEAD at scan time, so the evidence link is a
 * permalink rather than a branch URL whose line numbers drift.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category', {
      enum: [
        'naming',
        'structure',
        'typing',
        'validation',
        'error_handling',
        'testing',
        'imports',
        'formatting',
        'other',
      ],
    })
      .notNull()
      .default('other'),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    evidenceSha: text('evidence_sha'),
    confidence: doublePrecision('confidence'),
    fingerprint: text('fingerprint').notNull().default(''),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
  },
  (t) => ({
    wsIdx: index('conventions_ws_idx').on(t.workspaceId),
    repoFingerprintUq: uniqueIndex('conventions_repo_fingerprint_uq').on(t.repoId, t.fingerprint),
  }),
);
