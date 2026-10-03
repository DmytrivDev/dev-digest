"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import type { BriefInput, PrBrief, ReviewRecord } from "@devdigest/shared";
import { VerdictBanner } from "../VerdictBanner";
import { INPUT_TOKEN_BUDGET, SHORT_SHA, SKELETON_ROWS } from "./constants";
import { blockersOf, costText, droppedCount, inputsLine, isBriefStale, kilo } from "./helpers";
import { s } from "./styles";

type Translate = ReturnType<typeof useTranslations>;

interface BriefBannerProps {
  brief: PrBrief | null;
  /** The `stale` flag of the GET envelope. */
  stale: boolean;
  /** A generation is running (POST pending or the server reports `generating`). */
  inFlight: boolean;
  /** The last failure of a brief request, shown inline (never as a toast). */
  error: { message: string } | null;
  /** The newest review of kind `review`, or null — it supplies verdict, badge and score. */
  latestReview: ReviewRecord | null;
  /** The head SHA the page shows now; a brief built for another head is stale. */
  liveHeadSha: string | null;
  onGenerate: () => void;
}

/**
 * The Overview's brief banner: the brief summary in the verdict banner's frame, the
 * newest review's verdict and score when there is one, the generation cost, and the
 * states around a brief that does not exist yet, is being built, failed or is stale.
 * Presentational — the Overview container owns the queries and the mutation.
 */
export function BriefBanner({
  brief,
  stale,
  inFlight,
  error,
  latestReview,
  liveHeadSha,
  onGenerate,
}: BriefBannerProps) {
  if (!brief) {
    return inFlight ? <PendingBanner /> : <EmptyBanner error={error} onGenerate={onGenerate} />;
  }
  return (
    <FilledBanner
      brief={brief}
      stale={stale}
      inFlight={inFlight}
      error={error}
      latestReview={latestReview}
      liveHeadSha={liveHeadSha}
      onGenerate={onGenerate}
    />
  );
}

function SummarySkeleton() {
  return (
    <div style={s.skeletonStack}>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <Skeleton key={i} height={14} />
      ))}
    </div>
  );
}

/** No brief yet and one is being built: skeleton rows and a disabled Generate. */
function PendingBanner() {
  const t = useTranslations("brief");
  return (
    <div style={s.empty}>
      <div style={s.emptyText}>
        <SummarySkeleton />
      </div>
      <Button kind="primary" icon="Sparkles" disabled>
        {t("banner.generate")}
      </Button>
    </div>
  );
}

/** No brief and nothing running: the call to action, or the failure with Retry. */
function EmptyBanner({
  error,
  onGenerate,
}: {
  error: { message: string } | null;
  onGenerate: () => void;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.empty}>
      <div style={s.emptyText}>
        <p style={s.emptyTitle}>{t("unavailable")}</p>
        {error ? (
          <p role="alert" style={s.error}>
            {error.message}
          </p>
        ) : (
          <p style={s.emptyBody}>{t("unavailableHint")}</p>
        )}
      </div>
      {error ? (
        <Button kind="secondary" icon="RefreshCw" onClick={onGenerate}>
          {t("banner.retry")}
        </Button>
      ) : (
        <Button kind="primary" icon="Sparkles" onClick={onGenerate}>
          {t("banner.generate")}
        </Button>
      )}
    </div>
  );
}

function FilledBanner({
  brief,
  stale,
  inFlight,
  error,
  latestReview,
  liveHeadSha,
  onGenerate,
}: Omit<BriefBannerProps, "brief"> & { brief: PrBrief }) {
  const t = useTranslations("brief");
  // A summary-kind review carries no verdict the brief should borrow.
  const review = latestReview?.kind === "review" && latestReview.verdict ? latestReview : null;
  const line = inputsLine(brief.inputs, inputsLabels(t));
  const dropped = droppedCount(brief.dropped);
  const showStale = isBriefStale(stale, brief.head_sha, liveHeadSha);
  const hasLines = inFlight || showStale || !!line || dropped > 0 || !!error;

  return (
    <VerdictBanner
      verdict={review?.verdict ?? null}
      summary={inFlight ? null : brief.summary}
      score={review?.score ?? null}
      findingsCount={review?.findings.length ?? 0}
      blockers={review ? blockersOf(review) : 0}
      cost={{
        text: costText(brief.usage),
        title:
          brief.usage.prompt_tokens != null && brief.usage.tokens_in != null
            ? `${brief.model} · ${t("banner.tokensTitle", {
                prompt: kilo(brief.usage.prompt_tokens),
                budget: kilo(INPUT_TOKEN_BUDGET),
                provider: kilo(brief.usage.tokens_in),
              })}`
            : brief.model,
      }}
      actions={
        <button
          type="button"
          style={s.refresh(inFlight)}
          aria-label={t("banner.refresh")}
          disabled={inFlight}
          onClick={onGenerate}
        >
          <Icon.RefreshCw
            size={16}
            style={inFlight ? { animation: "ddspin 1s linear infinite" } : undefined}
          />
        </button>
      }
    >
      {hasLines && (
        <div style={s.lines}>
          {inFlight && <SummarySkeleton />}
          {showStale && (
            <div style={s.stale}>
              <span>{t("banner.stale", { sha: brief.head_sha.slice(0, SHORT_SHA) })}</span>
              <Button kind="ghost" size="sm" icon="RefreshCw" disabled={inFlight} onClick={onGenerate}>
                {t("banner.regenerate")}
              </Button>
            </div>
          )}
          {line && <p style={s.muted}>{line}</p>}
          {dropped > 0 && <p style={s.muted}>{t("banner.dropped", { count: dropped })}</p>}
          {error && (
            <p role="alert" style={s.error}>
              {error.message}
            </p>
          )}
        </div>
      )}
    </VerdictBanner>
  );
}

/** Translators for `inputsLine`. An unknown reason code (the server may add one)
 *  shows as the code itself rather than a raw i18n key. */
function inputsLabels(t: Translate) {
  return {
    builtWithout: t("banner.builtWithout"),
    truncated: t("banner.truncated"),
    source: (source: BriefInput["source"]) => t(`inputs.source.${source}`),
    reason: (reason: string) => (t.has(`inputs.reason.${reason}`) ? t(`inputs.reason.${reason}`) : reason),
  };
}
