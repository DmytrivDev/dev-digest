import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

export type { ConventionRow };

/** Just enough of the repo row to read its clone and build an evidence URL. */
export interface ConventionRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  evidenceSha: string | null;
  confidence: number;
  fingerprint: string;
}

/** Only what a fresh scan may overwrite on an untriaged row — never the wording. */
export interface RefreshConvention {
  id: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  evidenceSha: string | null;
  confidence: number;
}

/** A triage decision, a hand edit, or both. Absent keys are left alone. */
export interface UpdateConvention {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

/**
 * Conventions data-access. Owns the `conventions` table.
 *
 * Every read and write carries `workspace_id` even when `repo_id` already
 * implies it — a candidate row quotes source code, so this is a table where one
 * missing scope leaks another tenant's code, not just a count.
 */
export class ConventionsRepository {
  constructor(private db: Db) {}

  /** The repo, scoped by workspace. `undefined` is how the route learns to 404. */
  async getRepo(workspaceId: string, repoId: string): Promise<ConventionRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async listByRepo(
    workspaceId: string,
    repoId: string,
    status?: ConventionStatus,
  ): Promise<ConventionRow[]> {
    const scope = and(
      eq(t.conventions.workspaceId, workspaceId),
      eq(t.conventions.repoId, repoId),
    );
    return this.db
      .select()
      .from(t.conventions)
      .where(status ? and(scope, eq(t.conventions.status, status)) : scope)
      .orderBy(desc(t.conventions.createdAt), desc(t.conventions.confidence));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /**
   * Triage and/or hand-edit one candidate.
   *
   * `fingerprint` is deliberately NOT recomputed when `rule` changes — see
   * `ConventionsService.update` for why. Callers pass only the keys they mean to
   * change; an empty patch is rejected at the route, because `.set({})` is a
   * Postgres syntax error.
   */
  async updateById(
    workspaceId: string,
    id: string,
    values: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(values)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /**
   * Delete ONE candidate outright, whatever its triage state.
   *
   * Rejecting and deleting are different intents and both are needed: a
   * rejected row is a decision the next scan must respect, while a deleted one
   * is a row you never want to see again — and because identity is the rule's
   * fingerprint, a later scan proposing the same rule brings it back as a fresh
   * `pending` candidate. Say that in the UI; it is not a bug.
   */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }

  /**
   * Drop the untriaged rows a fresh scan did not re-propose.
   *
   * Scoped to `status = 'pending'` in SQL, not in the caller: this is the single
   * statement that could destroy a triage decision, and the guard belongs where
   * the delete is. An empty `keep` list means the scan proposed nothing, so every
   * pending row is stale.
   */
  async deletePendingExcept(
    workspaceId: string,
    repoId: string,
    keepFingerprints: string[],
  ): Promise<number> {
    const scope = and(
      eq(t.conventions.workspaceId, workspaceId),
      eq(t.conventions.repoId, repoId),
      eq(t.conventions.status, 'pending'),
    );
    const deleted = await this.db
      .delete(t.conventions)
      .where(
        keepFingerprints.length === 0
          ? scope
          : and(scope, notInArray(t.conventions.fingerprint, keepFingerprints)),
      )
      .returning({ id: t.conventions.id });
    return deleted.length;
  }

  /**
   * Re-point an untriaged row at the fresh scan's evidence. Never touches a
   * triaged one — and never touches `rule` or `category` either.
   *
   * That second exclusion is what makes hand-editing safe: the user can reword a
   * PENDING candidate, and a later scan re-proposing it (same fingerprint, so
   * same rule modulo normalization) refreshes where the evidence points without
   * silently reverting the wording. Only the facts that belong to the CODE —
   * path, line, snippet, sha, and the model's confidence in it — are refreshed.
   */
  async refreshPending(workspaceId: string, values: RefreshConvention): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({
        evidencePath: values.evidencePath,
        evidenceLine: values.evidenceLine,
        evidenceSnippet: values.evidenceSnippet,
        evidenceSha: values.evidenceSha,
        confidence: values.confidence,
      })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.id, values.id),
          eq(t.conventions.status, 'pending'),
        ),
      );
  }

  async insertMany(values: InsertConvention[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return this.db.insert(t.conventions).values(values).returning();
  }

  async listByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }
}
