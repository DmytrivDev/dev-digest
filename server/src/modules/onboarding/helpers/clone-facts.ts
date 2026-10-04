import {
  CLONE_EXCLUDED_DIRS,
  COMPOSE_FILES,
  DEPS_MAX_PER_PACKAGE,
  ENV_KEY_RE,
  ENV_KEYS_MAX_PER_FILE,
  EXTENSIONS_MAX,
  HOW_TO_RUN_MAX,
  LOCKFILES,
  RUN_SCRIPTS,
  RUN_TARGET_DEPTH,
  RUN_TARGETS_MAX,
  SAFE_SERVICE_RE,
  SAFE_TOKEN_RE,
  TOP_FOLDERS_MAX,
  TREE_MAX_DEPTH,
  TREE_MAX_ENTRIES,
} from '../constants.js';
import type { ArchitectureFacts, CloneFacts, RunCandidate } from '../types.js';
import { hasControlChar } from './rank.js';
import { isToolingDir, packageDirOf } from './graph.js';

/**
 * Facts read from the clone (SPEC-02 AC-68..AC-71, AC-73..AC-76, AC-81, AC-85, AC-96,
 * AC-98). Ring 1: the caller reads the files, these functions only interpret text.
 * Nothing here reads the filesystem, and a `.env.example` VALUE is never extracted —
 * only key names. A dir key of `''` is the repository root.
 *
 * Candidate commands are copyable, so every name that reaches one is checked against
 * an allow-list of characters (AC-71): a name that fails is dropped, never escaped.
 */

const EXCLUDED: readonly string[] = CLONE_EXCLUDED_DIRS;
const COMPOSE_NAMES: readonly string[] = COMPOSE_FILES;

/** Nearly every function starts here (AC-96): control-character paths leave every fact. */
function safeFiles(files: readonly string[]): string[] {
  return files.filter((f) => !hasControlChar(f));
}

function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}

/** Root, or at most `RUN_TARGET_DEPTH` deep and outside every excluded directory. */
function isEligibleDir(dir: string): boolean {
  if (dir === '') return true;
  const segments = dir.split('/');
  if (segments.length > RUN_TARGET_DEPTH) return false;
  return !segments.some((s) => EXCLUDED.includes(s));
}

/** Eligible directories (code-point order, at most 6) holding a file named `name`. */
function dirsHolding(files: readonly string[], name: string): string[] {
  const dirs = new Set<string>();
  for (const f of safeFiles(files)) {
    if (f === name) dirs.add('');
    else if (f.endsWith(`/${name}`)) dirs.add(f.slice(0, f.length - name.length - 1));
  }
  return [...dirs]
    .filter(isEligibleDir)
    .sort(compareCodePoints)
    .slice(0, RUN_TARGETS_MAX);
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Root (when it holds a `package.json`) plus eligible subdirectories, at most 6 (AC-69). */
export function runTargets(files: readonly string[]): string[] {
  return dirsHolding(files, 'package.json');
}

/** Package manager of a package directory, by lockfile precedence (AC-68). */
export function packageManagerOf(dir: string, files: readonly string[]): string {
  const present = new Set(files);
  for (const [lockfile, manager] of LOCKFILES) {
    if (present.has(joinPath(dir, lockfile))) return manager;
  }
  return 'npm';
}

/**
 * The manager the architecture facts report: the root target's, else the first run
 * target's, else `null` (plan A-12).
 */
export function primaryPackageManager(files: readonly string[]): string | null {
  const targets = runTargets(files);
  const target = targets.includes('') ? '' : targets[0];
  if (target === undefined) return null;
  return packageManagerOf(target, files);
}

/** Scripts of a `package.json` (name → command); `{}` when it is not valid JSON. */
export function parsePackageScripts(json: string): Record<string, string> {
  const doc = parseObject(json);
  const scripts = doc?.scripts;
  if (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts)) return {};
  const out: Record<string, string> = {};
  for (const [name, command] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof command === 'string') out[name] = command;
  }
  return out;
}

/** Dependency NAMES (never versions), declared order, at most `DEPS_MAX_PER_PACKAGE`. */
export function parseDependencyNames(json: string): { names: string[]; capped: boolean } {
  const doc = parseObject(json);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const block = doc?.[field];
    if (block === null || typeof block !== 'object' || Array.isArray(block)) continue;
    for (const name of Object.keys(block as Record<string, unknown>)) {
      if (hasControlChar(name) || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return {
    names: names.slice(0, DEPS_MAX_PER_PACKAGE),
    capped: names.length > DEPS_MAX_PER_PACKAGE,
  };
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const doc: unknown = JSON.parse(json);
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return null;
    return doc as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Names of the `KEY=value` lines of a `.env.example` that match `ENV_KEY_RE`, in file
 * order, at most 50 (AC-76). The value is never read into the result.
 */
export function envKeyNames(text: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim();
    if (!ENV_KEY_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= ENV_KEYS_MAX_PER_FILE) break;
  }
  return keys;
}

/**
 * Service names of a compose file: the keys one indentation level under a top-level
 * `services:` line, in file order (plan A-13). A minimal reader — no YAML dependency;
 * anchors and flow maps yield fewer names, never an unsafe one.
 */
export function composeServiceNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let inServices = false;
  let indent: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    const lead = raw.length - raw.trimStart().length;
    if (lead === 0) {
      inServices = /^services:\s*(#.*)?$/.test(raw);
      indent = null;
      continue;
    }
    if (!inServices || raw.startsWith('\t')) continue;
    if (indent === null) indent = lead;
    if (lead !== indent) continue;
    const m = /^(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9._-]+))\s*:(?:\s|$)/.exec(raw.trimStart());
    const name = m?.[1] ?? m?.[2] ?? m?.[3];
    if (name === undefined || name === '' || hasControlChar(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Every command the model may pick for How to run, in the order of AC-73: installs,
 * env copies, compose, then `dev`/`start`/`test` per target. Non-root commands carry
 * `cd <dir> && `. A candidate built from a name outside the allow-list is omitted
 * (AC-71) — an unsafe compose service omits the whole compose command.
 */
export function runCandidates(facts: CloneFacts): RunCandidate[] {
  const files = safeFiles(facts.files);
  const targets = runTargets(files).filter((d) => SAFE_TOKEN_RE.test(d) || d === '');
  const envDirs = dirsHolding(files, '.env.example').filter(
    (d) => SAFE_TOKEN_RE.test(d) || d === '',
  );
  const prefix = (dir: string) => (dir === '' ? '' : `cd ${dir} && `);
  const out: RunCandidate[] = [];

  for (const dir of targets) {
    out.push({
      command: `${prefix(dir)}${packageManagerOf(dir, files)} install`,
      kind: 'install',
      target: dir,
    });
  }
  for (const dir of envDirs) {
    out.push({ command: `${prefix(dir)}cp .env.example .env`, kind: 'env', target: dir });
  }
  if (facts.compose !== null && COMPOSE_NAMES.includes(facts.compose.file)) {
    const services = composeServiceNames(facts.compose.text);
    if (services.length > 0 && services.every((s) => SAFE_SERVICE_RE.test(s))) {
      out.push({
        command: `docker compose up -d ${services.join(' ')}`,
        kind: 'compose',
        target: '',
      });
    }
  }
  for (const dir of targets) {
    const scripts = parsePackageScripts(facts.packageJsons[dir] ?? '');
    const manager = packageManagerOf(dir, files);
    for (const name of RUN_SCRIPTS) {
      if (!Object.prototype.hasOwnProperty.call(scripts, name)) continue;
      out.push({ command: `${prefix(dir)}${manager} run ${name}`, kind: 'script', target: dir });
    }
  }
  return out;
}

/** A skeleton tour's How-to-run steps: the first 8 candidates, no notes (AC-73). */
export function skeletonSteps(
  candidates: readonly RunCandidate[],
): { command: string; note: null }[] {
  return candidates.slice(0, HOW_TO_RUN_MAX).map((c) => ({ command: c.command, note: null }));
}

/** `no_run_facts` when there is no candidate (AC-74). */
export function howToRunEmptyReason(candidates: readonly RunCandidate[]): 'no_run_facts' | null {
  return candidates.length === 0 ? 'no_run_facts' : null;
}

function byCountThenName(a: [string, number], b: [string, number]): number {
  if (a[1] !== b[1]) return a[1] > b[1] ? -1 : 1;
  return compareCodePoints(a[0], b[0]);
}

/**
 * The deterministic architecture facts of a skeleton tour (AC-81). `pm` comes from
 * `primaryPackageManager`. Folders and extensions are counted over the CLONE's files;
 * package directories over the INDEXED files. Extensions are lower-cased with their
 * dot (`.ts`); a file without one is skipped.
 */
export function architectureFacts(
  cloneFiles: readonly string[],
  indexedFiles: readonly string[],
  pm: string | null,
  composeNames: readonly string[],
): ArchitectureFacts {
  const folders = new Map<string, number>();
  const extensions = new Map<string, number>();
  for (const file of safeFiles(cloneFiles)) {
    const segments = file.split('/');
    if (segments.length > 1) {
      const top = segments[0] as string;
      folders.set(top, (folders.get(top) ?? 0) + 1);
    }
    const base = segments[segments.length - 1] as string;
    const dot = base.lastIndexOf('.');
    if (dot > 0 && dot < base.length - 1) {
      const ext = base.slice(dot).toLowerCase();
      extensions.set(ext, (extensions.get(ext) ?? 0) + 1);
    }
  }
  const packageDirs = [...new Set(safeFiles(indexedFiles).map(packageDirOf))]
    .filter((dir) => !isToolingDir(dir))
    .sort(compareCodePoints);
  return {
    package_manager: pm,
    package_dirs: packageDirs,
    top_folders: [...folders.entries()]
      .sort(byCountThenName)
      .slice(0, TOP_FOLDERS_MAX)
      .map(([path, files]) => ({ path, files })),
    compose_services: composeNames.filter((n) => !hasControlChar(n)),
    extensions: [...extensions.entries()]
      .sort(byCountThenName)
      .slice(0, EXTENSIONS_MAX)
      .map(([extension, files]) => ({ extension, files })),
  };
}

/**
 * Directories and files at depth <= 2 (`src/` and `src/a.ts` count, `src/a/b.ts`
 * contributes only `src/` and `src/a/`), code-point order, the first 200 (AC-98).
 * Directories carry a trailing `/`.
 */
export function directoryTree(files: readonly string[]): { entries: string[]; capped: boolean } {
  const entries = new Set<string>();
  for (const file of safeFiles(files)) {
    const segments = file.split('/');
    const depth = Math.min(TREE_MAX_DEPTH, segments.length);
    for (let k = 1; k <= depth; k += 1) {
      const prefix = segments.slice(0, k).join('/');
      entries.add(k < segments.length ? `${prefix}/` : prefix);
    }
  }
  const sorted = [...entries].sort(compareCodePoints);
  return { entries: sorted.slice(0, TREE_MAX_ENTRIES), capped: sorted.length > TREE_MAX_ENTRIES };
}

/**
 * Every file of the clone, and every ancestor directory both with and without a
 * trailing `/` — the set a task's `scope` must belong to (AC-85).
 */
export function existingScopes(files: readonly string[]): Set<string> {
  const scopes = new Set<string>();
  for (const file of safeFiles(files)) {
    scopes.add(file);
    const segments = file.split('/');
    for (let k = 1; k < segments.length; k += 1) {
      const dir = segments.slice(0, k).join('/');
      scopes.add(dir);
      scopes.add(`${dir}/`);
    }
  }
  return scopes;
}
