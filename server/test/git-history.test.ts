/**
 * `SimpleGitClient.commitDate` / `commitTouches` / `fetchHistorySince` — the history
 * port behind the Onboarding Tour's file hotness. Real git in tmp dirs, no DB.
 * Origins are cloned through `file:///` URLs: a plain path ignores `--depth`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const repo = { owner: 'acme', name: 'app' };
const TOKEN = 'tok-SECRET-123';
const SPACED = 'dir with space/é ü.txt';

/** Runs git in `cwd`, optionally with a fixed committer/author date. */
function git(cwd: string, args: string[], date?: string): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
      },
    },
  );
}

async function commit(dir: string, file: string, text: string, date: string): Promise<string> {
  await mkdir(join(dir, file, '..'), { recursive: true });
  await writeFile(join(dir, file), text);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', `c ${date}`], date);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

describe('SimpleGitClient — history port', () => {
  let base: string;
  let origin: string;
  let originUrl: string;
  let shas: string[];
  let cloneDir: string;
  let client: SimpleGitClient;
  let clone: string;

  async function freshShallowClone(): Promise<void> {
    await rm(join(base, 'clones'), { recursive: true, force: true });
    await mkdir(join(cloneDir, repo.owner), { recursive: true });
    clone = join(cloneDir, repo.owner, repo.name);
    git(cloneDir, ['clone', '-q', '--depth', '1', '--branch', 'main', originUrl, clone]);
  }

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'devdigest-githistory-'));
    origin = join(base, 'origin');
    await mkdir(origin, { recursive: true });
    originUrl = pathToFileURL(origin).href;
    git(origin, ['init', '-q', '-b', 'main']);
    shas = [
      await commit(origin, 'old.txt', 'old', '2026-01-01T00:00:00Z'),
      await commit(origin, 'a.ts', 'a1', '2026-03-01T00:00:00Z'),
      await commit(origin, 'a.ts', 'a2', '2026-04-01T00:00:00Z'),
      await commit(origin, SPACED, 'sp', '2026-05-01T00:00:00Z'),
    ];
    cloneDir = join(base, 'clones');
    client = new SimpleGitClient(cloneDir, async () => TOKEN);
    await freshShallowClone();
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('a depth-1 clone reports a single commit flagged as the shallow boundary', async () => {
    const touches = await client.commitTouches(repo, 'HEAD', { maxCount: 100 });
    expect(touches).toHaveLength(1);
    expect(touches[0]!.sha).toBe(shas[3]);
    expect(touches[0]!.boundary).toBe(true);
    expect(touches[0]!.parents).toEqual([]);
  });

  it('returns paths with spaces and non-ASCII characters verbatim', async () => {
    const [first] = await client.commitTouches(repo, 'HEAD', { maxCount: 1 });
    // the boundary commit "adds" every file of the tree
    expect(first!.files).toContain(SPACED);
    expect(first!.files).toContain('old.txt');
  });

  it('fetchHistorySince deepens the window and leaves HEAD, index and worktree alone', async () => {
    await freshShallowClone();
    const headBefore = git(clone, ['rev-parse', 'HEAD']).trim();
    const contentBefore = await readFile(join(clone, 'a.ts'), 'utf8');

    await client.fetchHistorySince(repo, '2026-03-15T00:00:00Z', 'main', { timeoutMs: 60_000 });

    const touches = await client.commitTouches(repo, 'HEAD', { maxCount: 100 });
    // in-window commits only: 2026-05-01 and 2026-04-01
    expect(touches.map((t) => t.sha)).toEqual([shas[3], shas[2]]);
    expect(touches[0]!.boundary).toBe(false);
    expect(touches[1]!.boundary).toBe(true); // the oldest in-window commit is the new boundary
    expect(touches[0]!.files).toEqual([SPACED]);
    // a boundary commit "adds" the whole tree it carries — which is why callers must not count it
    expect([...touches[1]!.files].sort()).toEqual(['a.ts', 'old.txt']);

    expect(git(clone, ['rev-parse', 'HEAD']).trim()).toBe(headBefore);
    expect(git(clone, ['status', '--porcelain']).trim()).toBe('');
    expect(await readFile(join(clone, 'a.ts'), 'utf8')).toBe(contentBefore);
  });

  it('writes no credential into the clone', async () => {
    await freshShallowClone();
    await client.fetchHistorySince(repo, '2026-03-15T00:00:00Z', 'main', { timeoutMs: 60_000 });
    const config = await readFile(join(clone, '.git', 'config'), 'utf8');
    expect(config).not.toContain(TOKEN);
    expect(config).not.toContain(Buffer.from(`x-access-token:${TOKEN}`).toString('base64'));
    expect(config).not.toContain('extraHeader');
    expect(git(clone, ['config', '--get', 'remote.origin.url'])).not.toContain(TOKEN);
    // no partial-clone state either (no --filter)
    expect(config).not.toContain('partialclonefilter');
  });

  it('rejects when the origin is unreachable', async () => {
    await freshShallowClone();
    git(clone, ['remote', 'set-url', 'origin', pathToFileURL(join(base, 'nonexistent')).href]);
    await expect(
      client.fetchHistorySince(repo, '2026-03-15T00:00:00Z', 'main', { timeoutMs: 60_000 }),
    ).rejects.toThrow();
  });

  it('rejects with code ETIMEDOUT when the deadline passes first', async () => {
    await freshShallowClone();
    await expect(
      client.fetchHistorySince(repo, '2026-03-15T00:00:00Z', 'main', { timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: 'ETIMEDOUT' });
  });

  it('refuses an option-like ref or since instead of handing it to git', async () => {
    await expect(
      client.fetchHistorySince(repo, '2026-03-15T00:00:00Z', '--upload-pack=x', { timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(
      client.fetchHistorySince(repo, '--depth=1', 'main', { timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('a fully cloned repo has no boundary commit — its root commit is a real root', async () => {
    const full = new SimpleGitClient(join(base, 'full'));
    await mkdir(join(base, 'full', repo.owner), { recursive: true });
    git(base, ['clone', '-q', originUrl, join(base, 'full', repo.owner, repo.name)]);
    const touches = await full.commitTouches(repo, 'HEAD', { maxCount: 100 });
    expect(touches.map((t) => t.sha)).toEqual([...shas].reverse());
    const root = touches[touches.length - 1]!;
    expect(root.parents).toEqual([]);
    expect(root.boundary).toBe(false);
    expect(touches.every((t) => !t.boundary)).toBe(true);
  });

  it('commitDate returns the committer date and rejects an unknown sha', async () => {
    const date = await client.commitDate(repo, shas[3]!);
    expect(new Date(date).getTime()).toBe(Date.parse('2026-05-01T00:00:00Z'));
    await expect(client.commitDate(repo, '0'.repeat(40))).rejects.toThrow();
  });
});
