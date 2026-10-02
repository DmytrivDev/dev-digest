/**
 * `SimpleGitClient.listFiles` / `readFileBytes` / `currentBranch` — the
 * Project Context port. Tmp dirs only (a real `git init` for the branch cases),
 * no DB. Symlink cases skip where the OS refuses to create one (Windows
 * without Developer Mode reports EPERM), as git-read-file.test.ts does.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const repo = { owner: 'acme', name: 'app' };
const EXCLUDE = ['node_modules', 'dist', '.next', 'vendor'] as const;

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'ignore' },
  );
}

describe('SimpleGitClient — Project Context port', () => {
  let base: string;
  let clone: string;
  let client: SimpleGitClient;
  let secret: string;
  const BINARY = Uint8Array.from([0x00, 0xff, 0xfe, 0x41, 0x80]);

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'devdigest-listfiles-'));
    clone = join(base, 'clones', 'acme', 'app');
    for (const d of ['docs', 'specs/auth', 'node_modules/pkg', 'dist', '.next', 'vendor/x']) {
      await mkdir(join(clone, d), { recursive: true });
    }
    await writeFile(join(clone, 'README.md'), '# Readme');
    await writeFile(join(clone, 'docs', 'guide.md'), '# Guide');
    await writeFile(join(clone, 'specs', 'auth', 'login.MARKDOWN'), '# Login');
    await writeFile(join(clone, 'node_modules', 'pkg', 'readme.md'), 'x');
    await writeFile(join(clone, 'dist', 'out.md'), 'x');
    await writeFile(join(clone, '.next', 'n.md'), 'x');
    await writeFile(join(clone, 'vendor', 'x', 'v.md'), 'x');
    await writeFile(join(clone, 'docs', 'binary.md'), BINARY);
    secret = join(base, 'secrets.json');
    await writeFile(secret, '{"key":"sk_live_xxx"}');
    client = new SimpleGitClient(join(base, 'clones'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  describe('listFiles', () => {
    it('lists regular files as /-separated relative paths and prunes excluded directories', async () => {
      const files = await client.listFiles(repo, { excludeDirs: EXCLUDE });
      expect([...files].sort()).toEqual([
        'README.md',
        'docs/binary.md',
        'docs/guide.md',
        'specs/auth/login.MARKDOWN',
      ]);
    });

    it('without excludeDirs only .git is skipped', async () => {
      await mkdir(join(clone, '.git'), { recursive: true });
      await writeFile(join(clone, '.git', 'hidden.md'), 'x');
      try {
        const files = await client.listFiles(repo);
        expect(files).toContain('node_modules/pkg/readme.md');
        expect(files).not.toContain('.git/hidden.md');
      } finally {
        await rm(join(clone, '.git'), { recursive: true, force: true });
      }
    });

    it('omits a symlinked file that points outside the clone, lists one that points inside', async (ctx) => {
      const outside = join(clone, 'docs', 'evil.md');
      const inside = join(clone, 'docs', 'alias.md');
      try {
        await symlink(secret, outside, 'file');
        await symlink(join(clone, 'README.md'), inside, 'file');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      try {
        const files = await client.listFiles(repo, { excludeDirs: EXCLUDE });
        expect(files).not.toContain('docs/evil.md');
        expect(files).toContain('docs/alias.md');
      } finally {
        await rm(outside, { force: true });
        await rm(inside, { force: true });
      }
    });

    it('omits symlinks into .git and symlinks to non-markdown files, even though they are inside the clone', async (ctx) => {
      await mkdir(join(clone, '.git'), { recursive: true });
      await writeFile(join(clone, '.git', 'config'), '[remote "origin"]\n\turl = https://x:TOKEN@github.com/a/b');
      await writeFile(join(clone, '.git', 'note.md'), 'inside .git');
      await writeFile(join(clone, 'package.json'), '{}');
      const links = {
        cfg: join(clone, 'docs', 'cfg.md'), // -> .git/config (no .md target, .git segment)
        note: join(clone, 'docs', 'gitnote.md'), // -> .git/note.md (.md target, .git segment)
        json: join(clone, 'docs', 'notmd.md'), // -> package.json (inside, not markdown)
      };
      try {
        await symlink(join(clone, '.git', 'config'), links.cfg, 'file');
        await symlink(join(clone, '.git', 'note.md'), links.note, 'file');
        await symlink(join(clone, 'package.json'), links.json, 'file');
      } catch (err) {
        await rm(join(clone, '.git'), { recursive: true, force: true });
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      try {
        const files = await client.listFiles(repo, { excludeDirs: EXCLUDE });
        expect(files).not.toContain('docs/cfg.md');
        expect(files).not.toContain('docs/gitnote.md');
        expect(files).not.toContain('docs/notmd.md');
        // a regular file is unaffected
        expect(files).toContain('docs/guide.md');
      } finally {
        for (const l of Object.values(links)) await rm(l, { force: true });
        await rm(join(clone, '.git'), { recursive: true, force: true });
        await rm(join(clone, 'package.json'), { force: true });
      }
    });

    it('never follows a symlinked directory', async (ctx) => {
      const link = join(clone, 'docs', 'linked-dir');
      try {
        await symlink(join(clone, 'specs'), link, 'dir');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      try {
        const files = await client.listFiles(repo, { excludeDirs: EXCLUDE });
        expect(files.some((p) => p.startsWith('docs/linked-dir'))).toBe(false);
      } finally {
        await rm(link, { force: true, recursive: true });
      }
    });

    it('rejects ENOENT when the clone directory does not exist', async () => {
      await expect(client.listFiles({ owner: 'acme', name: 'missing' })).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });
  });

  describe('readFileBytes', () => {
    it('returns the raw bytes of a binary file', async () => {
      const bytes = await client.readFileBytes(repo, 'docs/binary.md');
      expect(Array.from(bytes)).toEqual(Array.from(BINARY));
    });

    it('missing file → ENOENT', async () => {
      await expect(client.readFileBytes(repo, 'docs/nope.md')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('refuses a ../ escape', async () => {
      await expect(client.readFileBytes(repo, '../../../secrets.json')).rejects.toMatchObject({
        code: 'EOUTSIDECLONE',
      });
    });

    it('refuses a symlink pointing outside the clone', async (ctx) => {
      const link = join(clone, 'docs', 'evil2.md');
      try {
        await symlink(secret, link, 'file');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      try {
        await expect(client.readFileBytes(repo, 'docs/evil2.md')).rejects.toMatchObject({
          code: 'EOUTSIDECLONE',
        });
      } finally {
        await rm(link, { force: true });
      }
    });
  });

  describe('readFileBytes / readFile — the clone .git directory and non-markdown symlink targets', () => {
    const TOKEN_CONFIG = '[remote "origin"]\n\turl = https://x-access-token:SECRET@github.com/a/b';

    it('refuses a direct read of .git/config (EOUTSIDECLONE) on both read paths', async () => {
      await mkdir(join(clone, '.git'), { recursive: true });
      await writeFile(join(clone, '.git', 'config'), TOKEN_CONFIG);
      try {
        await expect(client.readFileBytes(repo, '.git/config')).rejects.toMatchObject({
          code: 'EOUTSIDECLONE',
        });
        // readFile is the intent module's path and shares the guard
        await expect(client.readFile(repo, '.git/config')).rejects.toMatchObject({
          code: 'EOUTSIDECLONE',
        });
        await expect(client.readFileBytes(repo, 'docs/../.git/config')).rejects.toMatchObject({
          code: 'EOUTSIDECLONE',
        });
      } finally {
        await rm(join(clone, '.git'), { recursive: true, force: true });
      }
    });

    it('refuses a .md symlink that lands on .git/config, and one that lands on a non-markdown file', async (ctx) => {
      await mkdir(join(clone, '.git'), { recursive: true });
      await writeFile(join(clone, '.git', 'config'), TOKEN_CONFIG);
      await writeFile(join(clone, 'package.json'), '{}');
      const toGit = join(clone, 'docs', 'architecture.md');
      const toJson = join(clone, 'docs', 'spec.md');
      try {
        await symlink(join('..', '.git', 'config'), toGit, 'file'); // relative, as in the exploit
        await symlink(join(clone, 'package.json'), toJson, 'file');
      } catch (err) {
        await rm(join(clone, '.git'), { recursive: true, force: true });
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      try {
        await expect(client.readFileBytes(repo, 'docs/architecture.md')).rejects.toMatchObject({
          code: 'EOUTSIDECLONE',
        });
        await expect(client.readFile(repo, 'docs/architecture.md')).rejects.toMatchObject({
          code: 'EOUTSIDECLONE',
        });
        await expect(client.readFileBytes(repo, 'docs/spec.md')).rejects.toMatchObject({
          code: 'EOUTSIDECLONE',
        });
      } finally {
        await rm(toGit, { force: true });
        await rm(toJson, { force: true });
        await rm(join(clone, '.git'), { recursive: true, force: true });
        await rm(join(clone, 'package.json'), { force: true });
      }
    });

    it('still reads a .md symlink that lands on another markdown file inside the clone', async (ctx) => {
      const alias = join(clone, 'docs', 'alias-ok.md');
      try {
        await symlink(join(clone, 'README.md'), alias, 'file');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
        throw err;
      }
      try {
        const bytes = await client.readFileBytes(repo, 'docs/alias-ok.md');
        expect(new TextDecoder().decode(bytes)).toBe('# Readme');
      } finally {
        await rm(alias, { force: true });
      }
    });
  });

  describe('currentBranch', () => {
    const gitRepo = { owner: 'acme', name: 'gitted' };
    let gitDir: string;

    beforeAll(async () => {
      gitDir = join(base, 'clones', 'acme', 'gitted');
      await mkdir(gitDir, { recursive: true });
      await writeFile(join(gitDir, 'a.md'), '# a');
      git(gitDir, 'init', '-b', 'trunk');
      git(gitDir, 'add', '.');
      git(gitDir, 'commit', '-m', 'init');
    });

    it('returns the checked-out branch', async () => {
      await expect(client.currentBranch(gitRepo)).resolves.toBe('trunk');
    });

    it('returns the literal HEAD when detached', async () => {
      git(gitDir, 'checkout', '--detach');
      await expect(client.currentBranch(gitRepo)).resolves.toBe('HEAD');
    });

    it('rejects ENOENT when the clone directory does not exist', async () => {
      await expect(client.currentBranch({ owner: 'acme', name: 'missing' })).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });
  });
});
