import { and, desc, eq } from 'drizzle-orm';
import type { IntentConfidence, IntentSource, PrIntentRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrIntentRow, PullRow } from '../../db/rows.js';
import { toIntentDto, type PrIntentRowLike } from './helpers.js';

export type { PrIntentRow, PullRow };

/** Just enough of the repo row to build a RepoRef and read its clone. */
export interface IntentRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

/** What a derivation writes. `derivedAt` is set here (not defaulted) so a
 *  re-derivation refreshes it, matching an insert's `defaultNow()`. */
export interface UpsertIntentValues {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  model: string | null;
  sourceKey: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

function rowToLike(row: PrIntentRow): PrIntentRowLike {
  return {
    prId: row.prId,
    intent: row.intent,
    inScope: row.inScope ?? [],
    outOfScope: row.outOfScope ?? [],
    confidence: row.confidence as IntentConfidence,
    sources: (row.sources ?? []) as IntentSource[],
    model: row.model,
    derivedAt: row.derivedAt,
    costUsd: row.costUsd,
  };
}

/**
 * `pr_intent` data-access — the SOLE owner of the table (§R8: the two dead
 * wrappers on `ReviewRepository` are removed in the same change that adds
 * this). A Drizzle row type never leaves this module (ban 3) — every read
 * returns the wire DTO, mapped via `toIntentDto`.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  /** The PR, scoped by workspace. `undefined` is how the route learns to 404. */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(repoId: string): Promise<IntentRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  /** Newest-first commit messages, capped by the caller (`MAX_COMMITS`). */
  async getCommitMessages(prId: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(desc(t.prCommits.committedAt))
      .limit(limit);
    return rows.map((r) => r.message);
  }

  /** Changed file paths, capped by the caller (`MAX_PATHS`). */
  async getChangedPaths(prId: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .limit(limit);
    return rows.map((r) => r.path);
  }

  async get(prId: string): Promise<PrIntentRecord | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? toIntentDto(rowToLike(row)) : undefined;
  }

  /**
   * The stored cache key alone (§2.3), without building the full DTO — the
   * cheap read `derive()` uses to decide whether to reuse the stored row.
   * `undefined` when no row exists yet (never matches a computed key, same
   * effect as the seeded row's `source_key: ''`).
   */
  async getSourceKey(prId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ sourceKey: t.prIntent.sourceKey })
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    return row?.sourceKey;
  }

  async upsert(prId: string, values: UpsertIntentValues): Promise<PrIntentRecord> {
    const derivedAt = new Date();
    const [row] = await this.db
      .insert(t.prIntent)
      .values({
        prId,
        intent: values.intent,
        inScope: values.inScope,
        outOfScope: values.outOfScope,
        confidence: values.confidence,
        sources: values.sources,
        model: values.model,
        sourceKey: values.sourceKey,
        derivedAt,
        tokensIn: values.tokensIn,
        tokensOut: values.tokensOut,
        costUsd: values.costUsd,
      })
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: values.intent,
          inScope: values.inScope,
          outOfScope: values.outOfScope,
          confidence: values.confidence,
          sources: values.sources,
          model: values.model,
          sourceKey: values.sourceKey,
          derivedAt,
          tokensIn: values.tokensIn,
          tokensOut: values.tokensOut,
          costUsd: values.costUsd,
        },
      })
      .returning();
    return toIntentDto(rowToLike(row!));
  }
}
