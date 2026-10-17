import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AgentPerf } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance-seed] Docker not available — skipping integration tests.');
}

d('agent performance seed', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function september(): Promise<AgentPerf> {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/agents/performance?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z',
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    return res.json() as AgentPerf;
  }

  const counts = async () => {
    const [r] = await pg.handle.db.execute(sql`select (select count(*) from agent_runs) as runs,
        (select count(*) from reviews) as reviews, (select count(*) from findings) as findings`);
    return JSON.stringify(r);
  };

  it('shows the documented historic figures for September 2026', async () => {
    const perf = await september();
    const by = (name: string) => perf.agents.find((a) => a.agent_name === name)!;

    const sec = by('Security Reviewer');
    expect(sec.runs).toBe(6);
    expect(sec.failed_runs).toBe(1);
    expect(sec.avg_cost_usd).toBeCloseTo(0.05, 9);
    expect(sec.avg_duration_ms).toBeCloseTo(6200, 6);
    expect([sec.accepted, sec.dismissed]).toEqual([5, 2]);
    expect(sec.accept_rate).toBeCloseTo(5 / 7, 9);
    expect(sec.small_sample).toBe(false);

    const gen = by('General Reviewer');
    expect(gen.runs).toBe(3);
    expect(gen.avg_cost_usd).toBeCloseTo(0.02, 9);
    expect(gen.priced_runs).toBe(2);
    expect(gen.avg_duration_ms).toBeCloseTo(4500, 6);
    expect([gen.accepted, gen.dismissed]).toEqual([1, 1]);
    expect(gen.small_sample).toBe(true);

    const perfRev = by('Performance Reviewer');
    expect(perfRev.runs).toBe(2);
    expect(perfRev.avg_cost_usd).toBeCloseTo(0.01, 9);
    expect(perfRev.avg_duration_ms).toBeCloseTo(31000, 6);
    expect(perfRev.accept_rate).toBeNull();

    for (const name of ['API Contract Reviewer', 'Test Quality Reviewer']) {
      expect(by(name).runs).toBe(0);
    }
    expect(perf.cost_by_model.some((s) => s.model === null)).toBe(true);
  });

  it('shows ranked, small-sample and no-decision agents in the default 30-day window', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 3_600_000);
    const res = await app.inject({
      method: 'GET',
      url: `/agents/performance?from=${from.toISOString()}&to=${to.toISOString()}`,
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    const perf = res.json() as AgentPerf;
    const decided = (a: AgentPerf['agents'][number]) => a.accepted + a.dismissed;

    const ranked = perf.agents.filter((a) => decided(a) >= 5);
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ranked.map((a) => a.accept_rate?.toFixed(3))).size).toBeGreaterThanOrEqual(2);
    expect(ranked.every((a) => !a.small_sample)).toBe(true);

    expect(perf.agents.some((a) => decided(a) >= 1 && decided(a) <= 4 && a.small_sample)).toBe(true);
    expect(perf.agents.some((a) => a.runs > 0 && decided(a) === 0)).toBe(true);
  });

  it('re-seeding changes no run, review or finding', async () => {
    const before = await counts();
    await seed(pg.handle.db);
    expect(await counts()).toBe(before);
  });
});
