import { and, asc, eq } from 'drizzle-orm';
import { Intent, PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { StoredFile } from './types.js';

/** The PR joined to its repo — everything the brief reads from the PR row itself. */
export interface BriefPullRef {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  filesCount: number;
  owner: string;
  name: string;
  clonePath: string | null;
}

/**
 * `pr_brief` data-access (SPEC-03). Owns the `pr_brief` table and READS `pull_requests`,
 * `repos`, `pr_files` and `pr_intent`. The attached spec documents come from
 * `ProjectContextRepository.enabledAgentDocs`, injected by `routes.ts`.
 *
 * `pr_brief` has no `workspace_id`: tenancy is transitive through `pull_requests`
 * (DR-30). So every other method is called only AFTER `pullInWorkspace` returned a row for
 * the caller's workspace — a brief carries source-derived content, and a read by bare
 * `pr_id` would leak another tenant's code facts. Row types never leave this module.
 *
 * `pr_files` is written only by `GET /pulls/:id` (server INSIGHTS 2026-09-23); this class
 * never writes it.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /** The PR with its repo, scoped by workspace. `undefined` is how the route learns to 404 (AC-93). */
  async pullInWorkspace(workspaceId: string, prId: string): Promise<BriefPullRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        filesCount: t.pullRequests.filesCount,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
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

  /** The PR's stored files, path order (`pr_files` has no position column). */
  async files(prId: string): Promise<StoredFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
  }

  /** The stored intent, or `null` — the brief never derives one (AC-52). */
  async intent(prId: string): Promise<Intent | null> {
    const [row] = await this.db
      .select({
        intent: t.prIntent.intent,
        inScope: t.prIntent.inScope,
        outOfScope: t.prIntent.outOfScope,
      })
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    if (!row) return null;
    return { intent: row.intent, in_scope: row.inScope ?? [], out_of_scope: row.outOfScope ?? [] };
  }

  /** The stored brief; a document that no longer parses reads as "no brief". */
  async getBrief(prId: string): Promise<PrBrief | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  /** Replace the PR's brief — one row per PR (AC-83). */
  async saveBrief(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
