/* /ci-runs — the runs executed inside CI (SPEC-08 AC-35, AC-37, AC-38).
   Refresh ingests from GitHub; a failure per repo is shown above the table,
   which keeps listing the runs stored earlier. Server data comes only from the
   hooks; nothing is copied into state. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { CiRunsTable } from "@/components/CiRunsTable";
import { describeApiError } from "@/lib/api";
import { useCiRuns, useRefreshCi } from "@/lib/hooks/ci";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const router = useRouter();
  const runs = useCiRuns();
  const refresh = useRefreshCi();

  const list = runs.data?.runs;
  const refreshErrors = refresh.data?.errors ?? [];
  const hasRefreshError = refreshErrors.length > 0 || refresh.isError;

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
            </Button>
          </div>
        </div>

        {hasRefreshError && (
          <div role="alert" style={s.errorBox}>
            <div style={s.errorTitle}>{t("runs.refreshError")}</div>
            <ul style={s.errorList}>
              {refreshErrors.map((e, i) => (
                <li key={`${e.repo}-${i}`}>
                  {e.repo}: {e.message}
                </li>
              ))}
              {refresh.isError && <li>{describeApiError(refresh.error)}</li>}
            </ul>
          </div>
        )}

        {runs.isLoading && <Skeleton height={220} />}
        {runs.isError && <ErrorState title={t("runs.loadError")} onRetry={() => runs.refetch()} />}
        {list && list.length === 0 && (
          <EmptyState
            icon="Workflow"
            title={t("runs.emptyTitle")}
            body={t("runs.emptyBody")}
            cta={t("runs.emptyCta")}
            onCta={() => router.push("/agents")}
          />
        )}
        {list && list.length > 0 && <CiRunsTable runs={list} />}
      </div>
    </AppShell>
  );
}
