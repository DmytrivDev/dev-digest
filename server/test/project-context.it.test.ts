/**
 * Project Context (SPEC-01) — document list, document read and agent / skill
 * attachments, end to end against a real Postgres and a REAL `SimpleGitClient`
 * over tmp clone directories. The GitHub client is a stub that throws on every
 * call: the whole module must work from the local clone alone (AC-9).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { GitHubClient } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

/** A GitHub client that fails every call — proves the module never needs GitHub (AC-9). */
const GITHUB_THAT_THROWS = new Proxy(
  {},
  {
    get: (_target, prop) => () => {
      throw new Error(`GitHub must not be called (${String(prop)})`);
    },
  },
) as GitHubClient;

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'ignore' },
  );
}

type Files = Record<string, string | Uint8Array>;

d('project context', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;
  let base: string;
  let cloneDir: string;
  let secretFile: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    base = await mkdtemp(join(tmpdir(), 'devdigest-pc-'));
    cloneDir = join(base, 'clones');
    secretFile = join(base, 'secret.md');
    await writeFile(secretFile, 'TOP SECRET OUTSIDE THE CLONE');

    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new SimpleGitClient(cloneDir), github: GITHUB_THAT_THROWS },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  /** A repo row plus (optionally) a real git clone on disk holding `files`. */
  async function makeRepo(
    files: Files = {},
    opts: { cloned?: boolean; onDisk?: boolean } = {},
  ) {
    const { cloned = true, onDisk = true } = opts;
    const name = `pc-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: cloned ? join(cloneDir, 'acme', name) : null,
      })
      .returning();
    const dir = join(cloneDir, 'acme', name);
    if (onDisk) {
      await mkdir(dir, { recursive: true });
      git(dir, 'init', '-q');
      git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
      git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
      await writeFiles(dir, files);
    }
    return { repo: repo!, dir };
  }

  async function writeFiles(dir: string, files: Files) {
    const entries = Object.entries(files);
    for (let i = 0; i < entries.length; i += 200) {
      await Promise.all(
        entries.slice(i, i + 200).map(async ([rel, content]) => {
          const abs = join(dir, rel);
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, content);
        }),
      );
    }
  }

  async function makeAgent(over: Partial<typeof t.agents.$inferInsert> = {}, ws = workspaceId) {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: ws,
        name: `agent-${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        systemPrompt: 'Review the diff.',
        ...over,
      })
      .returning();
    return agent!;
  }

  async function makeSkill(over: Partial<typeof t.skills.$inferInsert> = {}, ws = workspaceId) {
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: ws,
        name: `skill-${seq++}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'body',
        ...over,
      })
      .returning();
    return skill!;
  }

  const listUrl = (repoId: string) => `/repos/${repoId}/context`;
  const docUrl = (repoId: string, path: string) =>
    `/repos/${repoId}/context/doc?path=${encodeURIComponent(path)}`;

  // ================================================================ document list

  describe('GET /repos/:id/context', () => {
    it('returns exactly the included documents (AC-2, AC-3, AC-4, AC-9)', async () => {
      const { repo } = await makeRepo({
        'README.md': '# Readme', // 8 chars -> 2
        'docs/guide.markdown': '0123456789', // 10 chars -> 3
        'specs/auth/login.MD': '# Login',
        'server/INSIGHTS.md': 'insight',
        'b.md': 'b',
        'Zeta.md': 'Z', // not B.md: b.md/B.md collide on a case-insensitive FS
        'notes.txt': 'not a doc',
        'node_modules/pkg/README.md': 'x',
        'dist/out.md': 'x',
        'web/.next/n.md': 'x',
        'vendor/v.md': 'x',
      });
      const res = await app.inject({ method: 'GET', url: listUrl(repo.id) });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        repo_id: repo.id,
        branch: 'main',
        total: 6,
        truncated: false,
      });
      expect(body.docs.map((x: { path: string }) => x.path).sort()).toEqual([
        'README.md',
        'Zeta.md',
        'b.md',
        'docs/guide.markdown',
        'server/INSIGHTS.md',
        'specs/auth/login.MD',
      ]);
    });

    it('lists the documents in code-point order with name, folder, category, tokens', async () => {
      const { repo } = await makeRepo({
        'README.md': '# Readme',
        'docs/guide.markdown': '0123456789',
        'specs/auth/login.MD': '# Login',
        'server/INSIGHTS.md': 'insight',
        'b.md': 'b',
        'Zeta.md': 'Z', // not B.md: b.md/B.md collide on a case-insensitive FS
        'notes.txt': 'not a doc',
        'node_modules/pkg/README.md': 'x',
        'dist/out.md': 'x',
        'web/.next/n.md': 'x',
        'vendor/v.md': 'x',
      });
      const res = await app.inject({ method: 'GET', url: listUrl(repo.id) });
      const { docs } = res.json() as {
        docs: { path: string; name: string; folder: string; category: string; approx_tokens: number }[];
      };
      expect(docs.map((x) => x.path)).toEqual([
        'README.md',
        'Zeta.md',
        'b.md',
        'docs/guide.markdown',
        'server/INSIGHTS.md',
        'specs/auth/login.MD',
      ]);
      expect(docs.find((x) => x.path === 'docs/guide.markdown')).toEqual({
        path: 'docs/guide.markdown',
        name: 'guide.markdown',
        folder: 'docs',
        category: 'docs',
        approx_tokens: 3,
      });
      expect(docs.find((x) => x.path === 'README.md')).toMatchObject({ folder: '', approx_tokens: 2 });
      expect(docs.find((x) => x.path === 'server/INSIGHTS.md')!.category).toBe('insights');
      expect(docs.find((x) => x.path === 'specs/auth/login.MD')!.category).toBe('specs');
    });

    it('caps at 500 and reports total + truncated (AC-5)', async () => {
      const files: Files = {};
      for (let i = 0; i < 501; i++) files[`docs/${String(i).padStart(4, '0')}.md`] = 'x';
      const { repo } = await makeRepo(files);
      const body = (await app.inject({ method: 'GET', url: listUrl(repo.id) })).json();
      expect(body.docs).toHaveLength(500);
      expect(body.total).toBe(501);
      expect(body.truncated).toBe(true);
      expect(body.docs[0].path).toBe('docs/0000.md');
    });

    it('leaves out a symlink whose target is outside the clone (AC-8)', async (ctx) => {
      const { repo, dir } = await makeRepo({ 'docs/ok.md': 'fine' });
      try {
        await symlink(secretFile, join(dir, 'docs', 'x.md'), 'file');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      const body = (await app.inject({ method: 'GET', url: listUrl(repo.id) })).json();
      expect(body.docs.map((x: { path: string }) => x.path)).toEqual(['docs/ok.md']);
    });

    it('409 repo_not_cloned when clone_path is null (AC-18)', async () => {
      const { repo } = await makeRepo({}, { cloned: false, onDisk: false });
      const res = await app.inject({ method: 'GET', url: listUrl(repo.id) });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('repo_not_cloned');
    });

    it('409 repo_not_cloned when the clone directory is gone (AC-18)', async () => {
      const { repo } = await makeRepo({}, { cloned: true, onDisk: false });
      const res = await app.inject({ method: 'GET', url: listUrl(repo.id) });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('repo_not_cloned');
    });

    it('lists 500 of 10,000 files in under 3 s (NFR-1)', async () => {
      const files: Files = {};
      for (let i = 0; i < 9500; i++) files[`src/gen/f${i}.ts`] = 'x';
      for (let i = 0; i < 500; i++) files[`docs/d${String(i).padStart(3, '0')}.md`] = 'doc';
      const { repo } = await makeRepo(files);
      const started = performance.now();
      const res = await app.inject({ method: 'GET', url: listUrl(repo.id) });
      const elapsed = performance.now() - started;
      expect(res.statusCode).toBe(200);
      expect(res.json().docs).toHaveLength(500);
      expect(elapsed).toBeLessThan(3000);
    }, 120_000);
  });

  // ================================================================ document read

  describe('GET /repos/:id/context/doc', () => {
    it('returns the full text and the used-by count (AC-14)', async () => {
      const { repo } = await makeRepo({ 'docs/a.md': '# Title\nbody text' });
      const res = await app.inject({ method: 'GET', url: docUrl(repo.id, 'docs/a.md') });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ path: 'docs/a.md', content: '# Title\nbody text', used_by_agents: 0 });
    });

    it('counts direct agents plus agents of ENABLED linked skills, ignoring agent.enabled (AC-14)', async () => {
      const { repo } = await makeRepo({ 'docs/a.md': 'x' });
      const direct = await makeAgent({ enabled: false }); // agent's own enabled flag is ignored
      const viaEnabled = await makeAgent();
      const viaDisabled = await makeAgent();
      const enabledSkill = await makeSkill({ enabled: true });
      const disabledSkill = await makeSkill({ enabled: false });
      await pg.handle.db.insert(t.agentSkills).values([
        { agentId: viaEnabled.id, skillId: enabledSkill.id, order: 0 },
        { agentId: viaDisabled.id, skillId: disabledSkill.id, order: 0 },
        // the direct agent is ALSO linked to the enabled skill: still counted once
        { agentId: direct.id, skillId: enabledSkill.id, order: 0 },
      ]);
      await pg.handle.db.insert(t.agentContextDocs).values({
        agentId: direct.id,
        repoId: repo.id,
        path: 'docs/a.md',
        position: 0,
      });
      await pg.handle.db.insert(t.skillContextDocs).values([
        { skillId: enabledSkill.id, repoId: repo.id, path: 'docs/a.md', position: 0 },
        { skillId: disabledSkill.id, repoId: repo.id, path: 'docs/a.md', position: 0 },
      ]);
      const res = await app.inject({ method: 'GET', url: docUrl(repo.id, 'docs/a.md') });
      expect(res.json().used_by_agents).toBe(2);
    });

    it('404 doc_not_found for a missing path (AC-72)', async () => {
      const { repo } = await makeRepo({ 'docs/a.md': 'x' });
      const res = await app.inject({ method: 'GET', url: docUrl(repo.id, 'docs/nope.md') });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('doc_not_found');
    });

    it('404 doc_not_found for a symlink that resolves outside the clone (AC-72)', async (ctx) => {
      const { repo, dir } = await makeRepo({ 'docs/ok.md': 'fine' });
      try {
        await symlink(secretFile, join(dir, 'docs', 'x.md'), 'file');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      const res = await app.inject({ method: 'GET', url: docUrl(repo.id, 'docs/x.md') });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('doc_not_found');
      expect(res.body).not.toContain('TOP SECRET');
    });

    it('422 unreadable for a binary .md (AC-73)', async () => {
      const { repo } = await makeRepo({
        'docs/bin.md': Uint8Array.from([0x23, 0x00, 0xff, 0xfe]),
        'docs/latin1.md': Uint8Array.from([0xe9, 0xe8, 0x41]),
      });
      for (const p of ['docs/bin.md', 'docs/latin1.md']) {
        const res = await app.inject({ method: 'GET', url: docUrl(repo.id, p) });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('unreadable');
      }
    });

    it('422 invalid_path for a traversal or a non-markdown path (AC-70)', async () => {
      const { repo } = await makeRepo({ 'docs/a.md': 'x' });
      for (const p of ['../a.md', '/etc/passwd.md', 'docs/a.txt', 'https://x.test/a.md', '']) {
        const res = await app.inject({ method: 'GET', url: docUrl(repo.id, p) });
        expect(res.statusCode, p).toBe(422);
        expect(res.json().error.code, p).toBe('invalid_path');
      }
    });

    it('409 repo_not_cloned when there is no clone (AC-18)', async () => {
      const { repo } = await makeRepo({}, { cloned: false, onDisk: false });
      const res = await app.inject({ method: 'GET', url: docUrl(repo.id, 'docs/a.md') });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('repo_not_cloned');
    });

    it('422 when the path query is absent', async () => {
      const { repo } = await makeRepo();
      const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/doc` });
      expect(res.statusCode).toBe(422);
    });
  });

  // ================================================================ attachments

  describe('agent attachments', () => {
    const post = (agentId: string, payload: unknown) =>
      app.inject({ method: 'POST', url: `/agents/${agentId}/context-docs`, payload: payload as object });
    const get = (agentId: string, repoId: string) =>
      app.inject({ method: 'GET', url: `/agents/${agentId}/context-docs?repo_id=${repoId}` });

    it('replaces the whole ordered set, reads it back in order (AC-32)', async () => {
      const { repo } = await makeRepo({ 'a.md': '12345678', 'b.md': '1234', 'c.md': 'c' });
      const agent = await makeAgent();
      const first = await post(agent.id, { repo_id: repo.id, paths: ['a.md', 'c.md'] });
      expect(first.statusCode).toBe(200);
      expect(first.json().attached.map((x: { path: string }) => x.path)).toEqual(['a.md', 'c.md']);

      const second = await post(agent.id, { repo_id: repo.id, paths: ['b.md', 'a.md'] });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual({
        repo_id: repo.id,
        attached: [
          { path: 'b.md', present: true, approx_tokens: 1 },
          { path: 'a.md', present: true, approx_tokens: 2 },
        ],
        inherited: [],
      });
      expect((await get(agent.id, repo.id)).json().attached.map((x: { path: string }) => x.path)).toEqual([
        'b.md',
        'a.md',
      ]);
    });

    it('an empty paths list clears the set', async () => {
      const { repo } = await makeRepo({ 'a.md': 'a' });
      const agent = await makeAgent();
      await post(agent.id, { repo_id: repo.id, paths: ['a.md'] });
      const res = await post(agent.id, { repo_id: repo.id, paths: [] });
      expect(res.statusCode).toBe(200);
      expect(res.json().attached).toEqual([]);
    });

    it('keeps sets of different repos apart', async () => {
      const a = await makeRepo({ 'a.md': 'a' });
      const b = await makeRepo({ 'b.md': 'b' });
      const agent = await makeAgent();
      await post(agent.id, { repo_id: a.repo.id, paths: ['a.md'] });
      await post(agent.id, { repo_id: b.repo.id, paths: ['b.md'] });
      expect((await get(agent.id, a.repo.id)).json().attached).toHaveLength(1);
      expect((await get(agent.id, b.repo.id)).json().attached[0].path).toBe('b.md');
    });

    it('a failing validation leaves the stored set unchanged (AC-32, AC-70)', async () => {
      const { repo } = await makeRepo({ 'a.md': 'a', 'c.md': 'c' });
      const agent = await makeAgent();
      await post(agent.id, { repo_id: repo.id, paths: ['a.md', 'c.md'] });

      const bad = await post(agent.id, { repo_id: repo.id, paths: ['b.md', '../x.md'] });
      expect(bad.statusCode).toBe(422);
      expect(bad.json().error.code).toBe('invalid_path');
      expect((await get(agent.id, repo.id)).json().attached.map((x: { path: string }) => x.path)).toEqual([
        'a.md',
        'c.md',
      ]);
    });

    it('rejects 501 paths and a duplicated path, set unchanged (AC-71)', async () => {
      const { repo } = await makeRepo({ 'a.md': 'a', 'c.md': 'c' });
      const agent = await makeAgent();
      await post(agent.id, { repo_id: repo.id, paths: ['a.md', 'c.md'] });

      const tooMany = await post(agent.id, {
        repo_id: repo.id,
        paths: Array.from({ length: 501 }, (_, i) => `docs/${i}.md`),
      });
      expect(tooMany.statusCode).toBe(422);
      const dup = await post(agent.id, { repo_id: repo.id, paths: ['a.md', 'a.md'] });
      expect(dup.statusCode).toBe(422);

      expect((await get(agent.id, repo.id)).json().attached.map((x: { path: string }) => x.path)).toEqual([
        'a.md',
        'c.md',
      ]);
    });

    it('422 when the repo_id query is missing on GET', async () => {
      const agent = await makeAgent();
      const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/context-docs` });
      expect(res.statusCode).toBe(422);
    });

    it('marks an attached file missing from the clone as present:false (AC-35)', async () => {
      const { repo } = await makeRepo({ 'a.md': 'a' });
      const agent = await makeAgent();
      await post(agent.id, { repo_id: repo.id, paths: ['a.md', 'gone.md'] });
      expect((await get(agent.id, repo.id)).json().attached).toEqual([
        { path: 'a.md', present: true, approx_tokens: 1 },
        { path: 'gone.md', present: false, approx_tokens: null },
      ]);
    });

    it('an undecodable attachment is present with no estimate; with no clone all are absent', async () => {
      const { repo } = await makeRepo({ 'bin.md': Uint8Array.from([0x00, 0x01]) });
      const agent = await makeAgent();
      await post(agent.id, { repo_id: repo.id, paths: ['bin.md'] });
      expect((await get(agent.id, repo.id)).json().attached).toEqual([
        { path: 'bin.md', present: true, approx_tokens: null },
      ]);

      const noClone = await makeRepo({}, { cloned: false, onDisk: false });
      await post(agent.id, { repo_id: noClone.repo.id, paths: ['x.md'] });
      const res = await get(agent.id, noClone.repo.id);
      expect(res.statusCode).toBe(200);
      expect(res.json().attached).toEqual([{ path: 'x.md', present: false, approx_tokens: null }]);
    });

    it('lists paths inherited from ENABLED linked skills only, attributed to the first (AC-40)', async () => {
      const { repo } = await makeRepo({ 'own.md': 'own', 's1.md': 's1', 'shared.md': 'sh', 's2.md': 's2' });
      const agent = await makeAgent();
      const s1 = await makeSkill({ name: 'First' });
      const s2 = await makeSkill({ name: 'Second' });
      const off = await makeSkill({ name: 'Off', enabled: false });
      await pg.handle.db.insert(t.agentSkills).values([
        { agentId: agent.id, skillId: s1.id, order: 0 },
        { agentId: agent.id, skillId: s2.id, order: 1 },
        { agentId: agent.id, skillId: off.id, order: 2 },
      ]);
      await pg.handle.db.insert(t.skillContextDocs).values([
        { skillId: s1.id, repoId: repo.id, path: 's1.md', position: 0 },
        { skillId: s1.id, repoId: repo.id, path: 'shared.md', position: 1 },
        { skillId: s2.id, repoId: repo.id, path: 'shared.md', position: 0 },
        { skillId: s2.id, repoId: repo.id, path: 's2.md', position: 1 },
        { skillId: s2.id, repoId: repo.id, path: 'own.md', position: 2 },
        { skillId: off.id, repoId: repo.id, path: 'off.md', position: 0 },
      ]);
      await post(agent.id, { repo_id: repo.id, paths: ['own.md'] });

      const body = (await get(agent.id, repo.id)).json();
      expect(body.attached.map((x: { path: string }) => x.path)).toEqual(['own.md']);
      expect(body.inherited).toEqual([
        { path: 's1.md', present: true, approx_tokens: 1, skill_id: s1.id, skill_name: 'First' },
        { path: 'shared.md', present: true, approx_tokens: 1, skill_id: s1.id, skill_name: 'First' },
        { path: 's2.md', present: true, approx_tokens: 1, skill_id: s2.id, skill_name: 'Second' },
      ]);
    });

    it('does not bump the version or write a version row (AC-68)', async () => {
      const { repo } = await makeRepo({ 'a.md': 'a' });
      const agent = await makeAgent();
      const versionsBefore = await pg.handle.db
        .select()
        .from(t.agentVersions)
        .where(eq(t.agentVersions.agentId, agent.id));

      await post(agent.id, { repo_id: repo.id, paths: ['a.md'] });
      await post(agent.id, { repo_id: repo.id, paths: [] });

      const [after] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
      const versionsAfter = await pg.handle.db
        .select()
        .from(t.agentVersions)
        .where(eq(t.agentVersions.agentId, agent.id));
      expect(after!.version).toBe(agent.version);
      expect(versionsAfter).toHaveLength(versionsBefore.length);
    });
  });

  describe('skill attachments', () => {
    const post = (skillId: string, payload: unknown) =>
      app.inject({ method: 'POST', url: `/skills/${skillId}/context-docs`, payload: payload as object });
    const get = (skillId: string, repoId: string) =>
      app.inject({ method: 'GET', url: `/skills/${skillId}/context-docs?repo_id=${repoId}` });

    it('replaces the ordered set and reads it back (AC-32, AC-35)', async () => {
      const { repo } = await makeRepo({ 'a.md': 'abcd', 'c.md': 'c' });
      const skill = await makeSkill();
      await post(skill.id, { repo_id: repo.id, paths: ['a.md', 'c.md'] });
      const res = await post(skill.id, { repo_id: repo.id, paths: ['c.md', 'a.md', 'gone.md'] });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        repo_id: repo.id,
        attached: [
          { path: 'c.md', present: true, approx_tokens: 1 },
          { path: 'a.md', present: true, approx_tokens: 1 },
          { path: 'gone.md', present: false, approx_tokens: null },
        ],
      });
      expect((await get(skill.id, repo.id)).json().attached).toHaveLength(3);
    });

    it('rejects an invalid path, 501 paths and duplicates; set unchanged (AC-70, AC-71)', async () => {
      const { repo } = await makeRepo({ 'a.md': 'a' });
      const skill = await makeSkill();
      await post(skill.id, { repo_id: repo.id, paths: ['a.md'] });

      const invalid = await post(skill.id, { repo_id: repo.id, paths: ['../x.md'] });
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json().error.code).toBe('invalid_path');
      expect((await post(skill.id, { repo_id: repo.id, paths: ['a.md', 'a.md'] })).statusCode).toBe(422);
      expect(
        (
          await post(skill.id, {
            repo_id: repo.id,
            paths: Array.from({ length: 501 }, (_, i) => `d/${i}.md`),
          })
        ).statusCode,
      ).toBe(422);
      expect((await get(skill.id, repo.id)).json().attached.map((x: { path: string }) => x.path)).toEqual([
        'a.md',
      ]);
    });

    it('does not bump the version or write a version row (AC-68)', async () => {
      const { repo } = await makeRepo({ 'a.md': 'a' });
      const skill = await makeSkill();
      const before = await pg.handle.db
        .select()
        .from(t.skillVersions)
        .where(eq(t.skillVersions.skillId, skill.id));
      await post(skill.id, { repo_id: repo.id, paths: ['a.md'] });
      const [after] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
      const versionsAfter = await pg.handle.db
        .select()
        .from(t.skillVersions)
        .where(eq(t.skillVersions.skillId, skill.id));
      expect(after!.version).toBe(skill.version);
      expect(versionsAfter).toHaveLength(before.length);
    });
  });

  // ================================================================ tenancy

  describe('another workspace (AC-69)', () => {
    it('404s every route, revealing no path or content', async () => {
      // A foreign workspace with its own repo, agent and skill (with a row each).
      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
      const [foreignRepo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: other!.id, owner: 'evil', name: 'r', fullName: 'evil/r', clonePath: null })
        .returning();
      const foreignAgent = await makeAgent({}, other!.id);
      const foreignSkill = await makeSkill({}, other!.id);
      await pg.handle.db.insert(t.agentContextDocs).values({
        agentId: foreignAgent.id,
        repoId: foreignRepo!.id,
        path: 'foreign-secret-path.md',
        position: 0,
      });
      await pg.handle.db.insert(t.skillContextDocs).values({
        skillId: foreignSkill.id,
        repoId: foreignRepo!.id,
        path: 'foreign-secret-path.md',
        position: 0,
      });

      // And our own, to combine with the foreign ids.
      const own = await makeRepo({ 'a.md': 'a' });
      const ownAgent = await makeAgent();
      const ownSkill = await makeSkill();
      const payload = (repoId: string) => ({ repo_id: repoId, paths: ['a.md'] });

      const requests = [
        { method: 'GET', url: listUrl(foreignRepo!.id) },
        { method: 'GET', url: docUrl(foreignRepo!.id, 'a.md') },
        // foreign agent / skill with a repo of ours
        { method: 'GET', url: `/agents/${foreignAgent.id}/context-docs?repo_id=${own.repo.id}` },
        { method: 'POST', url: `/agents/${foreignAgent.id}/context-docs`, payload: payload(own.repo.id) },
        { method: 'GET', url: `/skills/${foreignSkill.id}/context-docs?repo_id=${own.repo.id}` },
        { method: 'POST', url: `/skills/${foreignSkill.id}/context-docs`, payload: payload(own.repo.id) },
        // our agent / skill with a foreign repo
        { method: 'GET', url: `/agents/${ownAgent.id}/context-docs?repo_id=${foreignRepo!.id}` },
        { method: 'POST', url: `/agents/${ownAgent.id}/context-docs`, payload: payload(foreignRepo!.id) },
        { method: 'GET', url: `/skills/${ownSkill.id}/context-docs?repo_id=${foreignRepo!.id}` },
        { method: 'POST', url: `/skills/${ownSkill.id}/context-docs`, payload: payload(foreignRepo!.id) },
      ] as const;

      for (const r of requests) {
        const res = await app.inject(r as Parameters<typeof app.inject>[0]);
        expect(res.statusCode, `${r.method} ${r.url}`).toBe(404);
        expect(res.body).not.toContain('foreign-secret-path');
      }

      // A rejected save wrote nothing.
      const rows = await pg.handle.db
        .select()
        .from(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, ownAgent.id)));
      expect(rows).toEqual([]);
    });
  });
});
