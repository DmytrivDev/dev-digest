import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { EvalService } from '../src/modules/eval/service.js';
import { MAX_CASE_DIFF_BYTES } from '../src/modules/eval/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-cases] Docker not available — skipping integration tests.');
}

/**
 * SPEC-04 case endpoints: turn a triaged finding into an eval case, then read, edit and
 * delete it. Covers AC-9…AC-24, AC-41…AC-43 and the workspace scoping of AC-103.
 * Fixtures use `sk_live_xxx` placeholders only (NFR-1).
 */

/** Two hunks: new-side lines 1-4 (line 2 added) and 21-23 (line 22 added). */
const PATCH = [
  '@@ -1,3 +1,4 @@',
  ' const a = 1;',
  "+const stripeKey = 'sk_live_xxx';",
  ' const b = 2;',
  ' const c = 3;',
  '@@ -20,2 +21,3 @@',
  ' function f() {',
  '+  return run(input);',
  ' }',
].join('\n');

const FILE = 'src/config.ts';

d('eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prSeq = 100;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'eval-cases', fullName: 'acme/eval-cases' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  function makeService() {
    return new EvalService({
      repo: new EvalRepository(pg.handle.db),
      agents: new AgentsRepository(pg.handle.db),
      parseDiff: parseUnifiedDiff,
      resolveLlm: async () => {
        throw new Error('no model call expected in case tests');
      },
    });
  }

  async function newAgent(): Promise<string> {
    const agent = await new AgentsRepository(pg.handle.db).insert({
      workspaceId,
      name: `Cases ${Math.random().toString(36).slice(2, 8)}`,
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'Review the diff.',
    });
    return agent.id;
  }

  interface FindingOpts {
    workspaceId?: string;
    repoId?: string;
    agentId?: string | null;
    accepted?: boolean;
    dismissed?: boolean;
    title?: string;
    file?: string;
    start?: number;
    end?: number;
    patch?: string | null;
    body?: string | null;
  }

  /** A PR with one file, one review and one finding. Returns the ids. */
  async function newFinding(opts: FindingOpts = {}) {
    const db = pg.handle.db;
    const ws = opts.workspaceId ?? workspaceId;
    const file = opts.file ?? FILE;
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: opts.repoId ?? repoId,
        number: prSeq++,
        title: 'Add stripe config',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        body: opts.body === undefined ? 'Wires the payment config.' : opts.body,
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: file,
      patch: opts.patch === undefined ? PATCH : opts.patch,
    });
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId: ws,
        prId: pr!.id,
        agentId: opts.agentId === undefined ? agentId : opts.agentId,
        kind: 'review',
        verdict: 'request_changes',
        summary: 's',
        score: 50,
        model: 'gpt-4o-mini',
      })
      .returning();
    const [finding] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file,
        startLine: opts.start ?? 2,
        endLine: opts.end ?? 2,
        severity: 'CRITICAL',
        category: 'security',
        title: opts.title ?? 'Hardcoded Stripe secret key',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: opts.accepted ? new Date() : null,
        dismissedAt: opts.dismissed ? new Date() : null,
      })
      .returning();
    return { prId: pr!.id, reviewId: review!.id, findingId: finding!.id };
  }

  const caseCount = async (fid?: string) => {
    const rows = await pg.handle.db.select().from(t.evalCases);
    return fid ? rows.filter((r) => r.sourceFindingId === fid).length : rows.length;
  };

  beforeAll(async () => {
    agentId = await newAgent();
  });

  it('accepted finding -> must_find case carrying the finding range, agent, labels and source (AC-9, 11, 12, 15)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true, start: 2, end: 2 });

    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.expectation).toEqual({ kind: 'must_find', file: FILE, start_line: 2, end_line: 2 });
    expect(c.agent_id).toBe(agentId);
    expect(c.labels).toEqual({
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
    });
    expect(c.source).toMatchObject({
      finding_id: findingId,
      repo: 'acme/eval-cases',
      available: true,
    });
    expect(c.name).toBe('hardcoded-stripe-secret-key');
    expect(c.last_outcome).toBeNull();
    await app.close();
  });

  it('dismissed finding -> must_not_flag case (AC-10)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ dismissed: true, title: 'Style nit' });
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(201);
    expect(res.json().expectation.kind).toBe('must_not_flag');
    await app.close();
  });

  it('stores a parseable single-file diff with every hunk and the original numbering (AC-13)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true });
    const c = (await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` })).json();

    const parsed = parseUnifiedDiff(c.input_diff);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe(FILE);
    expect(parsed.files[0]!.hunks.map((h) => [h.newStart, h.newLines])).toEqual([
      [1, 4],
      [21, 3],
    ]);
    await app.close();
  });

  it('freezes the PR number, title and body — later PR edits do not change the case (AC-14)', async () => {
    const app = await makeApp();
    const { findingId, prId } = await newFinding({ accepted: true, body: 'Original body.' });
    const created = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` })
    ).json();
    expect(created.input_meta).toMatchObject({ title: 'Add stripe config', body: 'Original body.' });

    await pg.handle.db
      .update(t.pullRequests)
      .set({ title: 'Renamed later', body: 'Edited later.' })
      .where(eq(t.pullRequests.id, prId));

    const after = (await app.inject({ method: 'GET', url: `/eval/cases/${created.id}` })).json();
    expect(after.input_meta).toEqual(created.input_meta);
    await app.close();
  });

  it('names cases by slug and suffixes -2, -3 on collision (AC-16)', async () => {
    const app = await makeApp();
    const solo = await newAgent();
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { findingId } = await newFinding({ accepted: true, agentId: solo, title: 'Same title!' });
      const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
      expect(res.statusCode).toBe(201);
      names.push(res.json().name);
    }
    expect(names).toEqual(['same-title', 'same-title-2', 'same-title-3']);
    await app.close();
  });

  it('is idempotent: a second request returns the same case with 200 and creates no row (AC-17)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true });
    const first = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    const second = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(await caseCount(findingId)).toBe(1);
    await app.close();
  });

  it('two concurrent requests still produce one case row (AC-17)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true });
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` }),
      app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().id).toBe(b.json().id);
    expect(await caseCount(findingId)).toBe(1);
    await app.close();
  });

  it('rejects an untriaged finding with 422 finding_not_triaged and creates no row (AC-18)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding();
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('finding_not_triaged');
    expect(await caseCount(findingId)).toBe(0);
    await app.close();
  });

  it('rejects a finding whose review has no agent with 422 not_agent_finding (AC-19)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true, agentId: null });
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('not_agent_finding');
    expect(await caseCount(findingId)).toBe(0);
    await app.close();
  });

  it('rejects a finding whose agent was deleted with 422 agent_missing (AC-20)', async () => {
    const app = await makeApp();
    const doomed = await newAgent();
    const { findingId } = await newFinding({ accepted: true, agentId: doomed });
    await new AgentsRepository(pg.handle.db).deleteById(workspaceId, doomed);

    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('agent_missing');
    expect(await caseCount(findingId)).toBe(0);
    await app.close();
  });

  it('rejects a file with no stored patch with 422 patch_missing (AC-21)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true, patch: null });
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('patch_missing');
    expect(await caseCount(findingId)).toBe(0);
    await app.close();
  });

  it('rejects lines outside every hunk with 422 range_outside_hunks (AC-22)', async () => {
    const app = await makeApp();
    // 8-12 sits between the two hunks (new-side 1-4 and 21-23).
    const { findingId } = await newFinding({ accepted: true, start: 8, end: 12 });
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('range_outside_hunks');
    expect(await caseCount(findingId)).toBe(0);
    await app.close();
  });

  it('rejects a diff over 200 KB with 422 diff_too_large and creates no row (AC-23)', async () => {
    const app = await makeApp();
    const huge = `@@ -1,1 +1,2 @@\n a\n+${'x'.repeat(MAX_CASE_DIFF_BYTES + 1)}`;
    const { findingId } = await newFinding({ accepted: true, patch: huge, start: 2, end: 2 });
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('diff_too_large');
    expect(await caseCount(findingId)).toBe(0);
    await app.close();
  });

  it('re-triage after creation leaves the case kind unchanged (AC-24)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true });
    const created = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(created.json().expectation.kind).toBe('must_find');

    const dismissed = await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` });
    expect(dismissed.statusCode).toBe(200);

    const again = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(created.json().id);
    expect(again.json().expectation.kind).toBe('must_find');
    await app.close();
  });

  it('answers 404 for an unknown finding or case id', async () => {
    const app = await makeApp();
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'POST', url: `/findings/${unknown}/eval-case` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval/cases/${unknown}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval/cases/${unknown}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${unknown}/eval/cases` })).statusCode).toBe(404);
    await app.close();
  });

  describe('PATCH /eval/cases/:id', () => {
    async function freshCase(app: Awaited<ReturnType<typeof makeApp>>) {
      const { findingId } = await newFinding({ accepted: true });
      return (await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` })).json();
    }

    it('renames, sets notes and moves the expectation inside the hunks; kind may change', async () => {
      const app = await makeApp();
      const c = await freshCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval/cases/${c.id}`,
        payload: {
          name: 'renamed',
          notes: 'why this case exists',
          expectation: { kind: 'must_not_flag', file: FILE, start_line: 21, end_line: 23 },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        name: 'renamed',
        notes: 'why this case exists',
        expectation: { kind: 'must_not_flag', file: FILE, start_line: 21, end_line: 23 },
      });
      await app.close();
    });

    it('rejects an expectation in another file with 422 file_mismatch, leaving the case unchanged (AC-41)', async () => {
      const app = await makeApp();
      const c = await freshCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval/cases/${c.id}`,
        payload: { expectation: { kind: 'must_find', file: 'src/other.ts', start_line: 2, end_line: 2 } },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('file_mismatch');
      const after = (await app.inject({ method: 'GET', url: `/eval/cases/${c.id}` })).json();
      expect(after.expectation).toEqual(c.expectation);
      await app.close();
    });

    it('rejects a range outside the hunks with 422 range_outside_hunks, leaving the case unchanged (AC-42)', async () => {
      const app = await makeApp();
      const c = await freshCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval/cases/${c.id}`,
        payload: { expectation: { kind: 'must_find', file: FILE, start_line: 8, end_line: 12 } },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_hunks');
      const after = (await app.inject({ method: 'GET', url: `/eval/cases/${c.id}` })).json();
      expect(after.expectation).toEqual(c.expectation);
      await app.close();
    });

    it('rejects an empty name and unknown keys with 422 and changes nothing (AC-43)', async () => {
      const app = await makeApp();
      const c = await freshCase(app);
      const emptyName = await app.inject({
        method: 'PATCH',
        url: `/eval/cases/${c.id}`,
        payload: { name: '   ' },
      });
      expect(emptyName.statusCode).toBe(422);
      const unknownKey = await app.inject({
        method: 'PATCH',
        url: `/eval/cases/${c.id}`,
        payload: { name: 'ok', agent_id: 'x' },
      });
      expect(unknownKey.statusCode).toBe(422);
      const after = (await app.inject({ method: 'GET', url: `/eval/cases/${c.id}` })).json();
      expect(after.name).toBe(c.name);
      await app.close();
    });
  });

  it('lists an agent’s cases with their latest outcome; delete removes the case but not the outcome (AC-35)', async () => {
    const app = await makeApp();
    const solo = await newAgent();
    const { findingId } = await newFinding({ accepted: true, agentId: solo });
    const c = (await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` })).json();

    const [run] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: solo,
        agentVersion: 1,
        config: {},
        caseIds: [c.id],
        casesTotal: 1,
        status: 'completed',
      })
      .returning();
    await pg.handle.db.insert(t.evalCaseOutcomes).values({
      runId: run!.id,
      caseId: c.id,
      caseName: c.name,
      kind: 'must_find',
      expectation: c.expectation,
      status: 'scored',
      pass: true,
      durationMs: 10,
    });

    const list = (await app.inject({ method: 'GET', url: `/agents/${solo}/eval/cases` })).json();
    expect(list).toHaveLength(1);
    expect(list[0].last_outcome).toMatchObject({ case_id: c.id, pass: true, status: 'scored' });

    const del = await app.inject({ method: 'DELETE', url: `/eval/cases/${c.id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/eval/cases/${c.id}` })).statusCode).toBe(404);
    const kept = await pg.handle.db
      .select()
      .from(t.evalCaseOutcomes)
      .where(eq(t.evalCaseOutcomes.caseId, c.id));
    expect(kept).toHaveLength(1);
    await app.close();
  });

  it('keeps a case runnable, with source.available=false, once its finding is deleted (AC-105)', async () => {
    const app = await makeApp();
    const { findingId } = await newFinding({ accepted: true });
    const c = (await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` })).json();
    await pg.handle.db.delete(t.findings).where(eq(t.findings.id, findingId));

    const after = (await app.inject({ method: 'GET', url: `/eval/cases/${c.id}` })).json();
    expect(after.source).toMatchObject({ finding_id: null, available: false });
    expect(after.input_diff).toBe(c.input_diff);
    await app.close();
  });

  describe('workspace scoping (AC-103)', () => {
    it('every case operation answers not-found for a caller in another workspace, and changes nothing', async () => {
      const app = await makeApp();
      const { findingId } = await newFinding({ accepted: true });
      const c = (await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` })).json();

      const [other] = await pg.handle.db
        .insert(t.workspaces)
        .values({ name: 'other-tenant' })
        .returning();
      const otherWs = other!.id;
      const service = makeService();

      await expect(service.getCase(otherWs, c.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.listCases(otherWs, c.agent_id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.updateCase(otherWs, c.id, { name: 'hijacked' })).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(service.deleteCase(otherWs, c.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.createCaseFromFinding(otherWs, findingId)).rejects.toMatchObject({
        statusCode: 404,
      });

      // The row is untouched.
      const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, c.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe(c.name);

      // And a finding that lives in the OTHER workspace is not reachable from this one.
      const [otherRepo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: otherWs, owner: 'acme', name: 'theirs', fullName: 'acme/theirs' })
        .returning();
      const theirAgent = await new AgentsRepository(pg.handle.db).insert({
        workspaceId: otherWs,
        name: 'Their agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'p',
      });
      const theirs = await newFinding({
        workspaceId: otherWs,
        repoId: otherRepo!.id,
        agentId: theirAgent.id,
        accepted: true,
      });
      const res = await app.inject({ method: 'POST', url: `/findings/${theirs.findingId}/eval-case` });
      expect(res.statusCode).toBe(404);
      expect(await caseCount(theirs.findingId)).toBe(0);
      await app.close();
    });
  });
});
