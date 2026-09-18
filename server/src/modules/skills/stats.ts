import type { SkillAgentUsage, SkillStats } from '@devdigest/shared';

/**
 * Pure rollups for a skill's usage statistics. No DB, no clock, no `this`.
 *
 * Split out of the repository for the same reason `pulls/cost.ts` was: the rule
 * — what counts as a run, what an untriaged finding means, how the accept rate
 * is defined — gets unit coverage with no Docker, while the repository keeps
 * only the SQL. A rule that needs Postgres to test is in the wrong place.
 *
 * ATTRIBUTION, stated once so it is not quietly forgotten downstream: a run
 * carries several skills at once. Everything here means "runs that included
 * this skill", never "findings this skill caused". That distinction is the
 * whole reason the UI must not present these as per-skill scores.
 */

/** One indexed usage of the skill by a run, as `run_skills ⋈ agent_runs` gives it. */
export interface SkillRunRow {
  runId: string;
  skillVersion: number;
  tokens: number | null;
  ranAt: Date;
}

/** One finding produced by a run that carried the skill. */
export interface SkillFindingRow {
  severity: string;
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/** Count occurrences of a string field, skipping empty values. */
function tally(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

export function skillStatsFrom(
  windowDays: number,
  usedBy: readonly SkillAgentUsage[],
  runs: readonly SkillRunRow[],
  findings: readonly SkillFindingRow[],
): SkillStats {
  const accepted = findings.filter((f) => f.acceptedAt !== null).length;
  const dismissed = findings.filter((f) => f.dismissedAt !== null).length;
  const triaged = accepted + dismissed;

  // Tokens are summed only over runs that actually reported one. A run that
  // never priced its blocks contributes nothing rather than a zero, and a skill
  // whose every run is unpriced reports null — "unknown", not "free".
  const priced = runs.filter((r) => r.tokens !== null);
  const newest = runs.reduce<SkillRunRow | undefined>(
    (best, r) => (best === undefined || r.ranAt > best.ranAt ? r : best),
    undefined,
  );

  return {
    window_days: windowDays,
    used_by: [...usedBy],
    runs: runs.length,
    findings: findings.length,
    findings_by_severity: tally(findings.map((f) => f.severity)),
    findings_by_category: tally(findings.map((f) => f.category)),
    // Null, not 0, when nothing has been triaged: an untouched backlog is not a
    // rejected skill, and a 0% badge over zero decisions is an accusation the
    // data never made.
    accept_rate: triaged === 0 ? null : accepted / triaged,
    accepted,
    dismissed,
    tokens: priced.length === 0 ? null : priced.reduce((sum, r) => sum + (r.tokens ?? 0), 0),
    last_version_used: newest?.skillVersion ?? null,
    last_used_at: newest ? newest.ranAt.toISOString() : null,
  };
}
