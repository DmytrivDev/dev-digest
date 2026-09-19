import type { IconName } from "@devdigest/ui";

/**
 * The triage views. `all` is a VIEW, not a status — the other three are
 * `ConventionStatus` values and the filter maps onto them directly.
 */
export const FILTER_KEYS = ["all", "pending", "accepted", "rejected"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/**
 * Pending, not `all`: the page's job is triage, and a rejected rule coming back
 * into view every visit is the thing the three-state status exists to prevent.
 * The choice lives in the URL (`?status=`), so a reload shows what was on screen.
 */
export const DEFAULT_FILTER: FilterKey = "pending";

export const FILTER_ICON: Record<FilterKey, IconName> = {
  all: "ListChecks",
  pending: "Clock",
  accepted: "Check",
  rejected: "X",
};

/** Cards drawn while the list loads. Three is what fits above the fold. */
export const SKELETON_CARDS = 3;

/** Reading width of the mock's `Conventions` artboard. */
export const PAGE_MAX_WIDTH = 880;
