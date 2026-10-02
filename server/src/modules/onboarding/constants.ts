import type { OnboardingSectionKind } from '@devdigest/shared';

/**
 * Every cap, limit and code of the Onboarding Tour (SPEC-02) in one place. Pure
 * values — no I/O — so ring-1 helpers and the application layer share one vocabulary.
 * A helper that needs a new constant adds it to its own file, not here.
 */

// ---- Section caps (AC-61, AC-62, AC-73, AC-77, AC-78, AC-84, AC-89) ----
export const READING_PATH_MAX = 8;
export const CRITICAL_PATHS_MAX = 6;
/** Chains start from the top N files by tour rank. */
export const CRITICAL_PATH_ROOTS = 5;
/** Import hops followed from each root. */
export const CHAIN_DEPTH = 2;
export const HOW_TO_RUN_MAX = 8;
export const FIRST_TASKS_MAX = 3;
export const ARCH_WORDS_MAX = 180;
/** A model-written row text longer than this is cut to `ROW_TEXT_MAX - 1` chars + "…". */
export const ROW_TEXT_MAX = 120;
export const DIAGRAM_NODES_MAX = 12;
/**
 * The roles a node of the model's diagram may carry as a `:::role` tag; the page colours
 * each node's border by it. Any other class, and every styling line, is stripped.
 */
export const DIAGRAM_ROLES = ['client', 'service', 'engine', 'data', 'external', 'shared'] as const;
export const PACKAGE_DIAGRAM_NODES_MAX = 12;
/** Packages with no import edge are laid side by side in rows of at most this many. */
export const PACKAGE_DIAGRAM_ROW_MAX = 4;

// ---- Architecture facts / run targets (AC-69, AC-81) ----
export const TOP_FOLDERS_MAX = 10;
export const EXTENSIONS_MAX = 8;
export const RUN_TARGETS_MAX = 6;
export const RUN_TARGET_DEPTH = 2;
export const CLONE_EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;
export const PACKAGE_CONTAINERS = ['packages', 'apps', 'services', 'libs'] as const;
/** Package-directory name of files that sit at the repository root. */
export const ROOT_PACKAGE = '(root)';
/** Lockfile → package manager, in precedence order (AC-68). */
export const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
] as const;
export const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;
/** `package.json` scripts offered as run candidates, in this order (AC-70). */
export const RUN_SCRIPTS = ['dev', 'start', 'test'] as const;

// ---- Safety rules for anything clipboard- or prompt-bound (AC-71, AC-76, AC-96) ----
export const SAFE_TOKEN_RE = /^[A-Za-z0-9._\/:-]+$/;
export const SAFE_SERVICE_RE = /^[A-Za-z0-9._-]+$/;
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

// ---- Git history window (AC-54, AC-56, AC-57) ----
export const HISTORY_WINDOW_DAYS = 180;
export const HISTORY_TIMEOUT_MS = 30_000;
export const HISTORY_MAX_COMMITS = 20_000;

// ---- Model call and prompt budget (AC-48, AC-97, AC-98) ----
export const MODEL_DEADLINE_MS = 120_000;
/**
 * Output ceiling. A tour answer is ~1,000–1,400 tokens, but OpenRouter routes deepseek to
 * upstreams that may still run a reasoning pass (2,000+ tokens, billed against this cap)
 * even with `disableReasoning`; at 4,000 that cut the JSON mid-object → llm_invalid_output
 * (measured 2026-10-02). The deadline, not this cap, bounds latency.
 */
export const MODEL_MAX_TOKENS = 8_000;
export const INPUT_TOKEN_BUDGET = 24_000;
export const README_MAX_CHARS = 8_000;
export const TREE_MAX_DEPTH = 2;
export const TREE_MAX_ENTRIES = 200;
export const ROUTES_MAX = 50;
export const EXCERPT_MAX_CHARS = 2_000;
export const DEPS_MAX_PER_PACKAGE = 40;
export const ENV_KEYS_MAX_PER_FILE = 50;

// ---- Generate rate limit, per workspace (AC-16) ----
export const RATE_LIMIT_MAX = 3;
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** English section titles in AC-90 order (the client renders its own copy by `kind`). */
export const SECTION_TITLES: Readonly<Record<OnboardingSectionKind, string>> = {
  architecture_overview: 'Architecture overview',
  critical_paths: 'Critical paths',
  how_to_run: 'How to run locally',
  guided_reading: 'Guided reading path',
  first_tasks: 'First tasks',
};

// ---- Error codes (AC-13, AC-14, AC-15, AC-16) ----
export const ERR_REPO_NOT_CLONED = 'repo_not_cloned';
export const ERR_REPO_NOT_INDEXED = 'repo_not_indexed';
export const ERR_GENERATION_IN_PROGRESS = 'generation_in_progress';
export const ERR_RATE_LIMITED = 'rate_limited';

/**
 * Labels of the `<untrusted>` blocks (AC-94). CONSTANT on purpose — `wrapUntrusted`
 * does not escape its label, so a label must never be derived from repo content.
 * A code excerpt's label is `excerptPrefix` + its index.
 */
export const UNTRUSTED_LABELS = {
  stack: 'onboarding-stack',
  scripts: 'onboarding-scripts',
  criticalPaths: 'onboarding-critical-paths',
  readingPath: 'onboarding-reading-path',
  readme: 'onboarding-readme',
  tree: 'onboarding-tree',
  routes: 'onboarding-routes',
  excerptPrefix: 'onboarding-excerpt-',
} as const;

/** Names the prompt uses for blocks it capped or dropped (AC-101), in drop order after the first. */
export const FACT_BLOCK_NAMES = [
  'code excerpts',
  'README',
  'directory tree',
  'route list',
  'dependency names',
  'env key names',
] as const;
export type FactBlockName = (typeof FACT_BLOCK_NAMES)[number];
