"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, Chip, EmptyState, ErrorState, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import type { IntentSource } from "@devdigest/shared";
import { usePrIntent, useDerivePrIntent } from "@/lib/hooks/reviews";
import { formatWhen } from "@/lib/datetime";
import { IntentBlock } from "./_components/IntentBlock";
import { CONFIDENCE_COLOR, SKELETON_ROWS } from "./constants";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null | undefined;
}

/**
 * The Overview tab's Intent section: why this PR exists, in scope, out of
 * scope, a confidence tier, and where each source came from. Mirrors the
 * mock's `BriefCard`'s Intent section (screen_pr_detail.jsx) — the "Risk
 * areas" half of that card is a later lesson, so this renders Intent only.
 */
export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading, isError } = usePrIntent(prId);
  const derive = useDerivePrIntent(prId);

  if (isLoading) {
    return (
      <Card>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={14} />
          ))}
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <ErrorState title={t("intent.error")} onRetry={() => derive.mutate(undefined)} />
      </Card>
    );
  }

  const intent = data?.intent ?? null;

  if (!intent) {
    return (
      <Card>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <EmptyState
          icon="Target"
          title={t("intent.empty")}
          body={t("intent.emptyHint")}
          cta={derive.isPending ? t("intent.deriving") : t("intent.derive")}
          ctaLoading={derive.isPending}
          onCta={() => derive.mutate(undefined)}
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerRight}>
            <span title={t(`intent.confidenceHint.${intent.confidence}`)}>
              <Badge color={CONFIDENCE_COLOR[intent.confidence]} dot>
                {t(`intent.confidence.${intent.confidence}`)}
              </Badge>
            </span>
            <IconBtn
              icon="RefreshCw"
              label={derive.isPending ? t("intent.deriving") : t("intent.derive")}
              onClick={() => derive.mutate(true)}
            />
          </div>
        }
      >
        {t("block.intent")}
      </SectionLabel>

      <IntentBlock intent={intent.intent} inScope={intent.in_scope} outOfScope={intent.out_of_scope} />

      {intent.sources.length > 0 && (
        <div style={s.provenanceRow}>
          {intent.sources.map((source, i) => (
            <SourceChip key={`${source.kind}-${source.ref ?? i}`} source={source} t={t} />
          ))}
        </div>
      )}

      <div style={s.footer}>
        {t("intent.derivedAt", { when: formatWhen(intent.derived_at), model: intent.model ?? "—" })}
      </div>
    </Card>
  );
}

/** One provenance chip. A resolved path-bearing source (`spec_doc`) gets the
 *  mono treatment its file path deserves; an unresolved one renders muted
 *  with a title explaining why — never as a broken/clickable link, since
 *  the DTO carries no URL for it (nothing to navigate to yet). */
function SourceChip({ source, t }: { source: IntentSource; t: (key: string, values?: Record<string, string>) => string }) {
  const label = t(`intent.source.${source.kind}`, source.ref ? { ref: source.ref } : undefined);

  if (!source.resolved) {
    return (
      <span title={t("intent.unresolved")}>
        <Chip>
          <span style={{ color: "var(--text-muted)" }}>{label}</span>
        </Chip>
      </span>
    );
  }

  if (source.kind === "spec_doc") {
    return (
      <Chip>
        <span className="mono">{label}</span>
      </Chip>
    );
  }

  return <Chip>{label}</Chip>;
}
