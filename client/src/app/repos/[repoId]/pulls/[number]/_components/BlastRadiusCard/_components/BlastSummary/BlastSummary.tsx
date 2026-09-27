"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastCounts } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";
import { SUMMARY_STATS } from "../../constants";
import { s } from "../../styles";

interface BlastSummaryProps {
  counts: BlastCounts;
}

/** Four stat chips — symbols / callers / endpoints / crons — from the
 *  facade's already-computed `counts`, so the client never re-derives them. */
export function BlastSummary({ counts }: BlastSummaryProps) {
  const t = useTranslations("blast");
  return (
    <div style={s.summaryRow}>
      {SUMMARY_STATS.map(({ key, icon }) => {
        const I = Icon[icon];
        return (
          <div key={key} style={s.stat}>
            <I size={14} style={s.statIcon} />
            <span className="tnum" style={s.statValue}>
              {counts[key].toLocaleString("en-US")}
            </span>
            <span style={s.statLabel}>{t(`stat.${key}`)}</span>
          </div>
        );
      })}
    </div>
  );
}
