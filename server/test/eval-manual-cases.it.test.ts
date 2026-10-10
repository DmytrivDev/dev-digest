import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Finding, LLMProvider } from '@devdigest/shared';
import { EVAL_CASE_MAX_BYTES } from '@devdigest/shared';
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
import { buildCaseDiff } from '../src/modules/eval/helpers/case-diff.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-manual-cases] Docker not available — skipping integration tests.');
}

/**
 * SPEC-05 manual eval cases over HTTP: `POST /agents/:id/eval/cases` and the diff/meta
 * extension of `PATCH /eval/cases/:id`. Covers AC-19…AC-21, AC-24…AC-29, AC-35…AC-39,
 * AC-42, AC-43, AC-48 and NFR-6. Fixtures use `sk_live_xxx` placeholders only.
 *
 * Every request goes through the default workspace; another tenant is a second workspace
 * row whose agents/cases are made directly, so a 404 here is the tenancy guard working.
 */

const FILE = 'src/config.ts';

/** `+++`-only paste: new-side lines 1-4 (line 2 added); a second hunk covers 21-23. */
const ONE_HUNK =
  '+++ b/src/config.ts\n@@ -1,3 +1,4 @@\n const a = 1;\n+const key = "sk_live_xxx";\n const b = 2;\n const c = 3;\n';
const TWO_HUNKS = `${ONE_HUNK}@@ -20,2 +21,3 @@\n function f() {\n+  return run(input);\n }\n`;
const OTHER_FILE =
  '+++ b/src/other.ts\n@@ -1,2 +1,3 @@\n x\n+y\n z\n';
/** Same file, hunk far from line 2. */
const FAR_HUNK = '+++ b/src/config.ts\n@@ -50,2 +50,3 @@\n p\n+q\n r\n';

const EXPECT = { kind: 'must_find', file: FILE, start_line: 2, end_line: 2 } as const;

const STORED_ONE_HUNK = buildCaseDiff(FILE, ONE_HUNK.slice(ONE_HUNK.indexOf('@@')));

function hit(start: number): Finding {
  return {
    id: `f-${start}`,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded Stripe secret key',
    file: FILE,
    start_line: start,
    end_line: start,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
  };
}

interface Stub {
  llm: LLMProvider;
  calls: string[];
  releaseAll(): void;
}

/** A stub engine LLM whose calls wait until released, so a test can act mid-run. */
function gatedStub(): Stub {
  const calls: string[] = [];
  let released = false;
  const waiters: (() => void)[] = [];
  const unexpected = () => {
    throw new Error('only completeStructured is expected during an eval run');
  };
  const llm = {
    id: 'openrouter',
    listModels: unexpected,
    complete: unexpected,
    async completeStructured(req: { model: string; messages: { content: string }[] }) {
      calls.push(req.messages.map((m) => m.content).join('\n'));
      if (!released) await new Promise<void>((resolve) => waiters.push(resolve));
      return {
        data: { verdict: 'comment', summary: 's', score: 80, findings: [hit(2)] },
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.01,
        raw: '{}',
        attempts: 1,
      };
    },
  };
  return {
    llm: llm as unknown as LLMProvider,
    calls,
    releaseAll: () => {
      released = true;
      for (const w of waiters.splice(0)) w();
    },
  };
}

async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 10_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

d('manual eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWs: string;
  const stubs: Stub[] = [];
  let app: Awaited<ReturnType<typeof makeApp>> | undefined;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
    otherWs = other!.id;
  });

  afterEach(async () => {
    // Never leave a run executing into the next test: a later buildApp reaps `running` rows.
    for (const s of stubs.splice(0)) s.releaseAll();
    await waitFor(async () => {
      const running = await pg.handle.db
        .select({ id: t.evalSuiteRuns.id })
        .from(t.evalSuiteRuns)
        .where(eq(t.evalSuiteRuns.status, 'running'));
      return running.length === 0;
    });
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(stub?: Stub) {
    if (stub) stubs.push(stub);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        ...(stub ? { llm: { openrouter: stub.llm } } : {}),
      },
    });
  }

  async function open(stub?: Stub) {
    app = await makeApp(stub);
    return app;
  }

  function makeService() {
    return new EvalService({
      repo: new EvalRepository(pg.handle.db),
      agents: new AgentsRepository(pg.handle.db),
      parseDiff: parseUnifiedDiff,
      resolveLlm: async () => {
        throw new Error('no model call expected when creating or editing a case');
      },
    });
  }

  async function newAgent(ws = workspaceId): Promise<string> {
    const agent = await new AgentsRepository(pg.handle.db).insert({
      workspaceId: ws,
      name: `Manual ${Math.random().toString(36).slice(2, 8)}`,
      provider: 'openrouter',
      model: 'test-model',
      systemPrompt: 'Review the diff.',
    });
    return agent.id;
  }

  /** A finding-born case the SPEC-04 way: direct insert, `origin` left to its default. */
  async function addFindingCase(agentId: string, name = 'finding-case'): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.evalCases)
      .values({
        workspaceId,
        agentId,
        sourceFindingId: null,
        sourcePrNumber: 9,
        sourceRepo: 'acme/manual-cases',
        labels: { severity: 'CRITICAL', category: 'security', title: name },
        name,
        inputDiff: buildCaseDiff(FILE, TWO_HUNKS.slice(TWO_HUNKS.indexOf('@@'))),
        inputMeta: { pr_number: 9, title: 'Add stripe config', body: 'Wires the payment config.' },
        expectedOutput: EXPECT,
      })
      .returning();
    return row!.id;
  }

  const countCases = async (agentId: string) =>
    (await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agentId))).length;

  type App = NonNullable<typeof app>;
  const create = (a: App, agentId: string, payload: unknown) =>
    a.inject({ method: 'POST', url: `/agents/${agentId}/eval/cases`, payload: payload as object });
  const patch = (a: App, id: string, payload: unknown) =>
    a.inject({ method: 'PATCH', url: `/eval/cases/${id}`, payload: payload as object });
  const getCase = async (a: App, id: string) =>
    (await a.inject({ method: 'GET', url: `/eval/cases/${id}` })).json();

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'manual-case',
    input_diff: ONE_HUNK,
    expectation: EXPECT,
    ...over,
  });

  // ===========================================================================

  describe('create (AC-19…AC-21)', () => {
    it('answers 201 with a manual case, and a later list shows it as manual (AC-19, AC-20)', async () => {
      const a = await open();
      const agentId = await newAgent();

      const res = await create(a, agentId, body({ notes: 'why it matters' }));
      expect(res.statusCode).toBe(201);
      const created = res.json();
      expect(created).toMatchObject({
        agent_id: agentId,
        name: 'manual-case',
        notes: 'why it matters',
        origin: 'manual',
        source: null,
        labels: null,
        expectation: EXPECT,
        last_outcome: null,
      });
      // Stored in the single-file form: header rebuilt, pasted hunks kept.
      expect(created.input_diff).toBe(STORED_ONE_HUNK);

      const list = (await a.inject({ method: 'GET', url: `/agents/${agentId}/eval/cases` })).json();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: created.id, origin: 'manual', source: null, labels: null });
      expect(await getCase(a, created.id)).toMatchObject({ origin: 'manual', source: null, labels: null });
    });

    it('with no input_meta stores no PR number, an empty title and no body (AC-21)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      expect(created.input_meta).toEqual({ pr_number: null, title: '', body: null });
    });

    it('reads title and body back as sent (AC-21)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (
        await create(a, agentId, body({ input_meta: { title: 'Add stripe config', body: 'Wires it.' } }))
      ).json();
      expect(created.input_meta).toEqual({ pr_number: null, title: 'Add stripe config', body: 'Wires it.' });
      expect((await getCase(a, created.id)).input_meta).toEqual(created.input_meta);
    });

    it('stores an empty body as no body', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body({ input_meta: { title: 'T', body: '' } }))).json();
      expect(created.input_meta).toEqual({ pr_number: null, title: 'T', body: null });
    });

    it('a full-header paste stores the same text as the "+++"-only paste, CRLF as LF (AC-22, AC-23)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const full =
        'diff --git a/src/config.ts b/src/config.ts\r\nindex 1..2 100644\r\n--- a/src/config.ts\r\n' +
        ONE_HUNK.replace(/\n/g, '\r\n');
      const created = (await create(a, agentId, body({ input_diff: full }))).json();
      expect(created.input_diff).toBe(STORED_ONE_HUNK);
      expect(created.input_diff).not.toContain('\r');
    });
  });

  describe('name (AC-24)', () => {
    it('suffixes -2 on a collision', async () => {
      const a = await open();
      const agentId = await newAgent();
      const names: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await create(a, agentId, body({ name: 'sql-injection' }));
        expect(res.statusCode).toBe(201);
        names.push(res.json().name);
      }
      expect(names).toEqual(['sql-injection', 'sql-injection-2', 'sql-injection-3']);
    });

    it('keeps a taken 60-character name at 60 characters with the suffix', async () => {
      const a = await open();
      const agentId = await newAgent();
      const long = 'a'.repeat(60);
      expect((await create(a, agentId, body({ name: long }))).json().name).toBe(long);
      const second = (await create(a, agentId, body({ name: long }))).json().name as string;
      expect(second).toHaveLength(60);
      expect(second.endsWith('-2')).toBe(true);
    });

    it('trims the name', async () => {
      const a = await open();
      const agentId = await newAgent();
      expect((await create(a, agentId, body({ name: '  padded  ' }))).json().name).toBe('padded');
    });
  });

  describe('diff checks on create (AC-25…AC-27)', () => {
    const bigTwoFile = () =>
      '+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+x\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n+' +
      'y'.repeat(300 * 1024);

    it.each([
      ['diff_unparseable', 'no hunk header', '+++ b/src/config.ts\n+x\n'],
      ['diff_unparseable', 'no "+++" line', '@@ -1,1 +1,1 @@\n+x\n'],
      ['diff_unparseable', '"+++ /dev/null"', '--- a/src/a.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x\n'],
      ['diff_unparseable', 'empty text', ''],
      [
        'multi_file_diff',
        'two "+++" without "diff --git"',
        '+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+x\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n+y\n',
      ],
      [
        'multi_file_diff',
        'two "diff --git"',
        'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+x\n' +
          'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n+y\n',
      ],
    ])('%s for %s, and no row is created', async (code, _why, diff) => {
      const a = await open();
      const agentId = await newAgent();
      const res = await create(a, agentId, body({ input_diff: diff }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe(code);
      expect(await countCases(agentId)).toBe(0);
    });

    it('a 300 KB two-file diff is diff_too_large, the first failing check (AC-25)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const res = await create(a, agentId, body({ input_diff: bigTwoFile() }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('diff_too_large');
      expect(await countCases(agentId)).toBe(0);
    });

    it('file_mismatch when the expectation names another file (AC-26)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const res = await create(a, agentId, body({ expectation: { ...EXPECT, file: 'src/other.ts' } }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('file_mismatch');
      expect(await countCases(agentId)).toBe(0);
    });

    it.each([
      ['between two hunks', TWO_HUNKS, 10, 10],
      ['one past the last hunk', ONE_HUNK, 5, 5],
      ['on a removed-only hunk', '+++ b/src/config.ts\n@@ -30,2 +30,0 @@\n-gone1\n-gone2\n', 30, 30],
    ])('range_outside_hunks for a range %s (AC-27)', async (_where, diff, start, end) => {
      const a = await open();
      const agentId = await newAgent();
      const res = await create(
        a,
        agentId,
        body({ input_diff: diff, expectation: { ...EXPECT, start_line: start, end_line: end } }),
      );
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_hunks');
      expect(await countCases(agentId)).toBe(0);
    });

    it('accepts a range on a context line (AC-27)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const res = await create(a, agentId, body({ expectation: { ...EXPECT, start_line: 1, end_line: 1 } }));
      expect(res.statusCode).toBe(201);
    });
  });

  describe('body validation (AC-28)', () => {
    const NUL = '\u0000';
    const bigMeta = { title: 'x'.repeat(EVAL_CASE_MAX_BYTES), body: 'y' };

    it.each([
      ['an unknown key', { extra: 1 }],
      ['a blank name', { name: '   ' }],
      ['a 61-character name', { name: 'n'.repeat(61) }],
      ['title + body over 200 KB', { input_meta: bigMeta }],
      ['a NUL in the name', { name: `a${NUL}b` }],
      ['a NUL in the notes', { notes: `a${NUL}b` }],
      ['a NUL in the diff', { input_diff: ONE_HUNK + NUL }],
      ['a NUL in the title', { input_meta: { title: `a${NUL}`, body: null } }],
      ['a NUL in the body', { input_meta: { title: 't', body: `a${NUL}` } }],
      ['an unknown key in input_meta', { input_meta: { title: 't', pr_number: 7 } }],
    ])('POST with %s is a 422 validation_error and creates nothing', async (_what, over) => {
      const a = await open();
      const agentId = await newAgent();
      const res = await create(a, agentId, body(over));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
      expect(await countCases(agentId)).toBe(0);
    });

    it.each([
      ['an unknown key', { extra: 1 }],
      ['a blank name', { name: '   ' }],
      ['a 61-character name', { name: 'n'.repeat(61) }],
      ['title + body over 200 KB', { input_meta: bigMeta }],
      ['a NUL in the name', { name: `a${NUL}b` }],
      ['a NUL in the diff', { input_diff: ONE_HUNK + NUL }],
      ['an input_meta without body', { input_meta: { title: 't' } }],
    ])('PATCH with %s is a 422 validation_error and changes nothing', async (_what, over) => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      const before = await getCase(a, created.id);

      const res = await patch(a, created.id, over);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
      expect(await getCase(a, created.id)).toEqual(before);
    });

    it('a diff over 200 KB is not a validation error: Zod leaves it to diff_too_large', async () => {
      const a = await open();
      const agentId = await newAgent();
      const res = await create(a, agentId, body({ input_diff: `${ONE_HUNK}+${'z'.repeat(250 * 1024)}\n` }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('diff_too_large');
    });
  });

  describe('tenancy (AC-29, AC-39)', () => {
    it("another workspace's agent and an unknown id are both 404, and no row appears", async () => {
      const a = await open();
      const foreignAgent = await newAgent(otherWs);
      const ghost = '00000000-0000-0000-0000-000000000000';
      const before = (await pg.handle.db.select().from(t.evalCases)).length;

      for (const id of [foreignAgent, ghost]) {
        const res = await create(a, id, body());
        expect(res.statusCode).toBe(404);
      }
      expect(await countCases(foreignAgent)).toBe(0);
      expect(await pg.handle.db.select().from(t.evalCases)).toHaveLength(before);
    });

    it('PATCH of a case that lives in another workspace is 404 and leaves it unchanged', async () => {
      const a = await open();
      const foreignAgent = await newAgent(otherWs);
      const service = makeService();
      const theirs = await service.createManualCase(otherWs, foreignAgent, {
        name: 'theirs',
        input_diff: ONE_HUNK,
        expectation: EXPECT,
      });

      const res = await patch(a, theirs.id, { input_diff: FAR_HUNK, name: 'hijacked' });
      expect(res.statusCode).toBe(404);
      expect(await service.getCase(otherWs, theirs.id)).toEqual(theirs);
    });

    it('a caller from another workspace cannot PATCH a case of the owner', async () => {
      const a = await open();
      const agentId = await newAgent();
      const mine = (await create(a, agentId, body())).json();
      const service = makeService();

      await expect(
        service.updateCase(otherWs, mine.id, { input_diff: FAR_HUNK }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(await getCase(a, mine.id)).toEqual(mine);
    });
  });

  describe('update a manual case (AC-35, AC-37, AC-38)', () => {
    it('stores a new diff (CRLF normalised) and new meta (AC-35)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();

      const crlf = '+++ b/src/config.ts\r\n@@ -1,2 +1,3 @@\r\n x\r\n+y\r\n z\r\n';
      const res = await patch(a, created.id, {
        input_diff: crlf,
        input_meta: { title: 'New title', body: 'New body' },
      });
      expect(res.statusCode).toBe(200);

      const after = await getCase(a, created.id);
      expect(after.input_diff).toBe(buildCaseDiff(FILE, '@@ -1,2 +1,3 @@\n x\n+y\n z'));
      expect(after.input_diff).not.toContain('\r');
      expect(after.input_meta).toEqual({ pr_number: null, title: 'New title', body: 'New body' });
      expect(after.origin).toBe('manual');
    });

    it('a meta-only edit keeps the diff, and an empty body becomes no body', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      const res = await patch(a, created.id, { input_meta: { title: 'Only meta', body: '' } });
      expect(res.statusCode).toBe(200);
      const after = res.json();
      expect(after.input_diff).toBe(created.input_diff);
      expect(after.input_meta).toEqual({ pr_number: null, title: 'Only meta', body: null });
    });

    it.each([
      ['diff_unparseable', '+++ b/src/config.ts\n+x\n'],
      ['multi_file_diff', `${ONE_HUNK}+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n+y\n`],
      ['diff_too_large', `${ONE_HUNK}+${'z'.repeat(250 * 1024)}\n`],
    ])('a bad diff on PATCH answers %s and changes nothing (AC-37)', async (code, diff) => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      const before = await getCase(a, created.id);

      const res = await patch(a, created.id, { input_diff: diff, name: 'renamed' });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe(code);
      expect(await getCase(a, created.id)).toEqual(before);
    });

    it('a diff for another path with no expectation sent is file_mismatch (AC-38)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      const res = await patch(a, created.id, { input_diff: OTHER_FILE });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('file_mismatch');
      expect(await getCase(a, created.id)).toEqual(created);
    });

    it('hunks moved away from the stored range are range_outside_hunks (AC-38)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      const res = await patch(a, created.id, { input_diff: FAR_HUNK });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_hunks');
      expect(await getCase(a, created.id)).toEqual(created);
    });

    it('moving the diff and the expectation together is accepted (AC-38)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      const res = await patch(a, created.id, {
        input_diff: OTHER_FILE,
        expectation: { kind: 'must_not_flag', file: 'src/other.ts', start_line: 2, end_line: 2 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().expectation).toEqual({
        kind: 'must_not_flag',
        file: 'src/other.ts',
        start_line: 2,
        end_line: 2,
      });
    });

    it('an expectation edit is checked against the stored diff (AC-38)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const created = (await create(a, agentId, body())).json();
      const res = await patch(a, created.id, { expectation: { ...EXPECT, start_line: 40, end_line: 40 } });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_hunks');
      expect(await getCase(a, created.id)).toEqual(created);
    });
  });

  describe('a finding-born case keeps its input (AC-36, AC-42)', () => {
    it('answers diff_frozen for a diff or meta edit, and nothing changes (AC-36)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const id = await addFindingCase(agentId);
      const before = await getCase(a, id);
      expect(before.origin).toBe('finding');

      const withDiff = await patch(a, id, {
        name: 'renamed',
        expectation: { ...EXPECT, kind: 'must_not_flag' },
        input_diff: ONE_HUNK,
      });
      expect(withDiff.statusCode).toBe(422);
      expect(withDiff.json().error.code).toBe('diff_frozen');

      const withMeta = await patch(a, id, { input_meta: { title: 'x', body: null } });
      expect(withMeta.statusCode).toBe(422);
      expect(withMeta.json().error.code).toBe('diff_frozen');

      expect(await getCase(a, id)).toEqual(before);
    });

    it('still takes a name, notes and expectation edit', async () => {
      const a = await open();
      const agentId = await newAgent();
      const id = await addFindingCase(agentId);
      const res = await patch(a, id, { name: 'renamed', expectation: { ...EXPECT, kind: 'must_not_flag' } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: 'renamed', origin: 'finding' });
    });

    it('a case inserted the SPEC-04 way reports origin "finding" with source and labels (AC-42)', async () => {
      const a = await open();
      const agentId = await newAgent();
      const id = await addFindingCase(agentId);
      const c = await getCase(a, id);
      expect(c.origin).toBe('finding');
      expect(c.source).toMatchObject({ pr_number: 9, repo: 'acme/manual-cases' });
      expect(c.labels).toMatchObject({ severity: 'CRITICAL', category: 'security' });
    });

    it('every seeded case reports origin "finding" with source and labels (AC-42)', async () => {
      const a = await open();
      const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.workspaceId, workspaceId));
      const seededAgents = new Set(
        (
          await pg.handle.db.select().from(t.agents).where(eq(t.agents.name, 'Security Reviewer'))
        ).map((r) => r.id),
      );
      const seeded = rows.filter((r) => seededAgents.has(r.agentId));
      expect(seeded.length).toBeGreaterThanOrEqual(8);

      for (const agentId of seededAgents) {
        const list = (await a.inject({ method: 'GET', url: `/agents/${agentId}/eval/cases` })).json() as {
          origin: string;
          source: unknown;
          labels: unknown;
        }[];
        for (const c of list) {
          expect(c.origin).toBe('finding');
          expect(c.source).not.toBeNull();
          expect(c.labels).not.toBeNull();
        }
      }
    });
  });

  describe('counted everywhere (AC-43, AC-48)', () => {
    it('2 finding-born + 1 manual = 3 in the list, a run, the overview and the dashboard (AC-43)', async () => {
      const stub = gatedStub();
      const a = await open(stub);
      const agentId = await newAgent();
      await addFindingCase(agentId, 'first');
      await addFindingCase(agentId, 'second');
      const manual = await create(a, agentId, body());
      expect(manual.statusCode).toBe(201);

      const list = (await a.inject({ method: 'GET', url: `/agents/${agentId}/eval/cases` })).json();
      expect(list).toHaveLength(3);

      const started = await a.inject({ method: 'POST', url: `/agents/${agentId}/eval/runs` });
      expect(started.statusCode).toBe(202);
      expect(started.json().cases_total).toBe(3);

      stub.releaseAll();
      const run = await waitFor(async () => {
        const r = (await a.inject({ method: 'GET', url: `/eval/runs/${started.json().run_id}` })).json();
        return r.status === 'completed' ? r : undefined;
      });
      expect(run.cases_total).toBe(3);
      expect(run.outcomes).toHaveLength(3);
      expect(run.outcomes.map((o: { case_name: string }) => o.case_name)).toContain('manual-case');

      const overview = (await a.inject({ method: 'GET', url: '/eval/overview' })).json() as {
        agent_id: string;
        cases_total: number;
      }[];
      expect(overview.find((r) => r.agent_id === agentId)!.cases_total).toBe(3);

      const dashboard = (await a.inject({ method: 'GET', url: `/agents/${agentId}/eval/dashboard` })).json();
      expect(dashboard.cases_total).toBe(3);
    });

    it('a case created mid-run leaves that run unchanged (AC-48)', async () => {
      const stub = gatedStub();
      const a = await open(stub);
      const agentId = await newAgent();
      await addFindingCase(agentId, 'only');

      const started = (await a.inject({ method: 'POST', url: `/agents/${agentId}/eval/runs` })).json();
      await waitFor(async () => stub.calls.length > 0);

      const mid = await create(a, agentId, body({ name: 'created-mid-run' }));
      expect(mid.statusCode).toBe(201);

      stub.releaseAll();
      const run = await waitFor(async () => {
        const r = (await a.inject({ method: 'GET', url: `/eval/runs/${started.run_id}` })).json();
        return r.status === 'completed' ? r : undefined;
      });
      expect(run.cases_total).toBe(1);
      expect(run.outcomes.map((o: { case_name: string }) => o.case_name)).toEqual(['only']);
      expect(stub.calls).toHaveLength(1);

      const list = (await a.inject({ method: 'GET', url: `/agents/${agentId}/eval/cases` })).json();
      expect(list).toHaveLength(2);
    });
  });

  describe('size (NFR-6)', () => {
    it('a 200 KB diff and 200 KB of title + body in one request answers 201', async () => {
      const a = await open();
      const agentId = await newAgent();

      // The hunk header must declare enough lines for the expectation on line 2 to sit inside it.
      const header = '+++ b/src/config.ts\n@@ -1,2100 +1,2100 @@\n';
      const line = `+${'z'.repeat(99)}\n`;
      let diff = header;
      while (Buffer.byteLength(diff + line, 'utf8') <= EVAL_CASE_MAX_BYTES) diff += line;
      expect(Buffer.byteLength(diff, 'utf8')).toBeLessThanOrEqual(EVAL_CASE_MAX_BYTES);
      expect(Buffer.byteLength(diff, 'utf8')).toBeGreaterThan(EVAL_CASE_MAX_BYTES - 200);

      const half = EVAL_CASE_MAX_BYTES / 2;
      const title = 'T'.repeat(half);
      const prBody = 'B'.repeat(half);
      const res = await create(
        a,
        agentId,
        body({ input_diff: diff, input_meta: { title, body: prBody } }),
      );
      expect(res.statusCode).toBe(201);
      const created = res.json();
      expect(created.input_meta.title).toHaveLength(half);
      expect(created.input_meta.body).toHaveLength(half);
      expect(await countCases(agentId)).toBe(1);
    });
  });
});
