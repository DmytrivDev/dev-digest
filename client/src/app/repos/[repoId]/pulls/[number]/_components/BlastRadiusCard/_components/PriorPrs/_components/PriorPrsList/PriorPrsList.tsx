"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrHistory } from "@devdigest/shared";
import { Badge, MonoLink, Skeleton } from "@devdigest/ui";
import { githubPrUrl } from "@/lib/github-urls";
import { formatWhen } from "@/lib/datetime";
import { s as cardStyles } from "../../../../styles";
import { s } from "../../styles";

interface PriorPrsListProps {
  data: PrHistory | undefined;
  isLoading: boolean;
  repoFullName: string | null | undefined;
}

/**
 * The actual list — a pure presentational read of the query result its
 * parent already holds (no hook call, no state, no effect here). Split out
 * only so the parent can choose not to render it while the panel is closed,
 * which is what keeps `usePrHistory` from ever firing while collapsed.
 */
export function PriorPrsList({ data, isLoading, repoFullName }: PriorPrsListProps) {
  const t = useTranslations("blast");

  if (isLoading) {
    return (
      <div style={cardStyles.skeletonStack}>
        <Skeleton height={14} />
      </div>
    );
  }
  if (!data) return null;

  if (data.reason === "no_github") {
    return <div style={cardStyles.noDownstream}>{t("history.noGithub")}</div>;
  }
  if (data.reason === "github_error" && data.history.length === 0) {
    return <div style={cardStyles.noDownstream}>{t("history.githubError")}</div>;
  }
  if (data.history.length === 0) {
    return <div style={cardStyles.noDownstream}>{t("history.empty")}</div>;
  }

  return (
    <div style={s.priorPrsList}>
      {data.history.map((h) => (
        <div key={h.pr_number} style={s.priorPrRow}>
          <div style={s.priorPrHeaderRow}>
            {repoFullName ? (
              <MonoLink href={githubPrUrl(repoFullName, h.pr_number)}>{`#${h.pr_number}`}</MonoLink>
            ) : (
              <span className="mono">{`#${h.pr_number}`}</span>
            )}
            <span>{h.title}</span>
          </div>
          <div style={s.priorPrMeta}>
            {t("history.mergedBy", { author: h.author })} · {formatWhen(h.merged_at)}
          </div>
          {h.files_overlap.length > 0 && (
            <div style={s.chipRow}>
              {h.files_overlap.map((f) => (
                <Badge key={f} mono>
                  {f}
                </Badge>
              ))}
            </div>
          )}
          <div style={s.priorPrNotes}>{h.notes}</div>
        </div>
      ))}
    </div>
  );
}
