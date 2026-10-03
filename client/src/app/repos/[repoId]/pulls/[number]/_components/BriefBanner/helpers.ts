import type { BriefInput, BriefUsage, ReviewRecord } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { INPUTS_SEPARATOR } from "./constants";

/**
 * `$<cost> <in>K→<out>K` — the cost goes through `formatCost` (unknown → "—"); the
 * token part appears only when both counts are known.
 */
export function costText(usage: BriefUsage): string {
  const cost = formatCost(usage.cost_usd);
  if (usage.tokens_in == null || usage.tokens_out == null) return cost;
  return `${cost} ${(usage.tokens_in / 1000).toFixed(1)}K→${(usage.tokens_out / 1000).toFixed(1)}K`;
}

/**
 * Stale when the server says so (`stale` of the GET envelope) or when the brief's
 * head differs from the head the page is showing right now.
 */
export function isBriefStale(
  stale: boolean,
  briefHeadSha: string,
  liveHeadSha: string | null | undefined,
): boolean {
  return stale || (!!liveHeadSha && liveHeadSha !== briefHeadSha);
}

/** Wording for `inputsLine`, injected so the helper stays free of i18n. */
export interface InputsLineLabels {
  builtWithout: string;
  truncated: string;
  source: (source: BriefInput["source"]) => string;
  reason: (reason: string) => string;
}

function part(input: BriefInput, labels: InputsLineLabels): string {
  return `${labels.source(input.source)} (${labels.reason(input.reason ?? "")})`;
}

/**
 * The muted "Built without: … · Truncated: …" line, or null when every input was
 * used. `missing` inputs group under "Built without", `truncated` under "Truncated".
 */
export function inputsLine(inputs: BriefInput[], labels: InputsLineLabels): string | null {
  const missing = inputs.filter((i) => i.status === "missing").map((i) => part(i, labels));
  const truncated = inputs.filter((i) => i.status === "truncated").map((i) => part(i, labels));
  const sections: string[] = [];
  if (missing.length > 0) sections.push(`${labels.builtWithout} ${missing.join(INPUTS_SEPARATOR)}`);
  if (truncated.length > 0) sections.push(`${labels.truncated} ${truncated.join(INPUTS_SEPARATOR)}`);
  return sections.length > 0 ? sections.join(INPUTS_SEPARATOR) : null;
}

/** Items the server removed because they pointed at files or lines outside the diff. */
export function droppedCount(dropped: { risks: number; review_focus: number }): number {
  return dropped.risks + dropped.review_focus;
}

/** CRITICAL findings of the review that are not dismissed — the run accordion's count. */
export function blockersOf(review: ReviewRecord): number {
  return review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}
