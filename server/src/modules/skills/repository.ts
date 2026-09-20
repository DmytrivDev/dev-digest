import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange, type SkillPatch } from './helpers.js';
import type { SkillFindingRow, SkillRunRow } from './stats.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`. Workspace-scoped
 * throughout — the `agent_skills` link table belongs to the agents repository
 * (A2 owns the agent side: link/reorder/list for one agent).
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

/**
 * Write one immutable body snapshot. Takes the transaction handle so it can
 * never be called outside the transaction that wrote the row it describes.
 */
async function snapshotVersion(
  tx: Pick<Db, 'insert'>,
  row: SkillRow,
  version: number,
): Promise<void> {
  await tx
    .insert(t.skillVersions)
    .values({ skillId: row.id, version, body: row.body })
    .onConflictDoNothing();
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      // position first (ASC puts NULLs last in Postgres), so a dragged order
      // wins and anything never dragged still has a stable place by name.
      .orderBy(asc(t.skills.position), asc(t.skills.name));
  }

  /**
   * How many agents carry each skill in this workspace, as skillId -> count.
   *
   * ONE grouped query for the whole list, not one per card: the list renders
   * every skill, so a per-skill count would be N round trips to answer a
   * question the page asks N times at once. Skills with no link are simply
   * absent from the map — the caller decides whether that reads as 0 or as
   * "unknown", which is not a repository's call to make.
   *
   * `agent_skills` is written by the AGENTS repository (that module owns
   * linking and ordering). This is a read-only aggregate over the same table,
   * scoped through `skills` rather than `agents` because the workspace the
   * caller asked about is the skill's.
   */
  async countAgentsBySkill(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        count: sql<number>`count(*)::int`,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.count]));
  }

  /**
   * Write a manual order for the whole workspace in one transaction.
   *
   * Takes the COMPLETE ordered id list rather than a moved id and a target,
   * mirroring `POST /agents/:id/skills`: a partial reorder leaves rows sharing
   * a position, and "what order is this list in" stops having one answer. Ids
   * from another workspace match nothing, so a hostile list reorders nothing
   * rather than failing halfway.
   */
  async reorder(workspaceId: string, ids: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(t.skills)
          .set({ position: index })
          .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
      }
    });
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). Versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * Insert a skill AND record v1 of its body (immutable snapshot).
   *
   * Atomic: the row and its v1 snapshot must appear together, or a crash
   * between the two statements leaves a skill whose "immutable history" has no
   * v1 in it — the same silent-drift failure `setSkills` is wrapped against in
   * the agents repository.
   */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
          evidenceFiles: values.evidenceFiles ?? null,
        })
        .returning();
      await snapshotVersion(tx, row!, INITIAL_SKILL_VERSION);
      return row!;
    });
  }

  /**
   * Update a skill. A BODY change bumps the version and snapshots the new body
   * into `skill_versions` — metadata-only edits (name/description/type/enabled)
   * do not, because they never reach the model.
   *
   * Atomic AND guarded against a lost update: the WHERE clause pins
   * `version = existing.version`, so two concurrent body edits cannot both
   * write v+1. Without it, both readers see v1, both write v2, the last write
   * wins on `body`, and `skill_versions` v2 — inserted with
   * `onConflictDoNothing` — permanently records the OTHER writer's text. That
   * is an audit trail that disagrees with the row it claims to describe, with
   * no error raised anywhere. The loser gets `undefined` (a 404 at the route)
   * and retries against fresh data.
   */
  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // An empty patch is schema-valid (every field on UpdateSkillBody is
    // optional), and Drizzle turns `.set({})` into `update skills set  where …`
    // — a Postgres syntax error that surfaces as a 500 on a request the route
    // declares legal. Nothing to write means nothing to write: return the row
    // unchanged. Guarded here rather than at the route so any future caller is
    // covered too.
    const values = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    };
    if (Object.keys(values).length === 0) return existing;

    const bodyChanged = isBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({ ...values, ...(bodyChanged ? { version: nextVersion } : {}) })
        .where(
          and(
            eq(t.skills.workspaceId, workspaceId),
            eq(t.skills.id, id),
            eq(t.skills.version, existing.version),
          ),
        )
        .returning();

      if (bodyChanged && row) await snapshotVersion(tx, row, nextVersion);
      return row;
    });
  }

  /**
   * ONE body snapshot. Takes the skill id the CALLER already scoped by
   * workspace — `skill_versions` carries no `workspace_id`, so this method
   * cannot enforce tenancy and must never be reached from a route directly.
   */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Agents currently carrying this skill, workspace-scoped.
   *
   * `agent_skills` has no `workspace_id` — the join onto `agents` is what
   * provides it, so this cannot be simplified to a lookup by skill id alone.
   */
  async agentsUsing(workspaceId: string, skillId: string) {
    const rows = await this.db
      .select({
        agent_id: t.agents.id,
        agent_name: t.agents.name,
        agent_enabled: t.agents.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agents.name));
    return rows;
  }

  /**
   * Runs in the window whose prompt carried this skill.
   *
   * `run_skills` carries no `workspace_id` either; the join onto `agent_runs`
   * is the tenancy guard, exactly as `agents` is for the link table above.
   */
  async runsCarrying(workspaceId: string, skillId: string, since: Date): Promise<SkillRunRow[]> {
    return this.db
      .select({
        runId: t.runSkills.runId,
        skillVersion: t.runSkills.skillVersion,
        tokens: t.runSkills.tokens,
        ranAt: t.agentRuns.ranAt,
      })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .where(
        and(
          eq(t.runSkills.skillId, skillId),
          eq(t.agentRuns.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, since),
        ),
      );
  }

  /**
   * Findings produced by the given runs.
   *
   * `findings` has NO workspace_id — its only FK is `review_id` — so tenancy is
   * inherited transitively and the `reviews.workspace_id` predicate below is
   * load-bearing, even though `runIds` already came from a scoped read. Two
   * guards, because this is the table where one missing scope leaks review
   * content across tenants.
   */
  async findingsForRuns(workspaceId: string, runIds: string[]): Promise<SkillFindingRow[]> {
    if (runIds.length === 0) return [];
    return this.db
      .select({
        severity: t.findings.severity,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, runIds)));
  }

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }
}
