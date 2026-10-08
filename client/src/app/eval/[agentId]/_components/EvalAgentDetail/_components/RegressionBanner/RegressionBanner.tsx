/* RegressionBanner — "Precision dropped 6 pts on v8 vs v7" per dropped metric,
   and the cases that went from pass to fail (AC-86). Every name is user data
   (a case name is derived from a finding title), so it is rendered as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { EvalAlert } from "@devdigest/shared";
import { alertDropParams } from "@/lib/eval";
import { s } from "./styles";

export function RegressionBanner({ alert }: { alert: EvalAlert }) {
  const t = useTranslations("eval");
  return (
    <div role="alert" style={s.banner}>
      <Icon.AlertTriangle size={16} style={s.icon} />
      <div style={s.body}>
        {alert.drops.map((drop) => {
          const p = alertDropParams(drop);
          return (
            <span key={drop.metric} style={s.drop}>
              {t("detail.banner.drop", { ...p, metric: t(`common.metricName.${p.metric}`) })}
            </span>
          );
        })}
        {alert.now_failing.length > 0 && (
          <div style={s.failingList}>
            <span style={s.failingLabel}>{t("detail.banner.nowFailing")}</span>
            {alert.now_failing.map((c) => (
              <Badge key={c.case_id} color="var(--crit)" bg="var(--crit-bg)" mono>
                {c.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
