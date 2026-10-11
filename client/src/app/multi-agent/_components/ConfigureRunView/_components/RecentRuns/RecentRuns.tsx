/* RecentRuns — links to the PR's newest multi-agent runs (SPEC-08 AC-43). Renders
   nothing for an empty list. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { formatWhen } from "@/lib/datetime";
import { formatSeconds } from "@/lib/multi-agent";
import { s } from "./styles";

export function RecentRuns({ runs }: { runs: MultiAgentRunSummary[] }) {
  const t = useTranslations("multiAgent");
  if (runs.length === 0) return null;
  return (
    <section style={s.section} aria-label={t("recent.title")}>
      <h2 style={s.title}>{t("recent.title")}</h2>
      <div style={s.list}>
        {runs.map((r) => (
          <Link key={r.id} href={`/multi-agent/${r.id}`} style={s.row}>
            <span style={s.when}>{formatWhen(r.ran_at)}</span>
            <span style={s.metric}>{t("recent.agents", { count: r.agent_count })}</span>
            <Badge
              dot
              color={r.status === "running" ? "var(--warn)" : "var(--ok)"}
            >
              {t(r.status === "running" ? "recent.running" : "recent.done")}
            </Badge>
            <span className="mono tnum" style={s.metric}>
              {formatSeconds(r.total_duration_ms)} · {formatCost(r.total_cost_usd)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
