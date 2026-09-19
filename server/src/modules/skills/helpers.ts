import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * body-version-bump rule. No I/O.
 */

/**
 * Map a persisted skill row to the public `Skill` DTO.
 *
 * `agentCount` is optional on purpose: only the list knows it (one grouped
 * query for the page), so a single-skill read omits the field entirely rather
 * than serializing a 0 it never counted. See the contract for why absent and
 * zero must stay distinguishable.
 */
export function toSkillDto(row: SkillRow, agentCount?: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    ...(agentCount !== undefined ? { agent_count: agentCount } : {}),
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields a patch may carry; only `body` is version-affecting. */
export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/**
 * True when a patch changes the BODY relative to the existing row.
 *
 * Only the body is versioned, because only the body reaches the model — the
 * name, description and type are metadata for humans and for the picker. This
 * mirrors `agents/helpers.ts:isConfigChange`, which likewise excludes the
 * fields that cannot change a run's outcome.
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: SkillPatch): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
