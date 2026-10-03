"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { usePrBrief, useGeneratePrBrief } from "@/lib/hooks/brief";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { BriefBanner } from "../BriefBanner";
import { blobHref, type BriefNav } from "../BriefFileRef";
import { RiskAreas } from "../RiskAreas";
import { ReviewFocusCard } from "../ReviewFocusCard";
import { selectLatestReview } from "../DiffTab/helpers";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  repoId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
  /** The PR's reviews, newest first — the banner borrows the newest `review`'s verdict. */
  reviews: ReviewRecord[] | undefined;
  /** The PR's files — a brief reference opens in Files changed only for one of these. */
  files: PrFile[];
  /** Go to Files changed on `path` (and `line` when known). */
  onOpenInDiff: (path: string, line: number | null) => void;
}

/**
 * The Overview tab, the PR Brief container: PR Brief label → banner → Intent (with
 * the brief's Risk areas) beside Blast radius → Review focus → Description. It owns
 * the brief query and mutation; every child is presentational. Intent and Blast
 * radius keep their own hooks and endpoints and render with or without a brief.
 */
export function OverviewTab({
  prId,
  prBody,
  repoId,
  repoFullName,
  headSha,
  reviews,
  files,
  onOpenInDiff,
}: OverviewTabProps) {
  const t = useTranslations("brief");
  const query = usePrBrief(prId);
  const generate = useGeneratePrBrief(prId);

  const brief = query.data?.brief ?? null;
  // In flight: our POST is pending, or the server says another one is running. The
  // very first read also shows skeletons — a Generate button before the answer
  // could start a second generation over an existing brief.
  const inFlight = generate.isPending || !!query.data?.generating || query.isLoading;
  const failure = generate.error ?? query.error;
  const error = failure
    ? { message: failure instanceof ApiError ? failure.message : t("banner.error") }
    : null;

  // Navigation of the brief's file references. A blast-only caller is not in the
  // diff; it links to GitHub at the commit the blast was indexed at.
  const blobSha = brief?.blast?.indexed_sha ?? headSha;
  const nav: BriefNav = {
    prPaths: new Set(files.map((f) => f.path)),
    blobHref: (path, line) => blobHref(repoFullName, blobSha, path, line),
    onOpen: onOpenInDiff,
  };

  return (
    <>
      <section style={s.brief}>
        <div>
          <SectionLabel icon="FileText">{t("section")}</SectionLabel>
          <BriefBanner
            brief={brief}
            stale={query.data?.stale ?? false}
            inFlight={inFlight}
            error={error}
            latestReview={selectLatestReview(reviews ?? [])}
            liveHeadSha={headSha ?? null}
            onGenerate={() => generate.mutate()}
          />
        </div>

        {/* Stacked, not side by side: the Blast radius card carries long mono paths
            and a graph that need the full width. */}
        <IntentCard
          prId={prId}
          riskAreas={<RiskAreas brief={brief} inFlight={inFlight} nav={nav} />}
        />
        <BlastRadiusCard
          repoId={repoId}
          prId={prId}
          repoFullName={repoFullName}
          headSha={headSha}
        />

        <ReviewFocusCard brief={brief} inFlight={inFlight} nav={nav} />
      </section>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
