import type { Skill, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { DEFAULT_STATS_WINDOW_DAYS } from './constants.js';
import { skillStatsFrom } from './stats.js';
import { decodeBase64, parseSkillUpload, type SkillImportPreview } from './import-parse.js';

/**
 * Skills service. Business logic for the Skills page + Skill Editor.
 *
 * A Skill = name + description + type + a markdown BODY. The body is the only
 * thing that reaches a model; everything else is metadata for the picker. Body
 * changes are versioned via `skill_versions` (repository).
 *
 * The repository is injected rather than pulled out of the DI container, so the
 * service states its one real dependency in its own signature and a unit test
 * can drive it with a stub instead of a live Postgres. (`arch:check`'s
 * `service-not-to-composition-root` rule says the same thing.)
 */

// Re-exported for consumers that only need the mapping.
export { toSkillDto } from './helpers.js';
export type { SkillImportPreview } from './import-parse.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  constructor(private repo: SkillsRepository) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history for a skill, newest version first.
   *
   * The `getById` call is the tenancy guard, not a convenience: `skill_versions`
   * has NO `workspace_id` of its own — its only FK is `skill_id` — so ownership
   * is inherited transitively and has to be proven here. Handing an id straight
   * to `repo.listVersions` would serve another workspace's skill bodies to
   * anyone who can guess a uuid. `undefined` (route → 404) rather than an empty
   * list, so a foreign skill is indistinguishable from a missing one.
   */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Restore an older body by writing it FORWARD as a new version.
   *
   * History is never rewound: restoring v2 onto a skill at v5 produces v6 whose
   * body is v2's text. A run that recorded "carried this skill at v3" must stay
   * explainable, and it cannot be if v3 can be overwritten or the counter can
   * move backwards. It also means restore needs no special path — it is an
   * ordinary body update, so the lost-update guard and the snapshot in
   * `repo.update` cover it for free.
   *
   * Restoring the CURRENT body is a no-op by the same route: `isBodyChange` sees
   * no change, so no version is burned on a click that changed nothing.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) return undefined;
    const row = await this.repo.update(workspaceId, id, { body: snapshot.body });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Usage statistics for one skill over the last `windowDays`.
   *
   * Three scoped reads and one pure rollup, rather than one clever join: each
   * read carries its own tenancy guard (see the repository), and the counting
   * rules live in `stats.ts` where they can be unit-tested without a database.
   *
   * `now` is injected so the window is deterministic in tests — a stats rollup
   * that reads the clock internally can only be tested by waiting.
   */
  async stats(
    workspaceId: string,
    id: string,
    windowDays: number = DEFAULT_STATS_WINDOW_DAYS,
    now: Date = new Date(),
  ): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;

    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const [usedBy, runs] = await Promise.all([
      this.repo.agentsUsing(workspaceId, id),
      this.repo.runsCarrying(workspaceId, id, since),
    ]);
    const findings = await this.repo.findingsForRuns(
      workspaceId,
      runs.map((r) => r.runId),
    );
    return skillStatsFrom(windowDays, usedBy, runs, findings);
  }

  /**
   * Parse an uploaded skill and return what it WOULD become. Nothing is
   * persisted: the client shows this to the user and only then POSTs /skills.
   * Keeping preview and save as two calls is the whole point — you see a
   * stranger's instructions before they can enter an agent's prompt.
   */
  importPreview(filename: string, contentBase64: string): SkillImportPreview {
    return parseSkillUpload(filename, decodeBase64(contentBase64));
  }
}
