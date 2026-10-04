"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import type { BriefNav } from "../BriefFileRef";
import { RiskPill } from "./_components/RiskPill";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

interface RiskAreasProps {
  brief: PrBrief | null;
  /** A generation is running (POST pending or the server reports `generating`). */
  inFlight: boolean;
  nav: BriefNav;
}

/**
 * The "Risk areas" block of the Intent card: the brief's risks as bordered pills.
 * Presentational — the Overview container owns the brief query.
 */
export function RiskAreas({ brief, inFlight, nav }: RiskAreasProps) {
  const t = useTranslations("brief");
  const risks = brief?.risks.risks ?? [];

  return (
    <div>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {inFlight ? (
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={38} />
          ))}
        </div>
      ) : !brief ? (
        <p style={s.placeholder}>{t("risks.notGenerated")}</p>
      ) : risks.length === 0 ? (
        <p style={s.placeholder}>{t("noRisks")}</p>
      ) : (
        <div style={s.list}>
          {risks.map((risk, i) => (
            <RiskPill key={`${risk.kind}:${risk.title}:${i}`} risk={risk} nav={nav} />
          ))}
        </div>
      )}
    </div>
  );
}
