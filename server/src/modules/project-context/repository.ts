/**
 * Project Context data-access — the SOLE owner of `agent_context_docs` and
 * `skill_context_docs`. Those are LINK tables with no `workspace_id`: tenancy
 * is transitive, so every entry point resolves the owning repo / agent / skill
 * INSIDE the workspace first (`repoInWorkspace`, `agentInWorkspace`,
 * `skillInWorkspace`) and only then touches the link rows. A Drizzle row type
 * never leaves this module (ban 3) — methods return plain shapes.
 *
 * Nothing here writes `agents.version`, `skills.version` or a `*_versions`
 * row: attaching a document is not a configuration change (AC-68).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Just enough of the repo row to build a `RepoRef` and read its clone. */
export interface ContextRepoRef {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface ContextOwnerRef {
  id: string;
  name: string;
}

/** A skill linked to an agent, with its attached paths for ONE repo. */
export interface LinkedSkillDocs {
  id: string;
  name: string;
  enabled: boolean;
  paths: string[];
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  // ------------------------------------------------------------ owner resolution

  /** The repo, scoped by workspace. `undefined` is how the route learns to 404. */
  async repoInWorkspace(workspaceId: string, repoId: string): Promise<ContextRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async agentInWorkspace(
    workspaceId: string,
    agentId: string,
  ): Promise<ContextOwnerRef | undefined> {
    const [row] = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row;
  }

  async skillInWorkspace(
    workspaceId: string,
    skillId: string,
  ): Promise<ContextOwnerRef | undefined> {
    const [row] = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row;
  }

  // ------------------------------------------------------------ reads

  /** The agent's own attached paths for one repo, in attachment order. */
  async agentPaths(agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  /** The skill's attached paths for one repo, in attachment order. */
  async skillPaths(skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  /**
   * The agent's linked skills in link order (`agent_skills.order`), each with
   * its enabled flag and its paths for `repoId`. One query for the links, one
   * for the paths, grouped in JS. The caller has already resolved the agent
   * inside its workspace.
   */
  async linkedSkillPaths(agentId: string, repoId: string): Promise<LinkedSkillDocs[]> {
    const links = await this.db
      .select({ id: t.skills.id, name: t.skills.name, enabled: t.skills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    if (links.length === 0) return [];

    const docs = await this.db
      .select({ skillId: t.skillContextDocs.skillId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(
        and(
          inArray(
            t.skillContextDocs.skillId,
            links.map((l) => l.id),
          ),
          eq(t.skillContextDocs.repoId, repoId),
        ),
      )
      .orderBy(asc(t.skillContextDocs.position));

    const byskill = new Map<string, string[]>();
    for (const d of docs) {
      const list = byskill.get(d.skillId) ?? [];
      list.push(d.path);
      byskill.set(d.skillId, list);
    }
    return links.map((l) => ({ ...l, paths: byskill.get(l.id) ?? [] }));
  }

  /**
   * How many DISTINCT agents of the workspace use `path` of `repoId` (AC-14):
   * agents with a direct row, plus agents linked to an ENABLED skill with a
   * row. The agent's own `enabled` flag is deliberately ignored.
   */
  async usedByAgents(workspaceId: string, repoId: string, path: string): Promise<number> {
    const direct = await this.db
      .select({ id: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentContextDocs.repoId, repoId),
          eq(t.agentContextDocs.path, path),
        ),
      );
    const viaSkill = await this.db
      .select({ id: t.agentSkills.agentId })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skillContextDocs.skillId))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skillContextDocs.repoId, repoId),
          eq(t.skillContextDocs.path, path),
        ),
      );
    return new Set([...direct, ...viaSkill].map((r) => r.id)).size;
  }

  // ------------------------------------------------------------ writes

  /** Replace the agent's whole ordered set for one repo, in ONE transaction (AC-32). */
  async replaceAgentPaths(agentId: string, repoId: string, paths: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(paths.map((path, position) => ({ agentId, repoId, path, position })));
    });
  }

  /** Replace the skill's whole ordered set for one repo, in ONE transaction (AC-32). */
  async replaceSkillPaths(skillId: string, repoId: string, paths: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, position) => ({ skillId, repoId, path, position })));
    });
  }
}
