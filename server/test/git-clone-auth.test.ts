/**
 * The GitHub PAT must never persist in `<clone>/.git/config` (a symlinked doc, a
 * backup or a log could otherwise leak it), yet private clone / resync / PR-head
 * fetch must keep authenticating. Real git, no network: `github.com` is
 * redirected to a local repo with `url.<base>.insteadOf` in a throwaway global
 * config, so the adapter sees an ordinary `https://github.com/...` remote.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const TOKEN = 'ghp_SUPER_SECRET_TOKEN_123';
const repo = { owner: 'acme', name: 'app' };
const CLEAN_URL = 'https://github.com/acme/app.git';
const AUTHED_URL = `https://x-access-token:${TOKEN}@github.com/acme/app.git`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  ).trim();
}

describe('SimpleGitClient — credentials never persist in the clone', () => {
  let base: string;
  let upstream: string;
  let cloneDir: string;
  let client: SimpleGitClient;
  const saved = {
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
  };

  const config = () => readFile(join(cloneDir, 'acme', 'app', '.git', 'config'), 'utf8');
  const originUrl = () => git(join(cloneDir, 'acme', 'app'), 'config', '--get', 'remote.origin.url');

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'devdigest-clone-auth-'));
    upstream = join(base, 'upstream');
    cloneDir = join(base, 'clones');
    await mkdir(upstream, { recursive: true });
    git(upstream, 'init', '-b', 'main');
    await writeFile(join(upstream, 'README.md'), '# one');
    git(upstream, 'add', '.');
    git(upstream, 'commit', '-m', 'one');

    const globalConfig = join(base, 'gitconfig');
    await writeFile(
      globalConfig,
      `[url "${pathToFileURL(upstream).href}"]\n\tinsteadOf = ${CLEAN_URL}\n`,
    );
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    client = new SimpleGitClient(cloneDir, async () => TOKEN);
  });
  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(base, { recursive: true, force: true });
  });

  it('a clone whose URL carries the token leaves a credential-free remote', async () => {
    await client.clone(repo, AUTHED_URL, { depth: 1 });
    expect(originUrl()).toBe(CLEAN_URL);
    expect(await config()).not.toContain(TOKEN);
    expect(await config()).not.toContain('x-access-token');
  });

  it('a clone from a clean URL (token from the provider) leaves a credential-free remote', async () => {
    await rm(join(cloneDir, 'acme', 'app'), { recursive: true, force: true });
    await client.clone(repo, CLEAN_URL, { depth: 1 });
    expect(originUrl()).toBe(CLEAN_URL);
    expect(await config()).not.toContain(TOKEN);
  });

  it('sync advances HEAD and leaves no credentials in the clone config', async () => {
    await writeFile(join(upstream, 'README.md'), '# two');
    git(upstream, 'commit', '-am', 'two');
    const expected = git(upstream, 'rev-parse', 'HEAD');

    const { head } = await client.sync(repo, 'main');

    expect(head).toBe(expected);
    expect(originUrl()).toBe(CLEAN_URL);
    expect(await config()).not.toContain(TOKEN);
  });

  it('a pre-fix clone (token in remote.origin.url) is scrubbed by the next sync, which still fetches', async () => {
    const dir = join(cloneDir, 'acme', 'app');
    git(dir, 'remote', 'set-url', 'origin', AUTHED_URL);
    expect(await config()).toContain(TOKEN); // the legacy state

    await writeFile(join(upstream, 'README.md'), '# three');
    git(upstream, 'commit', '-am', 'three');
    const { head } = await client.sync(repo, 'main');

    expect(head).toBe(git(upstream, 'rev-parse', 'HEAD'));
    expect(originUrl()).toBe(CLEAN_URL);
    expect(await config()).not.toContain(TOKEN);
  });

  it('fetchPullHead also scrubs a credentialed origin before fetching', async () => {
    const dir = join(cloneDir, 'acme', 'app');
    git(dir, 'remote', 'set-url', 'origin', AUTHED_URL);
    // upstream has no refs/pull/1/head, so the fetch itself fails — the scrub
    // must still have happened, and the failure must not echo the token.
    const err = await client.fetchPullHead(repo, 1).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).not.toContain(TOKEN);
    expect(originUrl()).toBe(CLEAN_URL);
    expect(await config()).not.toContain(TOKEN);
  });
});
