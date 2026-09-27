"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlast, useBlastResync } from "@/lib/hooks/blast";
import { BlastSummary } from "./_components/BlastSummary";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs";
import { canResync } from "./helpers";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

type BlastView = "tree" | "graph";

interface BlastRadiusCardProps {
  repoId: string | null | undefined;
  prId: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

/**
 * The Overview tab's Blast Radius section: symbols declared in the PR's
 * changed files, who calls them, and the endpoints/crons behind those
 * callers. Read from the repo-intel index — no LLM call. Mirrors the mock's
 * `BlastRadiusCard` (`blast.jsx`), with a Tree/Graph toggle.
 */
export function BlastRadiusCard({ repoId, prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = usePrBlast(prId);
  const resync = useBlastResync(repoId, prId);
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading) {
    return (
      <Card>
        <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={14} />
          ))}
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
        <ErrorState title={t("error")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const degraded = !!data.degraded;
  const reason = data.reason;
  const showResync = canResync(data);
  const hasDownstream = data.downstream.length > 0;

  return (
    <Card>
      <SectionLabel
        icon="Workflow"
        right={
          <div style={s.headerRight}>
            {hasDownstream && (
              <div style={s.toggleRow}>
                <Button
                  kind="ghost"
                  size="sm"
                  active={view === "tree"}
                  onClick={() => setView("tree")}
                >
                  {t("view.tree")}
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  active={view === "graph"}
                  onClick={() => setView("graph")}
                >
                  {t("view.graph")}
                </Button>
              </div>
            )}
            {degraded && (
              <>
                <span title={reason ? t(`degraded.reason.${reason}`) : undefined}>
                  <Badge color="var(--warn)" dot>
                    {t("degraded.badge")}
                  </Badge>
                </span>
                {showResync && (
                  <Button
                    size="sm"
                    kind="ghost"
                    loading={resync.isRunning}
                    onClick={() => resync.start()}
                  >
                    {resync.isRunning ? t("resyncing") : t("resync")}
                  </Button>
                )}
                {resync.justCompleted && (
                  <Badge color="var(--ok)" dot>
                    {t("resyncDone")}
                  </Badge>
                )}
              </>
            )}
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      {degraded && reason && <div style={s.degradedReason}>{t(`degraded.reason.${reason}`)}</div>}

      {data.changed_symbols.length === 0 ? (
        <EmptyState icon="Workflow" title={t("noSymbols")} />
      ) : (
        <>
          {data.counts && <BlastSummary counts={data.counts} />}
          {!hasDownstream ? (
            <div style={s.noDownstream}>
              {t("noDownstream", { count: data.changed_symbols.length })}
            </div>
          ) : view === "tree" ? (
            <BlastTree
              downstream={data.downstream}
              repoFullName={repoFullName}
              indexedSha={data.indexed_sha}
              headSha={headSha}
            />
          ) : (
            <BlastGraph downstream={data.downstream} />
          )}
        </>
      )}

      <PriorPrs prId={prId} repoFullName={repoFullName} />
    </Card>
  );
}
