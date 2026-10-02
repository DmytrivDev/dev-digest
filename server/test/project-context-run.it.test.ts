/**
 * Project Context (SPEC-01) at RUN time: attached documents are read from the
 * clone's current checkout, injected into the prompt as an untrusted block,
 * recorded in the trace (`specs_read`, `prompt_assembly.specs`) and explained in
 * the Run Log. Real Postgres + the full app; the git client and the LLM are the
 * deterministic mocks, so every case is model-free.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** Two changed files, so a `map-reduce` agent makes two model calls. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export { a };`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

const HEAD = 'deadbeefcafe';

interface TraceDoc {
  prompt_assembly: { user: string; specs: string | null };
  specs_read: string[];
  log: { msg: string }[];
}

d('project context at run time (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  }, 120_000);

  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  async function start(git: MockGitClient) {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git, llm: { openai: llm } },
    });
    apps.push(app);
    return { app, llm };
  }

  async function makeRepo(clonePath: string | null = '/mock/clones/acme/pc') {
    const name = `pc-run-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  async function makePr(repoId: string, prBase = 'main') {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1000 + seq++,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: prBase,
        headSha: 'a1b2c3d4',
        additions: 2,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: 'Add rate limiting.',
      })
      .returning();
    return pr!;
  }

  type App = Awaited<ReturnType<typeof start>>['app'];

  async function makeAgent(app: App, strategy: 'single-pass' | 'map-reduce' = 'single-pass') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `pc-agent-${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
        strategy,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function attach(app: App, agentId: string, repoId: string, paths: string[]) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context-docs`,
      payload: { repo_id: repoId, paths },
    });
    expect(res.statusCode).toBe(200);
  }

  /** Run one agent on one PR and return its persisted trace (+ run id). */
  async function review(app: App, prId: string, agentId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    await waitForRunTrace(pg.handle.db, runId);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as TraceDoc;
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    return { runId, trace, status: run!.status, log: trace.log.map((e) => e.msg) };
  }

  /** The full path: new repo + PR + agent + attachments, then a run. */
  async function scenario(opts: {
    git: MockGitClient;
    paths: string[];
    prBase?: string;
    clonePath?: string | null;
    strategy?: 'single-pass' | 'map-reduce';
  }) {
    const { app, llm } = await start(opts.git);
    const repo = await makeRepo(opts.clonePath === undefined ? '/mock/clones/acme/pc' : opts.clonePath);
    const pr = await makePr(repo.id, opts.prBase);
    const agent = await makeAgent(app, opts.strategy);
    await attach(app, agent.id, repo.id, opts.paths);
    const result = await review(app, pr.id, agent.id);
    return { app, llm, repo, pr, agent, ...result };
  }

  const reviewCalls = (llm: MockLLMProvider) =>
    llm.calls.filter(
      (c) =>
        c.method === 'completeStructured' &&
        (c.req as { schemaName?: string }).schemaName === 'Review',
    );
  const userMessage = (req: unknown) =>
    (req as { messages: { role: string; content: string }[] }).messages.find(
      (m) => m.role === 'user',
    )!.content;

  it('injects only the attachments of the PR repository (AC-46)', async () => {
    const git = new MockGitClient({
      diff: DIFF,
      head: HEAD,
      docs: { 'docs/a-only.md': 'TEXT-OF-REPO-A', 'docs/b-only.md': 'TEXT-OF-REPO-B' },
    });
    const { app } = await start(git);
    const repoA = await makeRepo();
    const repoB = await makeRepo();
    const agent = await makeAgent(app);
    await attach(app, agent.id, repoA.id, ['docs/a-only.md']);
    await attach(app, agent.id, repoB.id, ['docs/b-only.md']);

    const { trace } = await review(app, (await makePr(repoB.id)).id, agent.id);

    expect(trace.specs_read).toEqual(['docs/b-only.md']);
    expect(trace.prompt_assembly.specs).toContain('TEXT-OF-REPO-B');
    expect(trace.prompt_assembly.specs).not.toContain('TEXT-OF-REPO-A');
  });

  it('injects an enabled linked skill\'s documents after the agent\'s and ignores a disabled skill\'s (AC-47, AC-49)', async () => {
    const git = new MockGitClient({
      diff: DIFF,
      head: HEAD,
      docs: { 'own.md': 'OWN', 'viaskill.md': 'VIA-SKILL', 'off.md': 'VIA-DISABLED' },
    });
    const { app } = await start(git);
    const repo = await makeRepo();
    const agent = await makeAgent(app);
    const mkSkill = async (name: string, enabled: boolean, paths: string[]) => {
      const created = (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name, description: `Use ${name}.`, type: 'rubric', body: 'RULE', enabled, source: 'manual' },
        })
      ).json() as { id: string };
      const saved = await app.inject({
        method: 'POST',
        url: `/skills/${created.id}/context-docs`,
        payload: { repo_id: repo.id, paths },
      });
      expect(saved.statusCode).toBe(200);
      return created.id;
    };
    const on = await mkSkill(`pc-skill-on-${seq++}`, true, ['viaskill.md']);
    const off = await mkSkill(`pc-skill-off-${seq++}`, false, ['off.md']);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [on, off] },
    });
    await attach(app, agent.id, repo.id, ['own.md']);

    const { trace } = await review(app, (await makePr(repo.id)).id, agent.id);

    expect(trace.specs_read).toEqual(['own.md', 'viaskill.md']);
    expect(trace.prompt_assembly.specs).not.toContain('VIA-DISABLED');
  });

  it('reads the clone\'s CURRENT checkout: a doc changed between two runs shows the new text (AC-50)', async () => {
    const git = new MockGitClient({ diff: DIFF, head: HEAD, docs: { 'guide.md': 'VERSION-ONE' } });
    const { app } = await start(git);
    const repo = await makeRepo();
    const agent = await makeAgent(app);
    await attach(app, agent.id, repo.id, ['guide.md']);

    const first = await review(app, (await makePr(repo.id)).id, agent.id);
    git.setDoc('guide.md', 'VERSION-TWO');
    const second = await review(app, (await makePr(repo.id)).id, agent.id);

    expect(first.trace.prompt_assembly.specs).toContain('VERSION-ONE');
    expect(second.trace.prompt_assembly.specs).toContain('VERSION-TWO');
    expect(second.trace.prompt_assembly.specs).not.toContain('VERSION-ONE');
  });

  describe('base branch vs clone branch (AC-74)', () => {
    const docs = { 'spec.md': 'BASE-TEXT' };

    it('PR base release/1.x with clone branch main: injects the text and logs the exact line', async () => {
      const { trace, log } = await scenario({
        git: new MockGitClient({ diff: DIFF, head: HEAD, branch: 'main', docs }),
        paths: ['spec.md'],
        prBase: 'release/1.x',
      });
      expect(trace.prompt_assembly.specs).toContain('BASE-TEXT');
      expect(log).toContain(
        'project context: base branch release/1.x differs from clone branch main — documents read from main',
      );
    });

    it('PR base equal to the clone branch: no mismatch line', async () => {
      const { log } = await scenario({
        git: new MockGitClient({ diff: DIFF, head: HEAD, branch: 'main', docs }),
        paths: ['spec.md'],
        prBase: 'main',
      });
      expect(log.some((m) => m.includes('differs from clone branch'))).toBe(false);
    });

    it('clone branch master while repos.default_branch is main: the line names master', async () => {
      const { repo, log } = await scenario({
        git: new MockGitClient({ diff: DIFF, head: HEAD, branch: 'master', docs }),
        paths: ['spec.md'],
        prBase: 'main',
      });
      expect(repo.defaultBranch).toBe('main');
      expect(log).toContain(
        'project context: base branch main differs from clone branch master — documents read from master',
      );
    });
  });

  it('logs the clone checkout with branch and HEAD (AC-51)', async () => {
    const { log } = await scenario({
      git: new MockGitClient({ diff: DIFF, head: HEAD, branch: 'main', docs: { 'a.md': 'A' } }),
      paths: ['a.md'],
    });
    expect(log).toContain(`project context: read from clone checkout main @ ${HEAD}`);
  });

  it('skips deleted, binary and outside-the-clone documents with their exact lines (AC-56..AC-58)', async () => {
    const { trace, log } = await scenario({
      git: new MockGitClient({
        diff: DIFF,
        head: HEAD,
        docs: {
          'ok.md': 'FINE-TEXT',
          'bin.md': new Uint8Array([0x61, 0x00, 0x62]),
          'escape.md': 'SECRET-OUTSIDE',
        },
        outside: ['escape.md'],
      }),
      paths: ['ok.md', 'deleted.md', 'bin.md', 'escape.md'],
    });
    expect(log).toContain('project context: skipped deleted.md — missing');
    expect(log).toContain('project context: skipped bin.md — unreadable');
    expect(log).toContain('project context: skipped escape.md — outside_clone');
    expect(log).toContain('project context: 1 document(s) attached, 3 skipped');
    expect(trace.prompt_assembly.specs).toContain('FINE-TEXT');
    expect(trace.prompt_assembly.specs).not.toContain('SECRET-OUTSIDE');
    expect(trace.prompt_assembly.specs).not.toContain('bin.md');
    expect(trace.prompt_assembly.specs).not.toContain('deleted.md');
  });

  it('three attachments with one missing: "2 document(s) attached, 1 skipped" and specs_read excludes it (AC-61, AC-62)', async () => {
    const { trace, log } = await scenario({
      git: new MockGitClient({ diff: DIFF, head: HEAD, docs: { 'c.md': 'C', 'b.md': 'B' } }),
      paths: ['c.md', 'gone.md', 'b.md'],
    });
    expect(log).toContain('project context: 2 document(s) attached, 1 skipped');
    // Attachment order, skipped excluded — not path order.
    expect(trace.specs_read).toEqual(['c.md', 'b.md']);
  });

  it('a repository with no clone logs it and injects nothing (AC-59)', async () => {
    const { trace, log, status } = await scenario({
      git: new MockGitClient({ diff: DIFF, head: HEAD, docs: { 'a.md': 'A' } }),
      paths: ['a.md'],
      clonePath: null,
    });
    expect(status).toBe('done');
    expect(log).toContain('project context: skipped — repository not cloned');
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.specs_read).toEqual([]);
  });

  it('a clone that vanished from disk behaves like no clone (AC-59)', async () => {
    const { trace, log, status } = await scenario({
      git: new MockGitClient({ diff: DIFF, head: HEAD, docs: { 'a.md': 'A' }, notCloned: true }),
      paths: ['a.md'],
    });
    expect(status).toBe('done');
    expect(log).toContain('project context: skipped — repository not cloned');
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
  });

  it('every attachment failing still ends the run "done" with its findings persisted (AC-60)', async () => {
    const { app, pr, status, log, trace } = await scenario({
      git: new MockGitClient({
        diff: DIFF,
        head: HEAD,
        docs: { 'bin.md': new Uint8Array([0x00]), 'esc.md': 'x' },
        outside: ['esc.md'],
      }),
      paths: ['missing.md', 'bin.md', 'esc.md'],
    });
    expect(status).toBe('done');
    expect(log).toContain('project context: 0 document(s) attached, 3 skipped');
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].findings).toHaveLength(1);
  });

  it('injects a 200 KB document in full, byte for byte (AC-55)', async () => {
    const big = '# Big document\n' + 'A line of ordinary prose, with an é and a 4.\n'.repeat(4800);
    expect(big.length).toBeGreaterThan(200 * 1024);
    const { trace } = await scenario({
      git: new MockGitClient({ diff: DIFF, head: HEAD, docs: { 'big.md': big } }),
      paths: ['big.md'],
    });
    expect(trace.prompt_assembly.specs).toContain(big);
    expect(trace.prompt_assembly.user).toContain(big);
    expect(trace.specs_read).toEqual(['big.md']);
  });

  it('puts the same specs block in the user message of every model call, single-pass and map-reduce (AC-63)', async () => {
    const docs = { 'x.md': 'DOC-X', 'y.md': 'DOC-Y' };

    const single = await scenario({
      git: new MockGitClient({ diff: DIFF, head: HEAD, docs }),
      paths: ['x.md', 'y.md'],
      strategy: 'single-pass',
    });
    const singleCalls = reviewCalls(single.llm);
    expect(singleCalls).toHaveLength(1);
    expect(single.trace.prompt_assembly.specs).toBeTruthy();
    for (const c of singleCalls) {
      expect(userMessage(c.req)).toContain(single.trace.prompt_assembly.specs!);
    }
    expect(single.trace.prompt_assembly.user).toContain('## Project context');

    const mapped = await scenario({
      git: new MockGitClient({ diff: DIFF, head: HEAD, docs }),
      paths: ['x.md', 'y.md'],
      strategy: 'map-reduce',
    });
    const mappedCalls = reviewCalls(mapped.llm);
    expect(mappedCalls).toHaveLength(2);
    expect(mapped.trace.prompt_assembly.specs).toContain('### x.md');
    expect(mapped.trace.prompt_assembly.specs).toContain('### y.md');
    for (const c of mappedCalls) {
      expect(userMessage(c.req)).toContain(mapped.trace.prompt_assembly.specs!);
    }
  });

  it('an agent with nothing attached is untouched: no section, no lines, specs_read empty (A-1, AC-64)', async () => {
    const git = new MockGitClient({ diff: DIFF, head: HEAD, docs: { 'a.md': 'A' } });
    const { app } = await start(git);
    const repo = await makeRepo();
    const agent = await makeAgent(app);

    const { trace, log } = await review(app, (await makePr(repo.id)).id, agent.id);

    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
    expect(trace.specs_read).toEqual([]);
    expect(log.some((m) => m.startsWith('project context:'))).toBe(false);
  });

  it('never syncs, clones or fetches for project context (AC-75)', async () => {
    const git = new MockGitClient({ diff: DIFF, head: HEAD, docs: { 'a.md': 'A' } });
    const { app } = await start(git);
    const repo = await makeRepo();
    const bare = await makeAgent(app);
    const attached = await makeAgent(app);
    await attach(app, attached.id, repo.id, ['a.md']);
    const counts = () => ({
      syncs: git.syncs.length,
      cloned: git.cloned.length,
      fetchPullHeads: git.fetchPullHeads.length,
    });

    const before = counts();
    await review(app, (await makePr(repo.id)).id, bare.id);
    const afterBare = counts();
    await review(app, (await makePr(repo.id)).id, attached.id);
    const afterAttached = counts();

    const delta = (a: ReturnType<typeof counts>, b: ReturnType<typeof counts>) => ({
      syncs: b.syncs - a.syncs,
      cloned: b.cloned - a.cloned,
      fetchPullHeads: b.fetchPullHeads - a.fetchPullHeads,
    });
    expect(delta(afterBare, afterAttached)).toEqual(delta(before, afterBare));
    expect(delta(afterBare, afterAttached).syncs).toBe(0);
    expect(delta(afterBare, afterAttached).cloned).toBe(0);
  });
});
