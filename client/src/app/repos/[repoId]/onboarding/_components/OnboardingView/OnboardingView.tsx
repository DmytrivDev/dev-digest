/* OnboardingView — a guided tour of a repository, built from its index.

   Four things shape this screen. Generation is SYNCHRONOUS (one model call, up to
   two minutes), so every control that starts one locks while it runs — whether
   this tab started it or the server says another did. The repository may not be
   ready (no clone, not indexed yet): that is an ANSWER shown above the page, not
   a failure, and a tour already stored stays readable beneath it. Everything is
   DERIVED from the query — nothing is copied into state — so the polling in the
   hook is all it takes for "indexing finished" to enable Generate. And the text
   lives in `onboarding.json`, never here. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { TocNav, TourSections } from "../TourSections";
import { ReadinessNotice } from "./_components/ReadinessNotice";
import { StatusBanner } from "./_components/StatusBanner";
import { TourHeader } from "./_components/TourHeader";
import { UsageFooter } from "./_components/UsageFooter";
import { SKELETON_CARDS } from "./constants";
import { s } from "./styles";

export function OnboardingView() {
  const t = useTranslations("onboarding");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const query = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);

  const crumb = [{ label: activeRepo?.full_name ?? repoId, mono: true }, { label: t("page.crumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const data = query.data;

  if (!data || !activeRepo) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          {query.isError && !data ? (
            <ErrorState title={t("loadError.title")} onRetry={() => void query.refetch()} />
          ) : (
            <div style={s.stack} role="status" aria-busy="true">
              {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
                <Skeleton key={i} height={120} />
              ))}
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  const { readiness, tour } = data;
  const generating = generate.isPending || data.generating;
  const canGenerate = readiness === "ready" && !generating;
  const nowMs = Date.now();

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {!tour && (
          <h1 style={s.title}>
            {t("header.titlePrefix")}{" "}
            <span className="mono" style={s.repoName}>
              {activeRepo.name}
            </span>
          </h1>
        )}

        <ReadinessNotice
          readiness={readiness}
          generating={generating}
          hasTour={tour !== null}
          checking={query.isFetching}
          onCheckAgain={() => void query.refetch()}
        />

        {tour ? (
          <>
            <TourHeader
              tour={tour}
              repoName={activeRepo.name}
              nowMs={nowMs}
              showRegenerate={readiness !== "not_cloned"}
              regenerateDisabled={!canGenerate}
              onRegenerate={() => generate.mutate()}
            />
            <StatusBanner tour={tour} nowMs={nowMs} />
            <div style={s.body}>
              <aside style={s.toc}>
                <TocNav />
              </aside>
              <div style={s.content}>
                <TourSections tour={tour} repoFullName={activeRepo.full_name} />
                <UsageFooter usage={tour.usage} />
              </div>
            </div>
          </>
        ) : (
          readiness === "ready" && (
            <EmptyState
              icon="Workflow"
              title={t("empty.title")}
              body={t("empty.body")}
              cta={t("empty.cta")}
              ctaLoading={generating}
              onCta={() => generate.mutate()}
            />
          )
        )}
      </div>
    </AppShell>
  );
}
