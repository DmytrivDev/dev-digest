"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { BriefFileRef, type BriefNav } from "../BriefFileRef";
import { s } from "./styles";

/** Skeleton rows while a generation is in flight. */
const SKELETON_ROWS = 3;

interface ReviewFocusCardProps {
  brief: PrBrief | null;
  /** A generation is running (POST pending or the server reports `generating`). */
  inFlight: boolean;
  nav: BriefNav;
}

/**
 * "Review focus — read these first": the brief's grounded `file:line` pointers,
 * each with the model's reason as plain text. Presentational — the Overview
 * container owns the brief query. No mock component exists (DR-18); this
 * composes Card, SectionLabel, Badge and BriefFileRef.
 */
export function ReviewFocusCard({ brief, inFlight, nav }: ReviewFocusCardProps) {
  const t = useTranslations("brief");
  const items = brief?.review_focus ?? [];

  return (
    <Card>
      <SectionLabel icon="ListChecks">
        {t("focus.title")}
        {brief && !inFlight && (
          <Badge color="var(--accent-text)" bg="var(--accent-bg)" style={s.badgeGap}>
            {items.length}
          </Badge>
        )}
      </SectionLabel>
      {inFlight ? (
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={14} />
          ))}
        </div>
      ) : !brief ? (
        <p style={s.placeholder}>{t("focus.notGenerated")}</p>
      ) : items.length === 0 ? (
        <p style={s.placeholder}>{t("focus.empty")}</p>
      ) : (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={`${item.file}:${item.line}`} style={s.item}>
              <span aria-hidden style={s.bullet}>
                ▸
              </span>
              <span>
                <BriefFileRef
                  path={item.file}
                  line={item.line}
                  label={`${item.file}:${item.line}`}
                  nav={nav}
                />
                <span style={s.reason}>{` — ${item.reason}`}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
