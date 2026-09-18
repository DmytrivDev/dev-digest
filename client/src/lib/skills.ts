/**
 * Skill domain helpers shared across the Skills route tree AND the agent
 * editor's Skills tab.
 *
 * They live here rather than inside `app/skills/_components/SkillCard/` because
 * they have consumers in two different route trees — the card, the list, the
 * preview drawer, both editor tabs, and `agents/[id]`'s SkillsTab. Reaching
 * into another component folder's private `helpers.ts` is exactly what the
 * second consumer is supposed to trigger a promotion for.
 */

import type { Skill, SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Skill type → accent colour, used for icon tiles and type chips. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Skill source → the icon shown next to its label. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported_url: "Link",
};

/**
 * Sources whose body was written outside this workspace. They get a
 * "needs vetting" marker while disabled, because enabling one puts a stranger's
 * instructions into an agent's prompt.
 */
export const UNTRUSTED_SOURCES: readonly SkillSource[] = ["imported_url", "community"];

/** Selectable skill types, in the order the create form and editor show them. */
export const TYPE_OPTIONS: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Type a new skill starts as. */
export const DEFAULT_TYPE: SkillType = "rubric";

/** Accent colour for a skill type (unknown → secondary token). */
export function typeColor(type: SkillType): string {
  return TYPE_COLOR[type] ?? "var(--text-secondary)";
}

/** Icon for a skill source (unknown → the generic file icon). */
export function sourceIcon(source: SkillSource): IconName {
  return SOURCE_ICON[source] ?? "File";
}

/**
 * Whether to warn that this skill's body came from outside the workspace.
 *
 * Only while it is DISABLED: once you enable an imported skill you have vetted
 * it, and a permanent warning badge is a warning nobody reads.
 */
export function needsVetting(skill: Pick<Skill, "source" | "enabled">): boolean {
  return !skill.enabled && UNTRUSTED_SOURCES.includes(skill.source);
}

/** Case-insensitive filter over a skill's name + description + type. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description} ${s.type}`.toLowerCase().includes(q));
}

/**
 * Rough token count for a skill body, shown next to the editor.
 *
 * The ~4-chars-per-token heuristic, deliberately labelled "~": the real number
 * comes from the tokenizer server-side and lands in the run trace. This is here
 * to answer "is this skill about to cost me a thousand tokens or ten thousand",
 * which does not need a BPE table in the browser bundle.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
