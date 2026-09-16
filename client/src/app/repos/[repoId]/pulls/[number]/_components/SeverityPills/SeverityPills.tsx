/* SeverityPills — the "N CRITICAL · N WARNING · N SUGGESTION" row inside one
   expanded review run. Pure presentation over counts the panel already has:
   the numbers are a group/count over `severity`, never a model call. Only
   severities that actually occur in the run get a pill (the design's rule), and
   clicking the active one clears the filter. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_PILL_ORDER } from "../FindingsPanel/constants";

export function SeverityPills({
  counts,
  active,
  onToggle,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const present = SEVERITY_PILL_ORDER.filter((sv) => counts[sv] > 0);
  if (present.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {present.map((sv) => (
        <Chip
          key={sv}
          icon={SEV[sv].icon}
          color={SEV[sv].c}
          count={counts[sv]}
          active={active === sv}
          onClick={() => onToggle(sv)}
        >
          {t(`panel.severity.${sv}`)}
        </Chip>
      ))}
    </div>
  );
}

export default SeverityPills;
