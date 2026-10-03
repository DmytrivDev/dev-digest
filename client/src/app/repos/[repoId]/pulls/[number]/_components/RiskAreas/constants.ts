import type { IconName } from "@devdigest/ui";

/** Risk `kind` → icon (the C-4 vocabulary). The set is open, so an unlisted kind
 *  falls back to `RISK_FALLBACK_ICON`. Client-local: a value import from
 *  `@devdigest/shared` would break `next build`. */
export const RISK_ICON: Record<string, IconName> = {
  security: "Shield",
  db_migration: "Database",
  breaking_api: "AlertOctagon",
  perf: "Zap",
  deps: "Boxes",
};

export const RISK_FALLBACK_ICON: IconName = "AlertTriangle";

/** Risk severity → colour of its icon and of the open pill's border. */
export const RISK_SEV: Record<string, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};

export const SKELETON_ROWS = 3;
