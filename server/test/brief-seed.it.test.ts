/**
 * The seeded PR Brief of PR #482 (SPEC-03 W12, AC-96): after `seed`, GET returns it fresh, it
 * parses as `PrBrief`, and the server's own output validation finds every reference grounded
 * in the seeded files — nothing is removed. Seeding twice changes nothing. Gated on Docker.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { PrBrief, type PrBriefResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { fileStats } from '../src/modules/brief/helpers/diff-stats.js';
import { validateBrief } from '../src/modules/brief/helpers/validate.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief-seed] Docker not available — skipping integration tests.');
}

d('seeded PR brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    prId = pr!.id;
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient() },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('AC-96: GET returns the seeded brief for head a1b2c3d4e5f6, fresh, with a risk and a focus', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrBriefResponse;
    expect(body.generating).toBe(false);
    expect(body.stale).toBe(false);
    expect(body.brief?.head_sha).toBe('a1b2c3d4e5f6');
    expect(PrBrief.safeParse(body.brief).success).toBe(true);
    expect(body.brief!.risks.risks.length).toBeGreaterThanOrEqual(1);
    expect(body.brief!.review_focus.length).toBeGreaterThanOrEqual(1);
  });

  it('AC-96: output validation against the seeded files removes nothing', async () => {
    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    const brief = PrBrief.parse(row!.json);
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));

    const validated = validateBrief({
      output: { summary: brief.summary, risks: brief.risks.risks, review_focus: brief.review_focus },
      prFiles: fileStats(files),
      blastCallers: null,
    });

    expect(validated.dropped).toEqual({ risks: 0, review_focus: 0 });
    expect(validated.risks).toEqual(brief.risks.risks);
    expect(validated.review_focus).toEqual(brief.review_focus);
    expect(brief.dropped).toEqual({ risks: 0, review_focus: 0 });
  });

  it('seeding again keeps exactly one brief row (idempotent)', async () => {
    await seed(pg.handle.db);
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(rows).toHaveLength(1);
  });
});
