import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** A pull request joined to its repo, scoped to a workspace. */
export interface BlastPullRow {
  prId: string;
  number: number;
  repoId: string;
  openedAt: Date | null;
  owner: string;
  name: string;
}

/**
 * Blast data-access. Every read is workspace-scoped, either directly
 * (`getPullWithRepo` filters BOTH `pull_requests.workspace_id` and
 * `repos.workspace_id`) or by construction (`getPrFilePaths` takes a PR id
 * already resolved through `getPullWithRepo`).
 */
export class BlastRepository {
  constructor(private db: Db) {}

  async getPullWithRepo(workspaceId: string, prId: string): Promise<BlastPullRow | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        number: t.pullRequests.number,
        repoId: t.pullRequests.repoId,
        openedAt: t.pullRequests.openedAt,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.repos.workspaceId, workspaceId),
          eq(t.pullRequests.id, prId),
        ),
      );
    return row;
  }

  /** A PR's changed file paths, in a stable order (`pr_files` has no position column). */
  async getPrFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(t.prFiles.path);
    return rows.map((r) => r.path);
  }
}
