/**
 * The seeded eval suite (SPEC-04 AC-106…AC-109): demo PR #483 with real patches, a Security
 * Reviewer review whose findings all sit on in-hunk lines, 8 linked cases (>= 3 `must_not_flag`,
 * >= 1 `must_find`), 2 triaged findings without a case, and a seed that is idempotent.
 * Gated on Docker.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  buildCaseDiff,
  rangeIntersectsHunks,
  slugifyTitle,
} from '../src/modules/eval/helpers/case-diff.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-seed] Docker not available — skipping integration tests.');
}

d('seeded eval suite (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let reviewId: string;
  let agentId: string;

  const counts = async () => {
    const db = pg.handle.db;
    const [prs, files, reviews, findings, cases] = await Promise.all([
      db.select().from(t.pullRequests),
      db.select().from(t.prFiles),
      db.select().from(t.reviews),
      db.select().from(t.findings),
      db.select().from(t.evalCases),
    ]);
    return {
      prs: prs.length,
      files: files.length,
      reviews: reviews.length,
      findings: findings.length,
      cases: cases.length,
    };
  };

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const db = pg.handle.db;
    const [pr] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 483)));
    prId = pr!.id;
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
    agentId = agent!.id;
    const [review] = await db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.agentId, agentId)));
    reviewId = review!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('seeds PR #483 with three files that carry real patches (AC-106)', async () => {
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    expect(files.map((f) => f.path).sort()).toEqual([
      'src/admin/export.ts',
      'src/api/webhooks.ts',
      'src/lib/crypto.ts',
    ]);
    for (const f of files) {
      expect(f.patch).toBeTruthy();
      // multi-hunk, and the declared additions/deletions match the patch
      const lines = f.patch!.split('\n');
      expect(lines.filter((l) => l.startsWith('@@')).length).toBeGreaterThanOrEqual(2);
      expect(lines.filter((l) => l.startsWith('+')).length).toBe(f.additions);
      expect(lines.filter((l) => l.startsWith('-')).length).toBe(f.deletions);
    }
  });

  it('has a Security Reviewer review with >= 10 findings, each on an in-hunk line (AC-106)', async () => {
    const db = pg.handle.db;
    const found = await db.select().from(t.findings).where(eq(t.findings.reviewId, reviewId));
    expect(found.length).toBeGreaterThanOrEqual(10);

    const files = await db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const patchOf = new Map(files.map((f) => [f.path, f.patch!]));
    for (const f of found) {
      const patch = patchOf.get(f.file);
      expect(patch, `${f.file} has a patch`).toBeTruthy();
      const diff = parseUnifiedDiff(buildCaseDiff(f.file, patch!));
      expect(
        rangeIntersectsHunks(diff, f.file, f.startLine, f.endLine),
        `${f.file}:${f.startLine}-${f.endLine} lies in a hunk`,
      ).toBe(true);
    }
  });

  it('seeds >= 8 linked cases: >= 3 must_not_flag and >= 1 must_find (AC-107)', async () => {
    const db = pg.handle.db;
    const cases = await db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agentId));
    expect(cases.length).toBeGreaterThanOrEqual(8);

    const kinds = cases.map((c) => (c.expectedOutput as { kind: string }).kind);
    expect(kinds.filter((k) => k === 'must_not_flag').length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === 'must_find').length).toBeGreaterThanOrEqual(1);

    const found = await db.select().from(t.findings).where(eq(t.findings.reviewId, reviewId));
    const files = await db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const patchOf = new Map(files.map((f) => [f.path, f.patch!]));

    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    for (const c of cases) {
      const finding = found.find((f) => f.id === c.sourceFindingId);
      expect(finding, `${c.name} is linked to a finding of the review`).toBeTruthy();
      const exp = c.expectedOutput as {
        kind: string;
        file: string;
        start_line: number;
        end_line: number;
      };
      // The expectation is the finding's range; the kind follows the triage.
      expect(exp).toEqual({
        kind: finding!.acceptedAt ? 'must_find' : 'must_not_flag',
        file: finding!.file,
        start_line: finding!.startLine,
        end_line: finding!.endLine,
      });
      // Guards the seed's duplicated builder and slug against the real helpers.
      expect(c.inputDiff).toBe(buildCaseDiff(finding!.file, patchOf.get(finding!.file)!));
      expect(c.name).toBe(slugifyTitle(finding!.title));
      expect(c.labels).toEqual({
        severity: finding!.severity,
        category: finding!.category,
        title: finding!.title,
      });
      expect(c.sourcePrNumber).toBe(483);
      expect(c.sourceRepo).toBe('acme/payments-api');
      expect(c.inputMeta).toMatchObject({ pr_number: 483, title: 'Add payment webhooks and admin export' });
    }
  });

  it('leaves >= 2 triaged findings without a case (AC-108)', async () => {
    const db = pg.handle.db;
    const found = await db.select().from(t.findings).where(eq(t.findings.reviewId, reviewId));
    const cases = await db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agentId));
    const cased = new Set(cases.map((c) => c.sourceFindingId));
    const triagedUncased = found.filter((f) => (f.acceptedAt || f.dismissedAt) && !cased.has(f.id));
    expect(triagedUncased.length).toBeGreaterThanOrEqual(2);
    // and an untriaged one exists too, so the button's hidden state is demoable
    expect(found.some((f) => !f.acceptedAt && !f.dismissedAt)).toBe(true);
  });

  it('is idempotent: a second seed changes no counts (AC-109)', async () => {
    const before = await counts();
    await seed(pg.handle.db);
    expect(await counts()).toEqual(before);
  });

  it('restores missing cases on a database that already had PR #483, without duplicating (AC-109)', async () => {
    const db = pg.handle.db;
    const before = await counts();
    const cases = await db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agentId));
    // Simulate a dev DB seeded before the cases existed: drop two, keep the PR and review.
    for (const c of cases.slice(0, 2)) await db.delete(t.evalCases).where(eq(t.evalCases.id, c.id));
    await seed(db);
    expect(await counts()).toEqual(before);
  });
});
