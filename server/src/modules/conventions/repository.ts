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

export interface RefreshConvention {
  id: string;
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  evidenceSha: string | null;
  confidence: number;
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

  async setStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
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

  /** Re-point an untriaged row at the fresh scan's evidence. Never touches a triaged one. */
  async refreshPending(workspaceId: string, values: RefreshConvention): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({
        category: values.category,
        rule: values.rule,
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
