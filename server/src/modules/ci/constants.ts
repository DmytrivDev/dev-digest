/** Bump when the shape of the generated bundle (workflow / layout) changes. */
export const CI_GENERATOR_VERSION = 1;

/** The branch DevDigest installs through; the only ref the CI module ever writes. */
export const CI_BRANCH = 'devdigest/ci';
export const CI_PR_TITLE = 'Add DevDigest CI review';
export const CI_PR_BODY =
  'Adds the DevDigest review agent: its manifest, skills, the runner and a GitHub Actions workflow.\n\n' +
  'Add the `OPENROUTER_API_KEY` repository secret before merging.\n\n' +
  'If this repository accepts fork PRs, enable "Require approval for all external contributors" for fork pull request workflows (Settings > Actions > General).';

/** actions/checkout v4.4.0 — pinned to a commit SHA (AC-20). */
export const CHECKOUT_SHA = '11d5960a326750d5838078e36cf38b85af677262';
/** actions/upload-artifact v4.6.2 — pinned to a commit SHA (AC-20). */
export const UPLOAD_ARTIFACT_SHA = 'ea165f8d65b6e75b540449e92b4886f43607fa02';

/** Largest result artifact the ingest will read (AC-32). */
export const CI_ARTIFACT_MAX_BYTES = 65_536;
export const CI_ARTIFACT_NAME = 'devdigest-result';
export const CI_ARTIFACT_FILE = 'devdigest-result.json';

/** CI Runs list cap (AC-36) and how many workflow runs one refresh reads per installation. */
export const CI_RUNS_LIMIT = 50;
export const CI_REFRESH_PER_PAGE = 50;

/** Fixed log lines (AC-24, AC-25). */
export const FORK_REFUSAL_LINE =
  'Fork PRs are not reviewed by DevDigest — maintainer review required';
export const INSTALLING_SKIP_LINE = 'DevDigest is being installed — review skipped';

export const PROVIDER_NOT_SUPPORTED_MESSAGE =
  "CI runs through OpenRouter — switch this agent's provider to OpenRouter to export.";

/** Fixed repository paths of the exported bundle. */
export const MEMORY_PATH = '.devdigest/memory.jsonl';
export const RUNNER_DIR = '.devdigest/runner';
