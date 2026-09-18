#!/usr/bin/env node
/**
 * pr-self-review — phase 1: collect the change set and resolve the fan-out plan.
 *
 * Prints one JSON object to stdout and (unless --stdout) writes it to
 * .devdigest/cache/pr-self-review/plan.json. That directory is already covered by
 * `.devdigest/cache/` in .gitignore — deliberately, because a report written to a
 * TRACKED path would land in the very diff it just reviewed, and every later run
 * would review its own output.
 *
 * Exit 0 = plan produced (even when empty). Exit 2 = structured failure: it prints
 * {"error":…,"hint":…} and never a stack trace, so the orchestrator can turn a
 * collection failure into an INCOMPLETE verdict rather than crashing.
 *
 * Windows notes (the first two are recorded in server/INSIGHTS.md):
 *  - NO main-module guard. `import.meta.url === process.argv[1]` never matches here
 *    (argv[1] is `D:\…\x.mjs`, import.meta.url is `file:///D:/…`) and the script would
 *    silently no-op while exiting 0 — exactly how db:migrate/db:seed failed. Both other
 *    scripts in this repo are plain top-level code; this follows them.
 *  - Bind before indexing: every tokens[n] is checked, a malformed line is skipped.
 *  - execFileSync with an argv array, never a shell string: real filenames here contain
 *    spaces and parentheses ("DevDigest Design (standalone) (3).html").
 *  - -z NUL delimiters + core.quotepath=false, and buffer output decoded as utf8, because
 *    the 1 MB default maxBuffer throws on a large --numstat and the Windows OEM codepage
 *    mangles non-ASCII names.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'pr-self-review/diff-plan@1';
const SKILL_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MAX_FILE_BYTES = 256 * 1024;
const MAX_ADDED_LINES = 2000;
const BINARY_EXT =
  /\.(html?|png|jpe?g|gif|svg|ico|pdf|woff2?|ttf|eot|zip|gz|tgz|mp4|webm|webp|xlsx?|docx?)$/i;
const IGNORED_DIR = /(^|\/)(node_modules|dist|build|out|coverage|\.next|\.turbo)\//;
const LOCKFILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/;
const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e'];
/** Package -> manager, from each package's own lockfile. NOT a monorepo workspace. */
const MANAGER = { server: 'pnpm', client: 'pnpm', 'reviewer-core': 'npm', e2e: 'npm' };

function fail(error, hint) {
  process.stdout.write(JSON.stringify({ schema: SCHEMA, error, hint: hint ?? null }, null, 2));
  process.stdout.write('\n');
  process.exit(2);
}

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? fallback : v;
}
function flagAll(name) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== name) continue;
    const v = argv[i + 1];
    if (v !== undefined && !v.startsWith('--')) out.push(v);
  }
  return out;
}

const BASE_REF = flag('--base', 'origin/main');
const TO_STDOUT_ONLY = argv.includes('--stdout');
const FORCED_SKILLS = flagAll('--with');

// ---------------------------------------------------------------- git

let REPO_ROOT;
function git(args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
    cwd: REPO_ROOT ?? process.cwd(),
    // stderr ignored on purpose: on Windows every call otherwise emits a wall of
    // "LF will be replaced by CRLF" warnings that would drown the JSON on stdout.
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString('utf8');
}
function gitQuiet(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

try {
  REPO_ROOT = git(['rev-parse', '--show-toplevel']).trim();
} catch {
  fail('not a git repository', 'run this from inside the dev-digest checkout');
}

if (gitQuiet(['rev-parse', '--verify', '--quiet', BASE_REF]) === null) {
  fail(
    `base ref '${BASE_REF}' does not exist locally`,
    `git fetch origin main   (origin is YOUR FORK; never diff against upstream/main — docs/git-workflow.md)`,
  );
}

const mergeBase = (gitQuiet(['merge-base', BASE_REF, 'HEAD']) ?? '').trim();
if (!mergeBase) fail(`no merge base between HEAD and ${BASE_REF}`, 'git fetch origin main');

const branch = (gitQuiet(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '').trim();
const headSha = (gitQuiet(['rev-parse', 'HEAD']) ?? '').trim();
const porcelain = gitQuiet(['status', '--porcelain']) ?? '';
const dirtyHash = createHash('sha256').update(porcelain).digest('hex').slice(0, 16);

// Base staleness — reported, never acted on. A review script that silently does
// network I/O is a surprise, and a fetch failing offline would turn a code gate
// into an infrastructure gate.
const warnings = [];
const baseDateRaw = (gitQuiet(['log', '-1', '--format=%cI', BASE_REF]) ?? '').trim();
let staleHours = null;
if (baseDateRaw) {
  staleHours = Math.round((Date.now() - new Date(baseDateRaw).getTime()) / 36e5);
  if (staleHours > 24) {
    warnings.push(
      `${BASE_REF} was last updated ${staleHours}h ago — run \`git fetch origin main\` for an accurate base`,
    );
  }
}

// ---------------------------------------------------------------- collect

/** Split a NUL-delimited git payload, dropping the trailing empty token. */
const nulSplit = (s) => (s ? s.split('\0').filter((t) => t !== '') : []);

/**
 * Membership comes from ONE call: `git diff --name-status -M -z <BASE>` with no
 * `...HEAD`, which compares BASE against the WORKING TREE and therefore covers
 * committed + staged + unstaged together. The narrower forms below only annotate
 * `sources` for the report; they never add or remove a file.
 */
const files = new Map(); // path -> record

function record(path) {
  let f = files.get(path);
  if (!f) {
    f = {
      path,
      old_path: null,
      status: 'modified',
      sources: [],
      package: PACKAGES.find((p) => path.startsWith(`${p}/`)) ?? null,
      added: 0,
      removed: 0,
      binary: false,
      size_bytes: null,
      skipped: null,
      hunks: [],
      skills: [],
    };
    files.set(path, f);
  }
  return f;
}

const STATUS_WORD = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'renamed', T: 'modified' };

{
  const tokens = nulSplit(gitQuiet(['diff', '--name-status', '-M', '-z', mergeBase]) ?? '');
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i];
    if (!status) break;
    const kind = status[0];
    if (kind === 'R' || kind === 'C') {
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      i += 3;
      if (!oldPath || !newPath) continue;
      const f = record(newPath);
      f.status = 'renamed';
      f.old_path = oldPath;
    } else {
      const p = tokens[i + 1];
      i += 2;
      if (!p) continue;
      const f = record(p);
      f.status = STATUS_WORD[kind] ?? 'modified';
    }
  }
}

// numstat: added/removed counts and the binary marker ("-\t-\tpath")
{
  const tokens = nulSplit(gitQuiet(['diff', '--numstat', '-M', '-z', mergeBase]) ?? '');
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === undefined) break;
    const parts = tok.split('\t');
    if (parts.length < 3) {
      i += 1;
      continue;
    }
    const [addedRaw, removedRaw, inlinePath] = parts;
    let path = inlinePath;
    if (path === '') {
      // rename form: counts, then old and new paths as separate NUL tokens
      path = tokens[i + 2];
      i += 3;
    } else {
      i += 1;
    }
    if (!path) continue;
    const f = files.get(path);
    if (!f) continue;
    if (addedRaw === '-' || removedRaw === '-') {
      f.binary = true;
    } else {
      f.added = Number.parseInt(addedRaw ?? '0', 10) || 0;
      f.removed = Number.parseInt(removedRaw ?? '0', 10) || 0;
    }
  }
}

// sources — annotation only
for (const [key, args] of [
  ['committed', ['diff', '--name-only', '-z', `${mergeBase}..HEAD`]],
  ['staged', ['diff', '--name-only', '-z', '--cached']],
  ['unstaged', ['diff', '--name-only', '-z']],
]) {
  for (const p of nulSplit(gitQuiet(args) ?? '')) {
    const f = files.get(p);
    if (f && !f.sources.includes(key)) f.sources.push(key);
  }
}

// untracked — no diff exists for these, so they are invisible to every call above
for (const p of nulSplit(gitQuiet(['ls-files', '-z', '--others', '--exclude-standard']) ?? '')) {
  const f = record(p);
  f.status = 'untracked';
  f.sources = ['untracked'];
}

// ---------------------------------------------------------------- hunks

/**
 * One `git diff --unified=0` for the whole change set, split per file on the
 * `+++ b/<path>` header. N per-file invocations would be N subprocesses on Windows.
 */
const addedText = new Map(); // path -> added lines joined
{
  const raw = gitQuiet(['diff', '--unified=0', '-M', mergeBase]) ?? '';
  let current = null;
  const added = [];
  const flush = () => {
    if (current) addedText.set(current, added.join('\n'));
    added.length = 0;
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      flush();
      const p = line.slice(4).trim();
      current = p === '/dev/null' ? null : stripQuotes(p.replace(/^b\//, ''));
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('diff --git ')) continue;
    if (line.startsWith('@@')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m && current) {
        const start = Number.parseInt(m[1] ?? '0', 10);
        const count = m[2] === undefined ? 1 : Number.parseInt(m[2], 10);
        const f = files.get(current);
        if (f && count > 0) f.hunks.push({ new_start: start, new_lines: count });
      }
      continue;
    }
    if (line.startsWith('+') && current) added.push(line.slice(1));
  }
  flush();
}

function stripQuotes(s) {
  return s.length > 1 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

// untracked files: read whole, synthesize a full-file hunk so findings stay grounded
for (const f of files.values()) {
  if (f.status !== 'untracked') continue;
  const abs = resolve(REPO_ROOT, f.path);
  let size = null;
  try {
    size = statSync(abs).size;
  } catch {
    f.skipped = 'unreadable';
    continue;
  }
  f.size_bytes = size;
  if (size > MAX_FILE_BYTES || BINARY_EXT.test(f.path)) continue; // skip decided below
  let content = '';
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    f.skipped = 'unreadable';
    continue;
  }
  const lines = content.split(/\r?\n/);
  f.added = lines.length;
  f.hunks = [{ new_start: 1, new_lines: lines.length }];
  addedText.set(f.path, content);
}

// sizes for tracked files
for (const f of files.values()) {
  if (f.size_bytes !== null || f.status === 'deleted') continue;
  try {
    f.size_bytes = statSync(resolve(REPO_ROOT, f.path)).size;
  } catch {
    f.size_bytes = null;
  }
}

// ---------------------------------------------------------------- skip rules

for (const f of files.values()) {
  if (f.skipped) continue;
  if (f.status === 'deleted') f.skipped = 'deleted';
  else if (LOCKFILE.test(f.path)) f.skipped = 'lockfile';
  else if (IGNORED_DIR.test(f.path)) f.skipped = 'ignored';
  else if (f.binary || BINARY_EXT.test(f.path)) f.skipped = 'binary';
  else if ((f.size_bytes ?? 0) > MAX_FILE_BYTES) f.skipped = 'too_large';
  else if (f.added > MAX_ADDED_LINES) f.skipped = 'too_large';
}

// ---------------------------------------------------------------- routing

let routing;
try {
  routing = JSON.parse(readFileSync(join(SKILL_DIR, 'routing.json'), 'utf8'));
} catch (e) {
  fail('routing.json is missing or invalid JSON', `expected at ${join(SKILL_DIR, 'routing.json')}`);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Minimal glob → RegExp. `**` crosses separators, `*` and `?` do not. */
function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
          continue;
        }
        re += '.*';
        i += 2;
        continue;
      }
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if (c === '{') {
      const close = glob.indexOf('}', i);
      if (close > i) {
        const alts = glob
          .slice(i + 1, close)
          .split(',')
          .map((a) => escapeRe(a));
        re += `(?:${alts.join('|')})`;
        i = close + 1;
        continue;
      }
    }
    re += escapeRe(c ?? '');
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

const globCache = new Map();
function matchesAny(path, globs) {
  if (!globs || globs.length === 0) return false;
  for (const g of globs) {
    let re = globCache.get(g);
    if (!re) {
      re = globToRegExp(g);
      globCache.set(g, re);
    }
    if (re.test(path)) return true;
  }
  return false;
}

/**
 * Files the routing table declares nobody reviews (docs, markdown, shell scripts,
 * e2e flows). Excluded from routing outright rather than left to chance — otherwise
 * a content regex pulls prose in: `security` matched the word "token" and
 * `typescript-expert` matched an `Omit<` inside a fenced example, and a skill doc
 * ended up queued for review as if it were source.
 */
const UNROUTED_GLOBS = routing.unrouted_paths?.globs ?? [];

/**
 * Content triggers only ever apply to real source files. A regex is a blunt tool
 * and prose is full of the words it looks for.
 */
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql|ya?ml|json)$/i;

const reviewable = [...files.values()].filter(
  (f) => f.skipped === null && !matchesAny(f.path, UNROUTED_GLOBS),
);
const routed = [];

for (const s of routing.skills ?? []) {
  if (!s || s.routed !== true) continue;
  const forced = FORCED_SKILLS.includes(s.name);
  const contentRe = s.content ? new RegExp(s.content) : null;
  const picked = [];
  for (const f of reviewable) {
    if (matchesAny(f.path, s.exclude)) continue;
    const byGlob = matchesAny(f.path, s.globs);
    // A rename with no content change still routes on path: moving a file IS the
    // thing frontend-ui-architecture and onion-architecture have opinions about.
    const byContent =
      contentRe && SOURCE_EXT.test(f.path) ? contentRe.test(addedText.get(f.path) ?? '') : false;
    if (byGlob || byContent || (forced && f.package)) picked.push(f.path);
  }
  if (picked.length === 0) continue;
  routed.push({
    skill: s.name,
    path: s.path,
    also_read: s.also_read ?? [],
    priority: s.priority ?? 0,
    suppress: s.suppress ?? null,
    files: picked,
    deferred: false,
  });
  for (const p of picked) files.get(p)?.skills.push(s.name);
}

routed.sort((a, b) => b.priority - a.priority || a.skill.localeCompare(b.skill));

// Cap the fan-out. Overflow is marked deferred and named in the report — a skill
// that was not run must never be indistinguishable from a skill that found nothing.
const cap = routing.max_parallel_subagents ?? 6;
const perAgent = routing.max_files_per_subagent ?? 40;
const routes = [];
for (const r of routed) {
  if (routes.filter((x) => !x.deferred).length >= cap) {
    routes.push({ ...r, deferred: true });
    continue;
  }
  if (r.files.length > perAgent) {
    for (let i = 0; i < r.files.length; i += perAgent) {
      routes.push({ ...r, files: r.files.slice(i, i + perAgent), slice: `${i / perAgent + 1}` });
    }
  } else {
    routes.push(r);
  }
}

// Every non-skipped file no domain reviewer looked at — including the ones the
// routing table declares unrouted by design. The Coverage table must show the gap,
// not hide it behind the exclusion that caused it.
const unrouted = [...files.values()]
  .filter((f) => f.skipped === null && f.skills.length === 0)
  .map((f) => f.path);

// ---------------------------------------------------------------- mechanical

const all = [...files.values()];
const pathsOf = (re) => all.filter((f) => re.test(f.path)).map((f) => f.path);

const migrations = all
  .filter((f) => f.path.startsWith('server/src/db/migrations/') && f.path.endsWith('.sql'))
  .map((f) => ({
    path: f.path,
    suspect:
      f.status === 'modified'
        ? 'modified-existing'
        : !/\/\d{4}_[a-z0-9_]+\.sql$/.test(f.path)
          ? 'nonstandard-name'
          : null,
  }));

const lockfiles = all
  .filter((f) => LOCKFILE.test(f.path))
  .map((f) => {
    const pkg = f.package;
    const expected = pkg ? MANAGER[pkg] : null;
    const actual = f.path.endsWith('pnpm-lock.yaml') ? 'pnpm' : 'npm';
    return {
      path: f.path,
      package: pkg,
      manager_ok: expected === null ? null : expected === actual,
      package_json_changed: pkg ? files.has(`${pkg}/package.json`) : files.has('package.json'),
    };
  });

const mechanical = {
  branch,
  on_main: branch === 'main',
  base_ref: BASE_REF,
  vendor_shared_touched: {
    server: pathsOf(/^server\/src\/vendor\/shared\//),
    client: pathsOf(/^client\/src\/vendor\/shared\//),
  },
  migrations,
  lockfiles,
  skills_changed: all
    .filter((f) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f.path) && f.status !== 'deleted')
    .map((f) => {
      const slug = f.path.split('/')[2];
      return {
        path: f.path,
        slug,
        in_routing: (routing.skills ?? []).some((s) => s?.name === slug),
      };
    }),
  new_server_tests: all
    .filter(
      (f) =>
        f.path.startsWith('server/test/') &&
        /\.test\.ts$/.test(f.path) &&
        !/\.it\.test\.ts$/.test(f.path) &&
        (f.status === 'added' || f.status === 'untracked'),
    )
    .map((f) => f.path),
};

// ---------------------------------------------------------------- output

const packagesTouched = [...new Set(all.map((f) => f.package).filter(Boolean))];

const plan = {
  schema: SCHEMA,
  generated_at: new Date().toISOString(),
  base: { ref: BASE_REF, merge_base: mergeBase, committed_at: baseDateRaw || null, stale_hours: staleHours },
  head: { branch, sha: headSha, dirty_hash: dirtyHash },
  warnings,
  packages_touched: packagesTouched,
  counts: {
    files: all.length,
    reviewable: reviewable.length,
    skipped: all.length - reviewable.length,
    routes: routes.filter((r) => !r.deferred).length,
    deferred: routes.filter((r) => r.deferred).length,
  },
  files: all.sort((a, b) => a.path.localeCompare(b.path)),
  routes,
  unrouted,
  mechanical,
};

const json = `${JSON.stringify(plan, null, 2)}\n`;
process.stdout.write(json);

if (!TO_STDOUT_ONLY) {
  const out = flag('--out', join(REPO_ROOT, '.devdigest', 'cache', 'pr-self-review', 'plan.json'));
  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json, 'utf8');
  } catch {
    // Writing the artifact is a convenience; stdout already carries the plan.
  }
}
