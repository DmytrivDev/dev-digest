/* FindingsTooltip — read-only preview of the latest run's findings, shown on
   hover over the FINDINGS cell. Ported from prdetail_runs.jsx.

   Deliberately TEXT ONLY: no Accept/Reject, no links, no buttons of any kind.
   Triaging a finding happens on the PR page, where the full card gives enough
   context to judge it; this popup exists to answer "what did the reviewer
   actually find?" without leaving the list.

   Rendered only while the cell is hovered, so `usePrReviews` fires lazily —
   the list never fetches findings for rows nobody looks at. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, Skeleton } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { s } from "../../styles";

/** "12" for a one-line finding, "12-18" for a range. */
function lineLabel(f: FindingRecord): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** Previews are one line of plain text — drop the markdown the card renders. */
function stripMd(text: string): string {
  return text.replace(/\*\*|`/g, "");
}

export function FindingsTooltip({
  prId,
  placement = "down",
}: {
  prId: string;
  placement?: "up" | "down";
}) {
  const t = useTranslations("prReview");
  const { data, isLoading } = usePrReviews(prId);
  // The list's FINDINGS column counts the latest `review` (summaries excluded),
  // and this endpoint returns both kinds — match it or the popup contradicts the cell.
  const latest = data?.find((r) => r.kind === "review");
  const items = latest?.findings ?? [];

  return (
    <div style={s.findingsPopup(placement)} onClick={(e) => e.stopPropagation()}>
      <div style={s.findingsPopupTitle}>
        <Icon.AlertOctagon size={12} />
        {t("list.findingsPopup.title", { count: items.length })}
      </div>
      {isLoading ? (
        <div style={s.findingsPopupList}>
          <Skeleton height={16} />
          <Skeleton height={16} />
        </div>
      ) : items.length === 0 ? (
        <div style={s.findingsPopupEmpty}>{t("list.findingsPopup.empty")}</div>
      ) : (
        <div style={s.findingsPopupList}>
          {items.map((f, i) => (
            <div key={f.id} style={s.findingsPopupItem(i === items.length - 1)}>
              <div style={s.findingsPopupHead}>
                <SeverityBadge severity={f.severity} compact />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {f.title}
                </span>
                <CategoryTag category={f.category} />
              </div>
              <div style={s.findingsPopupMeta}>
                <span className="mono" style={s.findingsPopupLocation}>
                  {f.file}:{lineLabel(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <div style={s.findingsPopupRationale}>{stripMd(f.rationale)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FindingsTooltip;
