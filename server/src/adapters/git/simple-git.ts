import { simpleGit, type SimpleGit } from 'simple-git';
import { isAbsolute, join, relative, sep } from 'node:path';
import { mkdir, readFile, readdir, realpath, access, rm, stat, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/** Resolves the GitHub PAT at call time (never cached here), `undefined` when none is configured. */
export type GitTokenProvider = () => Promise<string | undefined>;

/** Host whose HTTPS remotes get the token; any other host is fetched unauthenticated. */
const AUTH_HOST = 'github.com';
/** Basic-auth username GitHub expects for a token. */
const TOKEN_USERNAME = 'x-access-token';

/**
 * Directories whose contents are never a project document. `.git` holds the
 * clone's own `config`; the rest mirrors the Project Context excluded dirs
 * (kept here so the adapter imports nothing from `modules/`).
 */
const DOC_EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  'vendor',
]);
const GIT_ONLY: ReadonlySet<string> = new Set(['.git']);
const MARKDOWN_EXT = /\.(md|markdown)$/i;

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  /**
   * `getToken` supplies the GitHub PAT for network commands only. It is handed to
   * git per command (`-c http.<host>.extraHeader`) and is never written to the
   * clone's `.git/config` nor embedded in a remote URL.
   */
  constructor(
    private cloneDir: string,
    private getToken?: GitTokenProvider,
  ) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await this.authedFetch(repo, []);
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    // Defence in depth: a caller that still embeds credentials in the URL gets
    // them moved to the per-command header, so they never land in `.git/config`.
    const { url: cleanUrl, token: embedded } = splitCredentials(url);
    const token = embedded ?? (await this.getToken?.());
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await redactingErrors(token, () =>
      simpleGit({ baseDir: this.cloneDir, config: authConfig(cleanUrl, token) }).clone(
        cleanUrl,
        dest,
        args,
      ),
    );
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.authedFetch(repo, ['origin', `pull/${n}/head:pr-${n}`]);
  }

  /**
   * Every network fetch goes through here: first drop any credentials a pre-fix
   * clone left in `remote.origin.url`, then fetch with the token supplied for
   * this one command only.
   */
  private async authedFetch(repo: RepoRef, args: string[]): Promise<void> {
    const dir = this.clonePathFor(repo);
    const token = await this.getToken?.();
    await redactingErrors(token, async () => {
      const remote = await this.scrubOrigin(dir);
      await simpleGit({ baseDir: dir, config: authConfig(remote, token) }).fetch(args);
    });
  }

  /**
   * Resets `origin` to its credential-free URL when it carries any (clones made
   * before the token moved out of the URL) and returns that clean URL.
   */
  private async scrubOrigin(dir: string): Promise<string | undefined> {
    const g = simpleGit(dir);
    let current: string;
    try {
      current = (await g.raw(['config', '--get', 'remote.origin.url'])).trim();
    } catch {
      return undefined; // no origin — the fetch will report it
    }
    const { url: clean } = splitCredentials(current);
    if (clean !== current) await g.raw(['remote', 'set-url', 'origin', clean]);
    return clean;
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    await this.authedFetch(repo, ['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    const g = this.git(repo);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  /**
   * Resolves `path` to the real file it lands on and proves that file is INSIDE
   * the clone. The path is checked where it really lands, not just as text: a
   * symlink committed to the repo (`docs/spec.md -> ~/.devdigest/secrets.json`)
   * passes any text-only gate, and `readFile` follows it. Resolving both ends
   * with `realpath` closes that. Missing file → `ENOENT`; outside → `EOUTSIDECLONE`.
   *
   * "Inside" excludes the clone's own `.git` directory: it holds `config`, which
   * is repo-controlled data a symlink can point at (`docs/a.md -> ../.git/config`).
   * With `docsOnly` the target must additionally avoid every document-excluded
   * dir, and a symlink must land on a markdown file.
   */
  private async resolveInside(
    repo: RepoRef,
    path: string,
    opts?: { docsOnly?: boolean },
  ): Promise<string> {
    const root = await realpath(this.clonePathFor(repo));
    const lexical = join(root, path);
    const target = await realpath(lexical);
    if (!isInside(root, target) || hasSegment(root, target, GIT_ONLY)) throw outsideClone();
    if (opts?.docsOnly) {
      if (hasSegment(root, target, DOC_EXCLUDED_DIRS)) throw outsideClone();
      if ((await lstat(lexical)).isSymbolicLink() && !MARKDOWN_EXT.test(target)) {
        throw outsideClone();
      }
    }
    return target;
  }

  /** Reads a file INSIDE the clone as UTF-8 text (see `resolveInside`). */
  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(await this.resolveInside(repo, path), 'utf8');
  }

  /** Raw bytes of a file INSIDE the clone — same guard as `readFile`. */
  async readFileBytes(repo: RepoRef, path: string): Promise<Uint8Array> {
    return readFile(await this.resolveInside(repo, path, { docsOnly: true }));
  }

  /**
   * Every regular file of the working tree, as `/`-separated relative paths.
   * Directories are walked with `withFileTypes` (no per-entry stat); a symlink
   * entry reports `isSymbolicLink()` only, so it is resolved with `realpath` —
   * listed only when it lands on a markdown file inside the clone, outside `.git`
   * and the excluded dirs. Symlinked
   * directories are never followed, which also rules out cycles.
   */
  async listFiles(repo: RepoRef, opts?: { excludeDirs?: readonly string[] }): Promise<string[]> {
    const root = await realpath(this.clonePathFor(repo)); // ENOENT when not cloned
    const skip = new Set<string>(['.git', ...(opts?.excludeDirs ?? [])]);
    const out: string[] = [];
    const stack: { abs: string; rel: string }[] = [{ abs: root, rel: '' }];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of await readdir(dir.abs, { withFileTypes: true })) {
        const rel = dir.rel === '' ? entry.name : `${dir.rel}/${entry.name}`;
        const abs = join(dir.abs, entry.name);
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) stack.push({ abs, rel });
        } else if (entry.isFile()) {
          out.push(rel);
        } else if (entry.isSymbolicLink()) {
          try {
            const target = await realpath(abs);
            if (
              isInside(root, target) &&
              !hasSegment(root, target, skip) &&
              MARKDOWN_EXT.test(target) &&
              (await stat(target)).isFile()
            ) {
              out.push(rel);
            }
          } catch {
            // dangling or unreadable link — not a document
          }
        }
      }
    }
    return out;
  }

  /** Branch HEAD points at; the literal `HEAD` when detached. `ENOENT` when not cloned. */
  async currentBranch(repo: RepoRef): Promise<string> {
    const dir = this.clonePathFor(repo);
    if (!(await this.exists(dir))) {
      throw Object.assign(new Error(`no clone at ${dir}`), { code: 'ENOENT' });
    }
    return (await this.git(repo).revparse(['--abbrev-ref', 'HEAD'])).trim();
  }
}

/** True when `target` is a strict descendant of `root` (both already real paths). */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !(rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

/** True when any path segment of `target` (relative to `root`) is in `names` (case-insensitive). */
function hasSegment(root: string, target: string, names: ReadonlySet<string>): boolean {
  const lower = new Set([...names].map((n) => n.toLowerCase()));
  return relative(root, target)
    .split(sep)
    .some((seg) => lower.has(seg.toLowerCase()));
}

/** Splits `user:pass@` off an http(s) URL. Non-URLs (ssh form) pass through untouched. */
function splitCredentials(url: string): { url: string; token?: string } {
  try {
    const u = new URL(url);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && (u.username || u.password)) {
      const token = decodeURIComponent(u.password || u.username);
      u.username = '';
      u.password = '';
      return { url: u.toString(), token: token || undefined };
    }
  } catch {
    /* not a URL (e.g. git@github.com:owner/repo.git) */
  }
  return { url };
}

/**
 * `-c` config granting the token to github.com over HTTPS for ONE git command.
 * Scoped to the host (`http.<url>.extraHeader`) so a redirect elsewhere never
 * receives it; empty when there is no token or the remote is not GitHub HTTPS.
 */
function authConfig(remoteUrl: string | undefined, token: string | undefined): string[] {
  if (!token || !remoteUrl) return [];
  try {
    const u = new URL(remoteUrl);
    if (u.protocol !== 'https:' || u.hostname !== AUTH_HOST) return [];
  } catch {
    return [];
  }
  const basic = Buffer.from(`${TOKEN_USERNAME}:${token}`).toString('base64');
  return [`http.https://${AUTH_HOST}/.extraHeader=Authorization: Basic ${basic}`];
}

/** Runs `fn`; any error leaves with the token (raw, base64, or as URL userinfo) scrubbed out. */
async function redactingErrors<T>(token: string | undefined, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error) {
      const secrets = token
        ? [token, Buffer.from(`${TOKEN_USERNAME}:${token}`).toString('base64')]
        : [];
      const scrub = (text: string): string =>
        secrets
          .reduce((acc, secret) => acc.split(secret).join('***'), text)
          .replace(/(https?:\/\/)[^@\s/]+@/g, '$1***@');
      err.message = scrub(err.message);
      if (err.stack) err.stack = scrub(err.stack);
    }
    throw err;
  }
}

function outsideClone(): Error {
  return Object.assign(new Error('path resolves outside the repository clone'), {
    code: 'EOUTSIDECLONE',
  });
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
