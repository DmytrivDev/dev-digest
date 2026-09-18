import { describe, it, expect } from 'vitest';
import { skillStatsFrom, type SkillFindingRow, type SkillRunRow } from '../src/modules/skills/stats.js';

/**
 * Unit coverage for the skill-stats rollup. No database: the counting rules are
 * pure, which is the point of keeping them out of the repository.
 */

const run = (over: Partial<SkillRunRow> = {}): SkillRunRow => ({
  runId: 'r1',
  skillVersion: 2,
  tokens: 100,
  ranAt: new Date('2026-09-10T00:00:00.000Z'),
  ...over,
});

const finding = (over: Partial<SkillFindingRow> = {}): SkillFindingRow => ({
  severity: 'WARNING',
  category: 'bug',
  acceptedAt: null,
  dismissedAt: null,
  ...over,
});

describe('skillStatsFrom', () => {
  it('reports an empty, never-run skill without inventing zeros', () => {
    const stats = skillStatsFrom(30, [], [], []);
    expect(stats).toMatchObject({
      window_days: 30,
      runs: 0,
      findings: 0,
      accepted: 0,
      dismissed: 0,
      // Nothing was measured, so nothing is claimed.
      accept_rate: null,
      tokens: null,
      last_version_used: null,
      last_used_at: null,
    });
  });

  it('counts runs and groups findings by severity and category', () => {
    const stats = skillStatsFrom(
      30,
      [],
      [run({ runId: 'r1' }), run({ runId: 'r2' })],
      [
        finding({ severity: 'CRITICAL', category: 'security' }),
        finding({ severity: 'WARNING', category: 'bug' }),
        finding({ severity: 'WARNING', category: 'bug' }),
      ],
    );
    expect(stats.runs).toBe(2);
    expect(stats.findings).toBe(3);
    expect(stats.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 2 });
    expect(stats.findings_by_category).toEqual({ security: 1, bug: 2 });
  });

  // An untriaged backlog is not a rejected skill. 0/0 has to read as "unknown",
  // because a 0% badge over zero decisions is an accusation the data never made.
  it('leaves the accept rate null until something has been triaged', () => {
    const stats = skillStatsFrom(30, [], [run()], [finding(), finding()]);
    expect(stats.accept_rate).toBeNull();
    expect(stats.accepted).toBe(0);
    expect(stats.dismissed).toBe(0);
  });

  it('computes the accept rate over triaged findings only', () => {
    const stats = skillStatsFrom(
      30,
      [],
      [run()],
      [
        finding({ acceptedAt: new Date() }),
        finding({ acceptedAt: new Date() }),
        finding({ dismissedAt: new Date() }),
        finding(), // untriaged — excluded from the denominator
      ],
    );
    expect(stats.accepted).toBe(2);
    expect(stats.dismissed).toBe(1);
    expect(stats.accept_rate).toBeCloseTo(2 / 3);
  });

  it('sums tokens over priced runs, and stays null when none reported any', () => {
    expect(skillStatsFrom(30, [], [run({ tokens: 100 }), run({ tokens: 40 })], []).tokens).toBe(140);
    // A run that never priced its blocks contributes nothing, not a zero.
    expect(skillStatsFrom(30, [], [run({ tokens: 100 }), run({ tokens: null })], []).tokens).toBe(100);
    expect(skillStatsFrom(30, [], [run({ tokens: null })], []).tokens).toBeNull();
  });

  it('reports the version and timestamp of the NEWEST run, not the first row', () => {
    const stats = skillStatsFrom(
      30,
      [],
      [
        run({ runId: 'old', skillVersion: 1, ranAt: new Date('2026-09-01T00:00:00.000Z') }),
        run({ runId: 'new', skillVersion: 4, ranAt: new Date('2026-09-17T00:00:00.000Z') }),
        run({ runId: 'mid', skillVersion: 2, ranAt: new Date('2026-09-05T00:00:00.000Z') }),
      ],
      [],
    );
    expect(stats.last_version_used).toBe(4);
    expect(stats.last_used_at).toBe('2026-09-17T00:00:00.000Z');
  });

  it('passes the current agent links through unchanged', () => {
    const usedBy = [{ agent_id: 'a1', agent_name: 'Security', agent_enabled: true }];
    expect(skillStatsFrom(30, usedBy, [], []).used_by).toEqual(usedBy);
  });
});
