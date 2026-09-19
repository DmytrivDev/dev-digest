/**
 * Conventions-extractor limits and the sample-selection lists.
 *
 * Sample selection is PURE CODE — no model decides what the model gets to see.
 * That is deliberate: a model asked "which files should I look at?" answers from
 * the names alone, and the answer is unauditable.
 */

/**
 * Config files read verbatim, by exact path at the repo root.
 *
 * `GitClient` has no `listFiles`, so discovery is "try each candidate and keep
 * what reads" rather than a glob. That is also why these are exact paths and not
 * patterns. They are probed at the repo root AND in the package directories
 * DERIVED from the ranked code samples (see `configSearchDirs`) — in this repo
 * every config lives under `server/` or `client/`, so a root-only probe finds
 * nothing at all.
 *
 * `repoIntel.getConventionSamples` cannot supply these — `isJunkPath` filters
 * `eslint`, `prettier` and `.config.` out of the ranked list on purpose, and that
 * behaviour is correct for its other callers.
 */
export const CONFIG_SAMPLE_PATHS = [
  'tsconfig.json',
  'tsconfig.base.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.editorconfig',
] as const;

/** How many package directories (besides the root) are probed for configs. */
export const MAX_CONFIG_DIRS = 3;

/** Ceiling on config samples, so a monorepo's configs cannot crowd out the code. */
export const MAX_CONFIG_SAMPLES = 8;

/**
 * Directory names that hold packages rather than code, so the package directory
 * is one level deeper. Kept short and literal: this is the only place the sampler
 * guesses at a layout, and a wrong guess just costs a failed read.
 */
export const PACKAGE_CONTAINER_DIRS = ['packages', 'apps', 'services', 'libs'] as const;

/** How many ranked source files go into the sample. */
export const CODE_SAMPLE_COUNT = 12;

/**
 * Per-file line budget. Conventions live in the top of a file — imports, the
 * export shape, the first handler — so a head slice is not a compromise here.
 */
export const MAX_SAMPLE_LINES = 100;

/** Per-file character budget, applied after the line budget. */
export const MAX_SAMPLE_CHARS = 4_000;

/**
 * Total character budget across every sample.
 *
 * Deliberately modest. This is a SYNCHRONOUS route, so the budget is a latency
 * decision as much as a cost one: the first live scan sent ~10k input tokens and
 * took 5-9 minutes, which no client waits out.
 */
export const MAX_TOTAL_SAMPLE_CHARS = 40_000;

/**
 * How many candidates the model may return.
 *
 * The binding constraint on latency is OUTPUT tokens, not input: the first live
 * scan spent 9,197 of them on 20 candidates. Fewer, better-evidenced rules are
 * also what a human can actually triage.
 */
export const MAX_CANDIDATES = 12;

/**
 * How far from the cited line the snippet may actually be found. Off-by-one from
 * 0- vs 1-indexing is the most common model slip and is not a hallucination; a
 * match this close is accepted and the line number is CORRECTED to the real one.
 */
export const EVIDENCE_LINE_TOLERANCE = 2;

/**
 * Per-request timeout passed to the provider. Honoured by the OpenAI and
 * Anthropic adapters; OpenRouter fixes its own timeout at construction and
 * ignores this, so it is a ceiling for two providers out of three, not a
 * guarantee. `EXTRACT_DEADLINE_MS` is the guarantee.
 */
export const EXTRACT_TIMEOUT_MS = 90_000;

/**
 * Hard server-side deadline on the whole model call, enforced by this module.
 *
 * This route answers synchronously, so an unbounded call is a connection held
 * open until the client gives up — which then reports a failure and gets no
 * result while the scan runs on. Because the one provider that matters here
 * ignores the per-request timeout, the bound has to be ours. On expiry the route
 * fails fast and says so, instead of going quiet.
 *
 * The ordering is what makes it work: provider timeout (90s) < this deadline
 * (120s) < any plausible client or proxy timeout. A deadline set ABOVE the
 * client's — the first attempt used 240s, against a client that gave up at
 * 180s — reproduces the original bug in a narrower window instead of fixing it.
 * A measured scan is 45.6s, so this leaves ~2.6x headroom.
 */
export const EXTRACT_DEADLINE_MS = 120_000;

/**
 * Schema-repair attempts. One, not the default two: each repair is a full extra
 * round trip on a prompt of thousands of tokens, and on a slow provider that is
 * what turns a synchronous route into a request nobody waits out.
 */
export const EXTRACT_MAX_RETRIES = 1;

/** Criterion 42 names the skill. One per workspace. */
export const CONVENTIONS_SKILL_NAME = 'repo-conventions';
