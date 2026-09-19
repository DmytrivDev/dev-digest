/* ConventionsView — scan a repo for its house rules, triage them, ship a skill.

   Three things shape this screen. The scan is SYNCHRONOUS and rate-limited to
   five a minute, so the button locks while it runs and says so. Most proposals
   are noise, so triage is one click per card and the scan report explains the
   thin result instead of hiding it. And a rejected rule is kept server-side so
   a later scan cannot resurrect it — which only means anything if the user can
   still see it, hence the Rejected view rather than a silent disappearance. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionStatus, Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { notify } from "@/lib/toast";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { CandidateCard } from "../CandidateCard";
import { ScanSummary } from "./_components/ScanSummary";
import { SkillDraftModal } from "./_components/SkillDraftModal";
import { TriageFilter } from "./_components/TriageFilter";
import { SKELETON_CARDS, type FilterKey } from "./constants";
import { countByStatus, filterCandidates, parseFilter, scanErrorMessage } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);

  const [creating, setCreating] = React.useState(false);
  const [savedSkill, setSavedSkill] = React.useState<Skill | null>(null);

  const candidates = data?.candidates ?? [];
  const counts = countByStatus(candidates);
  const filter = parseFilter(search.get("status"));
  const visible = filterCandidates(candidates, filter);
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");

  // The view lives in the URL so a reload — the way criterion 48 is checked —
  // comes back to the same list rather than to the default one.
  const setFilter = (key: FilterKey) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("status", key);
    router.replace(`/repos/${repoId}/conventions?${sp.toString()}`);
  };

  const triage = (id: string, status: ConventionStatus) => update.mutate({ id, patch: { status } });
  const busyId = update.isPending ? update.variables?.id : undefined;

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      {creating && (
        <SkillDraftModal
          repoId={repoId}
          repoName={repoName}
          acceptedCount={counts.accepted}
          onClose={() => setCreating(false)}
          onCreated={(skill) => {
            setCreating(false);
            setSavedSkill(skill);
            notify.success(t("page.skillSaved", { name: skill.name }));
          }}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {candidates.length > 0
                ? t("page.candidateCount", { count: candidates.length })
                : t("page.subtitle")}
            </p>
          </div>
          {candidates.length > 0 && (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              disabled={extract.isPending}
              loading={extract.isPending}
              onClick={() => extract.mutate()}
            >
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {extract.isPending && <div style={s.scanHint}>{t("page.scanHint")}</div>}

        {extract.isError && (
          <div style={s.banner("error")}>
            <Icon.AlertTriangle size={15} style={s.bannerIcon("error")} />
            <span>
              {t("page.extractionFailed")} — {scanErrorMessage(extract.error, t)}
            </span>
          </div>
        )}

        {savedSkill && (
          <div style={s.banner("success")}>
            <Icon.Sparkles size={15} style={s.bannerIcon("success")} />
            <span>{t("page.skillSaved", { name: savedSkill.name })}</span>
            <div style={s.bannerActions}>
              <Link href={`/skills/${savedSkill.id}`}>
                <Button kind="ghost" size="sm" icon="ExternalLink">
                  {t("page.viewSkill")}
                </Button>
              </Link>
              <Button kind="ghost" size="sm" icon="X" onClick={() => setSavedSkill(null)}>
                {t("page.dismiss")}
              </Button>
            </div>
          </div>
        )}

        {extract.data && <ScanSummary report={extract.data.scan} />}

        {candidates.length > 0 && (
          <div style={s.toolbar}>
            <TriageFilter active={filter} counts={counts} onChange={setFilter} />
            {counts.accepted > 0 && (
              <div style={s.toolbarRight}>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Sparkles"
                  onClick={() => setCreating(true)}
                >
                  {t("page.createSkill")}
                </Button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={120} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            ctaLoading={extract.isPending}
            onCta={() => extract.mutate()}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="Filter"
            title={t("page.emptyFilter.title")}
            body={t("page.emptyFilter.body")}
          />
        ) : (
          visible.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              busy={busyId === candidate.id}
              onTriage={(status) => triage(candidate.id, status)}
              onSaveEdit={(patch) => update.mutate({ id: candidate.id, patch })}
            />
          ))
        )}
      </div>
    </AppShell>
  );
}
