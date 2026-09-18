/** Constants for the skill editor's Stats tab. */

/**
 * Donut colour per finding category.
 *
 * Lives here rather than in `vendor/ui`'s `CAT` map because `CAT` deliberately
 * carries only icon + label — severity owns the colour vocabulary app-wide, and
 * giving categories a second one there would invite them to be used as if they
 * meant severity. These are chart colours for one chart.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "var(--cat-perf)",
  style: "var(--accent)",
  test: "var(--ok)",
};

/** Colour for a category the map does not know (a model may invent one). */
export const CATEGORY_FALLBACK = "var(--text-muted)";

/** Severity order for the breakdown row — worst first, as everywhere else. */
export const SEVERITY_ORDER = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"] as const;
