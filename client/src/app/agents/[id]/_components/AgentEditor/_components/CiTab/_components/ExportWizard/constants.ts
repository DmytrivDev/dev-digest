import type { CiPostAs, CiTrigger } from "@devdigest/shared";

/** Wizard steps, in order; the labels live under `exportWizard.steps.<key>`. */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;

export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

/** Every trigger, in the order the chips (and the generated workflow) list them. */
export const TRIGGER_VALUES: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];

/** `synchronize` is always on — a new push must re-run the review (AC-10). */
export const LOCKED_TRIGGER: CiTrigger = "synchronize";

/** Screenshot 4: opened on, synchronize on (locked), reopened off. */
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

/** Post-as options in display order; the first is the default and "recommended". */
export const POST_AS_VALUES: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];
export const DEFAULT_POST_AS: CiPostAs = "github_review";

/** Only OpenRouter agents run in CI (AC-6). */
export const CI_PROVIDER = "openrouter";

/** The "Need help?" link on the Install step (AC-12). */
export const DOCS_URL =
  "https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions";

/** Rows of the static "Secrets expected" table (AC-10) — no request is made for it. */
export const SECRETS = [
  { name: "OPENROUTER_API_KEY", descKey: "openrouterDesc", pillKey: "openrouterPill", tone: "warn" },
  { name: "GITHUB_TOKEN", descKey: "githubDesc", pillKey: "githubPill", tone: "ok" },
] as const;

/** Server error codes the wizard words itself rather than echoing the server message. */
export const ERR_PROVIDER_NOT_SUPPORTED = "provider_not_supported";
export const ERR_WORKFLOW_INVALID = "workflow_invalid";
