import type { SmartDiffRole } from "@devdigest/shared";

/** Label key, hint key and stripe/mark colour per role. Colours are CSS
    custom properties that already exist in vendor/ui/styles.css. */
export const ROLE_META: Record<
  SmartDiffRole,
  { labelKey: string; hintKey: string; color: string }
> = {
  core: { labelKey: "coreLabel", hintKey: "coreHint", color: "var(--accent)" },
  tests: { labelKey: "testsLabel", hintKey: "testsHint", color: "var(--ok)" },
  wiring: { labelKey: "wiringLabel", hintKey: "wiringHint", color: "var(--info)" },
  docs: { labelKey: "docsLabel", hintKey: "docsHint", color: "var(--sugg)" },
  boilerplate: {
    labelKey: "boilerplateLabel",
    hintKey: "boilerplateHint",
    color: "var(--text-muted)",
  },
};

/** Roles that start collapsed — the reader wants core/tests/wiring first. */
export const COLLAPSED_BY_DEFAULT: readonly SmartDiffRole[] = ["docs", "boilerplate"];

export const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export const FINDING_LABEL_KEY: Record<string, string> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};
