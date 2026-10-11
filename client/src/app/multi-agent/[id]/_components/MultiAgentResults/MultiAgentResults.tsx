/* MultiAgentResults — results page of one multi-agent run (SPEC-08 AC-27..AC-39).
   Header + meta row, the Columns/Tabs views, "Where agents disagree" and ONE
   run-trace drawer addressed by `?trace=<runId>`. The run is polled by the
   data hook while it is still running; this component only renders it. */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/RunTraceDrawer";
import { formatCost } from "@/lib/cost";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { formatSeconds, readLastRun, writeLastPr, writeLastRun } from "@/lib/multi-agent";
import { useActiveRepo } from "@/lib/repo-context";
import { AgentColumns } from "../AgentColumns";
import { AgentTabs } from "../AgentTabs";
import { DisagreementsBlock } from "../DisagreementsBlock";
import { s } from "./styles";

type Mode = "columns" | "tabs";
const MODES: Mode[] = ["columns", "tabs"];

export function MultiAgentResults({ id }: { id: string }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data: run, isError, refetch } = useMultiAgentRun(id);
  const [mode, setMode] = React.useState<Mode>("columns");

  // /multi-agent has no :repoId in its path, so the shell falls back to the
  // stored repo, or the first one. Adopt the run's repo so the switcher and the
  // Configure run screen (whose PR list is the active repo's) match this run.
  const { repoId, setRepoId } = useActiveRepo();
  const runRepoId = run?.repo_id ?? null;
  React.useEffect(() => {
    if (runRepoId && runRepoId !== repoId) setRepoId(runRepoId);
  }, [runRepoId, repoId, setRepoId]);

  // Remember this run's PR so the sidebar item reopens with it (AC-45).
  const runPrId = run?.pr_id ?? null;
  React.useEffect(() => {
    if (runPrId) writeLastPr(runPrId);
  }, [runPrId]);

  // Remember this run so the bare /multi-agent reopens it (AC-46); forget an id
  // that no longer resolves, or the sidebar item would land on an error forever.
  const runLoaded = !!run;
  React.useEffect(() => {
    if (runLoaded) writeLastRun(id);
    else if (isError && readLastRun() === id) writeLastRun(null);
  }, [runLoaded, isError, id]);

  const crumb = [{ label: t("nav.title") }, ...(run?.pr_number != null ? [{ label: `#${run.pr_number}`, mono: true }] : [])];

  if (!run) {
    return (
      <AppShell crumb={crumb}>
        {isError ? (
          <ErrorState title={t("results.loadError")} onRetry={() => refetch()} />
        ) : (
          <div style={{ padding: "24px 28px" }} aria-label={t("results.loading")}>
            <Skeleton height={220} />
          </div>
        )}
      </AppShell>
    );
  }

  // ?trace= opens a drawer only for one of THIS run's agent runs (AC-38).
  const traceId = search.get("trace");
  const traceCol = run.columns.find((c) => c.run_id === traceId) ?? null;
  const setTrace = (runId: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (runId) next.set("trace", runId);
    else next.delete("trace");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const view =
    mode === "columns" ? (
      <AgentColumns columns={run.columns} startedAt={run.ran_at} onOpenTrace={setTrace} />
    ) : (
      <AgentTabs columns={run.columns} prId={run.pr_id} onOpenTrace={setTrace} onChanged={() => refetch()} />
    );

  return (
    <AppShell crumb={crumb}>
      <div style={s.header}>
        <Link href={`/multi-agent?pr=${encodeURIComponent(run.pr_id)}`} style={s.configure}>
          <Icon.Settings size={13} />
          {t("results.configureRun")}
        </Link>
        <h1 style={s.h1}>{t("results.title")}</h1>
        <span style={s.subtitle}>{t("results.selectedAgents", { count: run.agent_count })}</span>
        <div style={s.modes} role="group" aria-label={t("results.modeLabel")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              style={s.mode(mode === m)}
            >
              {t(m === "columns" ? "results.modeColumns" : "results.modeTabs")}
            </button>
          ))}
        </div>
      </div>

      <div style={s.meta}>
        {run.pr_number != null && (
          <span className="mono" style={s.metaNum}>
            #{run.pr_number}
          </span>
        )}
        {run.pr_title && <span style={s.metaTitle}>{run.pr_title}</span>}
        <span style={s.metaRight}>
          <Icon.Cpu size={14} style={{ color: "var(--accent)" }} />
          {t("results.meta", {
            count: run.agent_count,
            time: formatSeconds(run.total_duration_ms),
            cost: formatCost(run.total_cost_usd),
          })}
        </span>
      </div>

      {view}

      <div style={s.disagree}>
        <DisagreementsBlock groups={run.groups} columns={run.columns} />
      </div>

      {traceCol && (
        <RunTraceDrawer
          key={traceCol.run_id}
          runId={traceCol.run_id}
          agentName={traceCol.agent_name}
          prNumber={run.pr_number}
          findings={traceCol.findings}
          running={traceCol.status === "running"}
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}
