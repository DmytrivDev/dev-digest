"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/* Driven by the response's `cost_basis`: any value other than "estimate" renders
   nothing (AC-49). The explanation shows on hover and on keyboard focus. */
export function EstimateLabel({ basis }: { basis: string }) {
  const t = useTranslations("agentPerformance.estimate");
  const tipId = useId();
  const [open, setOpen] = useState(false);

  if (basis !== "estimate") return null;

  return (
    <span
      style={s.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        style={s.label}
        aria-describedby={tipId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {t("label")}
      </span>
      {open && (
        <span role="tooltip" id={tipId} style={s.tip}>
          {t("explanation")}
        </span>
      )}
    </span>
  );
}
