/* ContextView — browse the markdown documents of a repository's local clone.

   View-only by design: the clone is reset on resync and nothing is ever pushed,
   so there is no Edit / New file / Upload here — only Refresh (re-read the
   clone's list) and a link to the file on GitHub. The list is capped server-side
   at 500, hence the "Showing N of M" notice and the filter. Which document the
   preview shows is DERIVED from the user's last pick and the list, not synced
   into state by an effect. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useContextFiles } from "@/lib/hooks/core";
import { DocList } from "./_components/DocList";
import { DocPreviewPane } from "./_components/DocPreviewPane";
import { FilterInput } from "./_components/FilterInput";
import { SKELETON_ROWS } from "./constants";
import { filterDocsByPath, resolveSelection } from "./helpers";
import { s } from "./styles";

export function ContextView() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const list = useContextFiles(repoId);

  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<string | null>(null);

  const repoName = activeRepo?.full_name ?? t("repoFallback");
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const data = list.data;
  const docs = data?.docs ?? [];
  const visible = filterDocsByPath(docs, query);
  const selectedPath = resolveSelection(docs, visible, picked);

  if (list.isLoading || list.isError || !data || docs.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.centered}>
          <h1 style={s.centeredH1}>{t("title")}</h1>
          {list.isLoading ? (
            <div style={s.skeletonStack} role="status" aria-label={t("list.loading")}>
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <Skeleton key={i} height={26} />
              ))}
            </div>
          ) : list.isError || !data ? (
            <ErrorState
              title={t("loadError")}
              body={list.error instanceof Error ? list.error.message : undefined}
              onRetry={() => void list.refetch()}
            />
          ) : (
            <>
              <EmptyState
                icon="FileText"
                title={t("empty.title", { repo: repoName, branch: data.branch })}
              />
              <div style={s.emptyAction}>
                <Button
                  kind="secondary"
                  icon="RefreshCw"
                  loading={list.isFetching}
                  onClick={() => void list.refetch()}
                >
                  {t("empty.refresh")}
                </Button>
              </div>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.split}>
        <div style={s.listColumn}>
          <div style={s.listHeader}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("title")}</h1>
              <Button
                kind="ghost"
                size="sm"
                icon="RefreshCw"
                loading={list.isFetching}
                onClick={() => void list.refetch()}
              >
                {t("refresh")}
              </Button>
            </div>
            <div className="mono" style={s.branch}>
              {repoName}@{data.branch}
            </div>
            <FilterInput
              value={query}
              onChange={setQuery}
              placeholder={t("filter.placeholder")}
              label={t("filter.label")}
            />
          </div>
          {data.truncated && (
            <div style={s.notice}>
              {t("truncated", { shown: docs.length, total: data.total })}
            </div>
          )}
          <DocList
            docs={visible}
            query={query}
            selectedPath={selectedPath}
            onSelect={setPicked}
          />
        </div>
        <div style={s.previewColumn}>
          <DocPreviewPane
            repoId={repoId}
            repo={activeRepo}
            branch={data.branch}
            path={selectedPath}
          />
        </div>
      </div>
    </AppShell>
  );
}
