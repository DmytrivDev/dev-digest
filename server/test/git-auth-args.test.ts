/**
 * What `SimpleGitClient` hands to git for authentication — asserted on the
 * options/args passed to `simple-git`, no network and no real git. The token
 * must reach every network command as a per-command, github.com-scoped header
 * (never in the URL), must not reach local-only commands, and must not leak
 * through an error message.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Call {
  opts: unknown;
  method: string;
  args: unknown[];
}
const calls: Call[] = [];
let originUrl = 'https://github.com/acme/app.git';
let failWith: Error | undefined;

vi.mock('simple-git', () => ({
  simpleGit: (opts: unknown) => {
    const record =
      (method: string, result: unknown = '') =>
      async (...args: unknown[]) => {
        calls.push({ opts, method, args });
        if (failWith && (method === 'fetch' || method === 'clone')) throw failWith;
        if (method === 'raw' && (args[0] as string[])[0] === 'config') return originUrl;
        return result;
      };
    return {
      clone: record('clone'),
      fetch: record('fetch'),
      reset: record('reset'),
      raw: record('raw'),
      revparse: record('revparse', 'abc123\n'),
    };
  },
}));

const { SimpleGitClient } = await import('../src/adapters/git/simple-git.js');

const TOKEN = 'ghp_SUPER_SECRET_TOKEN_123';
const BASIC = Buffer.from(`x-access-token:${TOKEN}`).toString('base64');
const HEADER = `http.https://github.com/.extraHeader=Authorization: Basic ${BASIC}`;
const repo = { owner: 'acme', name: 'app' };

const configOf = (c: Call): string[] => (c.opts as { config?: string[] }).config ?? [];
const named = (method: string) => calls.filter((c) => c.method === method);

describe('SimpleGitClient — per-command authentication', () => {
  let cloneDir: string;
  let client: InstanceType<typeof SimpleGitClient>;

  beforeEach(async () => {
    calls.length = 0;
    originUrl = 'https://github.com/acme/app.git';
    failWith = undefined;
    cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-auth-args-'));
    client = new SimpleGitClient(cloneDir, async () => TOKEN);
    return async () => rm(cloneDir, { recursive: true, force: true });
  });

  it('clone: the token travels as a github.com-scoped header and the URL stays clean', async () => {
    await client.clone(repo, `https://x-access-token:${TOKEN}@github.com/acme/app.git`, { depth: 1 });
    const [clone] = named('clone');
    expect(configOf(clone!)).toEqual([HEADER]);
    expect(clone!.args[0]).toBe('https://github.com/acme/app.git');
    expect(JSON.stringify(clone!.args)).not.toContain(TOKEN);
  });

  it('clone from a clean URL takes the token from the provider', async () => {
    await client.clone(repo, 'https://github.com/acme/app.git');
    expect(configOf(named('clone')[0]!)).toEqual([HEADER]);
  });

  it('sync fetches with the header, then resets locally without it', async () => {
    await client.sync(repo, 'main');
    const [fetch] = named('fetch');
    expect(fetch!.args[0]).toEqual(['origin', 'main', '--depth', '50']);
    expect(configOf(fetch!)).toEqual([HEADER]);
    for (const local of [...named('reset'), ...named('revparse')]) {
      expect(configOf(local)).toEqual([]);
    }
  });

  it('fetchPullHead fetches the PR ref with the header', async () => {
    await client.fetchPullHead(repo, 7);
    const [fetch] = named('fetch');
    expect(fetch!.args[0]).toEqual(['origin', 'pull/7/head:pr-7']);
    expect(configOf(fetch!)).toEqual([HEADER]);
  });

  it('re-clone of an existing clone fetches with the header', async () => {
    await mkdir(join(cloneDir, 'acme', 'app', '.git'), { recursive: true });
    await client.clone(repo, 'https://github.com/acme/app.git');
    expect(named('clone')).toHaveLength(0);
    expect(configOf(named('fetch')[0]!)).toEqual([HEADER]);
  });

  it('resets a credentialed origin to the clean URL BEFORE fetching', async () => {
    originUrl = `https://x-access-token:${TOKEN}@github.com/acme/app.git`;
    await client.sync(repo, 'main');
    const order = calls.map((c) => `${c.method}:${JSON.stringify(c.args[0])}`);
    const setUrl = order.indexOf('raw:["remote","set-url","origin","https://github.com/acme/app.git"]');
    expect(setUrl).toBeGreaterThanOrEqual(0);
    expect(setUrl).toBeLessThan(order.findIndex((o) => o.startsWith('fetch:')));
  });

  it('does not rewrite an origin that is already clean', async () => {
    await client.sync(repo, 'main');
    expect(calls.some((c) => c.method === 'raw' && (c.args[0] as string[])[1] === 'set-url')).toBe(false);
  });

  it('sends no header without a token, and none to a non-GitHub remote', async () => {
    const anon = new SimpleGitClient(cloneDir);
    await anon.sync(repo, 'main');
    expect(configOf(named('fetch')[0]!)).toEqual([]);

    calls.length = 0;
    originUrl = 'https://gitlab.example.com/acme/app.git';
    await client.sync(repo, 'main');
    expect(configOf(named('fetch')[0]!)).toEqual([]);
  });

  it('a failing git command never leaks the token (raw, base64 or as URL userinfo) in its error', async () => {
    failWith = new Error(
      `fatal: unable to access 'https://x-access-token:${TOKEN}@github.com/acme/app.git/': ${BASIC} ${TOKEN}`,
    );
    const err = await client.sync(repo, 'main').then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBe(failWith);
    expect(err!.message).not.toContain(TOKEN);
    expect(err!.message).not.toContain(BASIC);
    expect(err!.stack ?? '').not.toContain(TOKEN);
  });
});
