"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Donut, SectionLabel, type DonutSegment } from "@devdigest/ui";
import type { CostBasis, PerfAgentCost, PerfModelCost } from "@devdigest/shared";
import { EstimateLabel } from "@/components/EstimateLabel";
import { formatCost } from "@/lib/cost";
import { DONUT_SIZE, SEGMENT_COLORS } from "./constants";
import { s } from "./styles";

function colored(parts: readonly { label: string; value: number }[]): DonutSegment[] {
  return parts.map((p, i) => ({ ...p, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]! }));
}

/* Two donuts over the same priced total. Unpriced runs have no segment (AC-47);
   with no priced run at all both panels say so instead of drawing a donut (AC-48). */
export function CostBreakdown({
  byAgent,
  byModel,
  totalCostUsd,
  runs,
  costBasis,
}: {
  byAgent: readonly PerfAgentCost[];
  byModel: readonly PerfModelCost[];
  totalCostUsd: number | null;
  runs: number;
  costBasis: CostBasis;
}) {
  const t = useTranslations("agentPerformance.breakdown");
  const noPriced = totalCostUsd === null && runs > 0;

  const panels = [
    {
      key: "byAgent",
      segments: colored(byAgent.map((a) => ({ label: a.agent_name, value: a.cost_usd }))),
    },
    {
      key: "byModel",
      segments: colored(byModel.map((m) => ({ label: m.model ?? t("modelNotRecorded"), value: m.cost_usd }))),
    },
  ] as const;

  return (
    <section aria-label={t("title")}>
      <SectionLabel icon="DollarSign" right={<EstimateLabel basis={costBasis} />}>
        {t("title")}
      </SectionLabel>
      <div style={s.grid}>
        {panels.map((p) => (
          <Card key={p.key}>
            <div style={s.cardTitle}>{t(p.key)}</div>
            {noPriced ? (
              <div style={s.none}>{t("noPriced")}</div>
            ) : (
              <Donut segments={p.segments} size={DONUT_SIZE} formatValue={formatCost} />
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
