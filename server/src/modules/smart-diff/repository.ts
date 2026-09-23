import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

/**
 * Smart Diff data-access. Every read is workspace-scoped, either directly
 * (`getPull`) or transitively through a workspace-scoped review id
 * (`latestReviewFindings` — `findings` carries no `workspace_id` of its own,
 * same rule as `reviews/repository/review.repo.ts`).
 */
export class SmartDiffRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /**
   * A PR's files, in a stable order. `pr_files` has no position column, so an
   * unordered read is "whatever the heap says" — order by path instead.
   */
  async getPrFiles(
    prId: string,
  ): Promise<{ path: string; additions: number; deletions: number }[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(t.prFiles.path);
  }

  /**
   * Findings from the newest `kind: 'review'` review for this PR, or `[]` if
   * none exists yet ("review not run"). The review lookup is workspace- and
   * PR-scoped; findings are then reached only through that already-scoped
   * review id.
   */
  async latestReviewFindings(
    workspaceId: string,
    prId: string,
  ): Promise<{ file: string; startLine: number }[]> {
    const [review] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.reviews.prId, prId),
          eq(t.reviews.kind, 'review'),
        ),
      )
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!review) return [];

    const rows = await this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .where(eq(t.findings.reviewId, review.id));
    return rows;
  }
}
