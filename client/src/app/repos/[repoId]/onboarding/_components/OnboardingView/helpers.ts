/** Pure helpers for OnboardingView — no React, so they test without a renderer.
    Text comes from the caller's translator, so this file owns the rules and
    `onboarding.json` owns the words. */

import type { OnboardingReason, OnboardingSection, OnboardingTour, OnboardingUsage } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  PROVIDER_LABEL_KEYS,
  SHORT_SHA_LENGTH,
  UNKNOWN_PROVIDER,
} from "./constants";

/** The slice of next-intl's `t` these helpers use. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

const formatCount = (n: number) => n.toLocaleString("en-US");

/** "just now" / "{n}m ago" / "{n}h ago" / "{n}d ago", floored (AC-31). A time in
    the future (clock skew) reads as "just now". */
export function relativeTime(iso: string, nowMs: number, t: Translate): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return t("time.justNow");
  const minutes = Math.floor(Math.max(0, nowMs - then) / MS_PER_MINUTE);
  if (minutes < 1) return t("time.justNow");
  if (minutes < MINUTES_PER_HOUR) return t("time.minutes", { n: minutes });
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return t("time.hours", { n: hours });
  return t("time.days", { n: Math.floor(hours / HOURS_PER_DAY) });
}

/** The measured parts of the subtitle. `truncated` is set only when the index
    walk found more source files than were indexed (AC-30). */
export function subtitleParts(tour: OnboardingTour) {
  return {
    files: formatCount(tour.indexed_files),
    truncated:
      tour.walk_total === null
        ? null
        : { shown: formatCount(tour.indexed_files), total: formatCount(tour.walk_total) },
    branch: tour.branch,
    sha: tour.indexed_sha.slice(0, SHORT_SHA_LENGTH),
  };
}

/** "Generated from N indexed source files · branch main @ a1e59f2 · last refreshed 2h ago". */
export function subtitleLine(tour: OnboardingTour, nowMs: number, t: Translate): string {
  const parts = subtitleParts(tour);
  return t("header.subtitle", {
    files: parts.files,
    truncated: parts.truncated ? t("header.truncated", parts.truncated) : "",
    branch: parts.branch,
    sha: parts.sha,
    when: relativeTime(tour.generated_at, nowMs, t),
  });
}

/** An inline code span that survives a backtick in the text. */
function codeSpan(text: string): string {
  if (!text.includes("`")) return `\`${text}\``;
  return text;
}

const withNote = (head: string, note: string | null) => (note ? `${head} — ${note}` : head);

function sectionLines(section: OnboardingSection, t: Translate): string[] {
  if (section.empty_reason) return [t(`emptyReasons.${section.empty_reason}`)];
  switch (section.kind) {
    case "architecture_overview":
      return [
        ...(section.body ? [section.body] : []),
        ...(section.diagram ? ["```mermaid", section.diagram, "```"] : []),
      ];
    case "critical_paths":
      return section.items.map((i) => `- ${withNote(i.path, i.reason)}`);
    case "how_to_run":
      return section.steps.map((s) => `- ${withNote(codeSpan(s.command), s.note)}`);
    case "guided_reading":
      return section.items.map((i) => `- ${withNote(i.path, i.why)}`);
    case "first_tasks":
      return section.items.map((i) => `- ${i.title} (${i.scope}, ${i.complexity})`);
  }
}

/** The "Copy as Markdown" document (AC-35): title line, subtitle line, then one
    `##` heading per section with its rows beneath. */
export function tourToMarkdown(
  tour: OnboardingTour,
  repoName: string,
  t: Translate,
  nowMs: number,
): string {
  const lines = [`# ${t("header.titlePrefix")} ${repoName}`, "", subtitleLine(tour, nowMs, t), ""];
  for (const section of tour.sections) {
    lines.push(`## ${t(`sections.${section.kind}`)}`, "", ...sectionLines(section, t), "");
  }
  return lines.join("\n");
}

/** A provider's display name; an id with no label is shown as it is. */
export function providerLabel(provider: string | null, t: Translate): string {
  if (!provider) return UNKNOWN_PROVIDER;
  return (PROVIDER_LABEL_KEYS as readonly string[]).includes(provider)
    ? t(`providers.${provider}`)
    : provider;
}

/** The sentence for one reason (T-1). `llm_not_configured` names the provider. */
export function reasonText(reason: OnboardingReason, provider: string | null, t: Translate): string {
  return reason === "llm_not_configured"
    ? t(`reasons.${reason}`, { provider: providerLabel(provider, t) })
    : t(`reasons.${reason}`);
}

/** "1 model call · 5,214 tokens · $0.0003 · deepseek/deepseek-v4-flash" (AC-36). */
export function usageLine(usage: OnboardingUsage, t: Translate): string {
  if (usage.llm_calls === 0) return t("usage.none");
  const tokens =
    usage.tokens_in === null || usage.tokens_out === null
      ? t("usage.tokensUnknown")
      : t("usage.tokens", { count: formatCount(usage.tokens_in + usage.tokens_out) });
  const cost = usage.cost_usd === null ? t("usage.costUnknown") : formatCost(usage.cost_usd);
  return [t("usage.calls", { count: usage.llm_calls }), tokens, cost, usage.model]
    .filter((part): part is string => !!part)
    .join(" · ");
}
