import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /**
   * Write one immutable config snapshot.
   *
   * `db` and `skills` are injectable so a caller inside a TRANSACTION can pass
   * the transaction handle and the ids it just wrote: `skillIdsForAgent` reads
   * through `this.db`, a different connection, and would therefore snapshot the
   * PRE-transaction link list — recording a version whose `skills` array is the
   * one it replaced.
   */
  private async snapshotVersion(
    row: AgentRow,
    version: number,
    opts: { db?: Pick<Db, 'insert'>; skills?: string[] } = {},
  ): Promise<void> {
    const skills = opts.skills ?? (await this.skillIdsForAgent(row.id));
    await (opts.db ?? this.db)
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order }));
  }

  /**
   * Of `skillIds`, the ones that exist IN THIS WORKSPACE.
   *
   * The link table's foreign key only proves a skill exists somewhere, so
   * without this an agent could be linked to another tenant's skill and that
   * skill's BODY would be assembled into this workspace's review prompt — and
   * then read back out of the run trace. `agent_skills` has no `workspace_id`
   * of its own, so the check has to happen before the link is written.
   */
  async skillIdsInWorkspace(workspaceId: string, skillIds: string[]): Promise<Set<string>> {
    if (skillIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return new Set(rows.map((r) => r.id));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /**
   * Apply a change to an agent's links AND record it as a config change.
   *
   * Linking, unlinking or REORDERING skills changes the agent's assembled
   * prompt just as editing its system prompt does, so it has to move
   * `agents.version` and write an `agent_versions` row — otherwise two runs can
   * share a version number and a config snapshot while having been given
   * different skill blocks, which is exactly the reproducibility
   * `agent_versions` exists to provide.
   *
   * The whole thing is one transaction: the links, the bump and the snapshot
   * describe one state, and a crash between them leaves a version number whose
   * recorded config never existed. The version is incremented in SQL and read
   * back rather than computed from `agent.version`, so a concurrent config edit
   * cannot make two writers agree on the same next number.
   */
  private async applySkillChange(
    agent: AgentRow,
    mutate: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<void>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await mutate(tx);
      // Read the resulting order INSIDE the transaction — see snapshotVersion.
      const rows = await tx
        .select({ skillId: t.agentSkills.skillId })
        .from(t.agentSkills)
        .where(eq(t.agentSkills.agentId, agent.id))
        .orderBy(asc(t.agentSkills.order));
      const [row] = await tx
        .update(t.agents)
        .set({ version: sql`${t.agents.version} + 1` })
        .where(eq(t.agents.id, agent.id))
        .returning();
      if (row) {
        await this.snapshotVersion(row, row.version, {
          db: tx,
          skills: rows.map((r) => r.skillId),
        });
      }
    });
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agent: AgentRow, skillId: string, order: number): Promise<void> {
    await this.applySkillChange(agent, async (tx) => {
      await tx
        .insert(t.agentSkills)
        .values({ agentId: agent.id, skillId, order })
        .onConflictDoUpdate({
          target: [t.agentSkills.agentId, t.agentSkills.skillId],
          set: { order },
        });
    });
  }

  async unlinkSkill(agent: AgentRow, skillId: string): Promise<void> {
    await this.applySkillChange(agent, async (tx) => {
      await tx
        .delete(t.agentSkills)
        .where(and(eq(t.agentSkills.agentId, agent.id), eq(t.agentSkills.skillId, skillId)));
    });
  }

  /**
   * Replace the full set of linked skills for an agent with `skillIds`, assigning
   * order = index. Used by the "Skills" editor tab (attach/detach/reorder). Skills
   * not in the list are unlinked.
   *
   * A save that changes nothing writes nothing: the editor posts the WHOLE list
   * on every interaction, so without this check a dropped-where-it-started drag
   * would burn an agent version on a no-op.
   */
  async setSkills(agent: AgentRow, skillIds: string[]): Promise<void> {
    const current = await this.skillIdsForAgent(agent.id);
    const unchanged =
      current.length === skillIds.length && current.every((id, i) => id === skillIds[i]);
    if (unchanged) return;

    // Delete-then-insert, so it has to be atomic: a failed insert (a bad
    // skill_id violating the FK is reachable from the editor) would otherwise
    // leave the agent with NO skills at all — silent data loss on save.
    await this.applySkillChange(agent, async (tx) => {
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agent.id));
      if (skillIds.length === 0) return;
      await tx
        .insert(t.agentSkills)
        .values(skillIds.map((skillId, i) => ({ agentId: agent.id, skillId, order: i })));
    });
  }
}
