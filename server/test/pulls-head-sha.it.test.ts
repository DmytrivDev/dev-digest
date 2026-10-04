/**
 * PR detail persists GitHub's live head (SPEC-03 W11, AC-98, AC-99): a refresh from GitHub
 * writes `head_sha` to the row, so a brief stored for the previous head reads `stale`; the
 * offline fallback leaves the row alone. Gated on Docker.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrBriefResponse, PrDetail } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makePr, sampleBrief } from './helpers/brief.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[pulls-head-sha] Docker not available — skipping integration tests.');
}

/** GitHub being unreachable: the detail fetch throws, so the route serves the persisted row. */
class OfflineGitHub extends MockGitHubClient {
  override async getPullRequest(): Promise<PrDetail> {
    throw new Error('offline');
  }
}

d('PR detail head_sha (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const apps: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  }, 120_000);

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
    await pg?.stop();
  });

  async function makeApp(github: MockGitHubClient) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ config, db: pg.handle.db, overrides: { github } });
    apps.push(app);
    return app;
  }

  const storedHead = async (prId: string) => {
    const [row] = await pg.handle.db
      .select({ headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, prId));
    return row!.headSha;
  };

  it('AC-98: GitHub head bbb222 replaces the stored aaa111, and a brief for aaa111 turns stale', async () => {
    const { pr } = await makePr(pg.handle.db, workspaceId, { headSha: 'aaa111' });
    await pg.handle.db
      .insert(t.prBrief)
      .values({ prId: pr.id, json: sampleBrief({ head_sha: 'aaa111' }) });
    const app = await makeApp(new MockGitHubClient({ detail: { head_sha: 'bbb222' } }));

    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect((before.json() as PrBriefResponse).stale).toBe(false);

    const detail = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as PrDetail).head_sha).toBe('bbb222');
    expect(await storedHead(pr.id)).toBe('bbb222');

    const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    const body = after.json() as PrBriefResponse;
    expect(body.brief?.head_sha).toBe('aaa111');
    expect(body.stale).toBe(true);
  });

  it('AC-99: a throwing GitHub leaves the stored head unchanged', async () => {
    const { pr } = await makePr(pg.handle.db, workspaceId, { headSha: 'aaa111' });
    const app = await makeApp(new OfflineGitHub());

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as PrDetail).head_sha).toBe('aaa111');
    expect(await storedHead(pr.id)).toBe('aaa111');
  });
});
