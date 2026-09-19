/** Pure helpers for ConventionsView — no React, so they test without a renderer. */

import type { ConventionCandidate } from "@devdigest/shared";
import { ApiError, describeApiError } from "@/lib/api";
import { DEFAULT_FILTER, FILTER_KEYS, type FilterKey } from "./constants";

/** `?status=` → a view, falling back to the default rather than throwing. */
export function parseFilter(raw: string | null | undefined): FilterKey {
  return FILTER_KEYS.includes(raw as FilterKey) ? (raw as FilterKey) : DEFAULT_FILTER;
}

export function filterCandidates(
  list: ConventionCandidate[],
  key: FilterKey,
): ConventionCandidate[] {
  return key === "all" ? list : list.filter((c) => c.status === key);
}

/** Counts for the filter chips — every view, including the one in front of you. */
export function countByStatus(list: ConventionCandidate[]): Record<FilterKey, number> {
  return {
    all: list.length,
    pending: list.filter((c) => c.status === "pending").length,
    accepted: list.filter((c) => c.status === "accepted").length,
    rejected: list.filter((c) => c.status === "rejected").length,
  };
}

/**
 * Why a scan did not produce candidates, in the user's language.
 *
 * A 4xx here is an ANSWER, not a malfunction: the server says "no clone", "no
 * index" or "nothing accepted" in `message`, and that wording is more useful
 * than anything this page could invent. Only the two statuses whose meaning is
 * transport-level — the rate limit and an unreachable API — are re-worded,
 * because their raw text explains nothing to the person who clicked Run.
 */
export function scanErrorMessage(error: unknown, t: (key: string) => string): string {
  if (!(error instanceof ApiError)) return t("errors.generic");
  if (error.status === 429) return t("errors.rateLimited");
  if (error.status === 0) return t("errors.network");
  return describeApiError(error) || t("errors.generic");
}
