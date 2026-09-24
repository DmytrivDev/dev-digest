/**
 * `SimpleGitClient.readFile` must only ever read INSIDE the clone. The path
 * gates upstream (`isSafeDocPath`) check the path as text; a symlink committed
 * to an imported repo passes them and `fs.readFile` follows it — so the
 * adapter resolves where the file really lands. Plain tmp dirs, no git, no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const repo = { owner: 'acme', name: 'app' };

describe('SimpleGitClient.readFile — stays inside the clone', () => {
  let base: string;
  let client: SimpleGitClient;
  let secret: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'devdigest-readfile-'));
    const clone = join(base, 'clones', 'acme', 'app');
    await mkdir(join(clone, 'docs'), { recursive: true });
    await writeFile(join(clone, 'docs', 'spec.md'), '# Spec');
    secret = join(base, 'secrets.json');
    await writeFile(secret, '{"key":"sk_live_xxx"}');
    client = new SimpleGitClient(join(base, 'clones'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('reads a regular file in the clone', async () => {
    await expect(client.readFile(repo, 'docs/spec.md')).resolves.toBe('# Spec');
  });

  it('refuses a symlink that points outside the clone', async (ctx) => {
    const link = join(base, 'clones', 'acme', 'app', 'docs', 'evil.md');
    try {
      await symlink(secret, link, 'file');
    } catch (err) {
      // Windows without Developer Mode cannot create symlinks — nothing to test.
      if ((err as NodeJS.ErrnoException).code === 'EPERM') return ctx.skip();
      throw err;
    }
    await expect(client.readFile(repo, 'docs/evil.md')).rejects.toMatchObject({ code: 'EOUTSIDECLONE' });
  });

  it('refuses a ../ escape even without a symlink', async () => {
    await expect(client.readFile(repo, '../../../secrets.json')).rejects.toMatchObject({
      code: 'EOUTSIDECLONE',
    });
  });

  it('a missing file is still ENOENT, so callers can tell "not there" from "not allowed"', async () => {
    await expect(client.readFile(repo, 'docs/nope.md')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
