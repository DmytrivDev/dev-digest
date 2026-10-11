/* /multi-agent — Configure run (SPEC-08 AC-3..AC-10). Step 1 picks a PR of the
   active repo (preselected from `?pr=`), step 2 picks the enabled agents; the
   footer shows the estimate and starts ONE multi-agent run, then navigates to
   its results page. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, SelectInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import {
  useAgentRunEstimates,
  useRecentMultiAgentRuns,
  useStartMultiAgentRun,
} from "@/lib/hooks/multi-agent";
import { footerEstimate, readLastPr, readLastRun, writeLastPr } from "@/lib/multi-agent";
import { AgentCard } from "./_components/AgentCard";
import { RecentRuns } from "./_components/RecentRuns";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const agentsQ = useAgents();
  const pullsQ = usePulls(activeRepo?.id);
  const start = useStartMultiAgentRun();

  // Local choice, initialised from `?pr=`, else the last PR picked (AC-45); the effective value is derived below
  // so a PR missing from the active repo's list never counts as selected.
  const [chosenPr, setChosenPr] = React.useState<string>(() => search.get("pr") ?? readLastPr());
  const [unchecked, setUnchecked] = React.useState<ReadonlySet<string>>(new Set());
  const inFlight = React.useRef(false);

  const enabled = (agentsQ.data ?? []).filter((a) => a.enabled);
  const pulls = (pullsQ.data ?? []).filter((p) => !!p.id);
  const prId = pulls.some((p) => p.id === chosenPr) ? chosenPr : "";
  const checked = enabled.filter((a) => !unchecked.has(a.id));
  const { data: est } = useAgentRunEstimates(enabled.map((a) => a.id));
  const estById = new Map((est?.estimates ?? []).map((e) => [e.agent_id, e]));
  const footer = footerEstimate(checked.map((a) => estById.get(a.id)));
  const recentQ = useRecentMultiAgentRuns(prId || null);

  // Landing (AC-46): the bare /multi-agent (the sidebar item) reopens the last
  // opened run; its "Configure run" button comes back here with `?pr=`, which
  // shows this form. Read in an effect: localStorage does not exist during SSR.
  const [redirecting, setRedirecting] = React.useState(false);
  React.useEffect(() => {
    if (search.has("pr") || search.has("new")) return;
    const last = readLastRun();
    if (!last) return;
    setRedirecting(true);
    router.replace(`/multi-agent/${last}`);
    // Landing decision is made once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crumb = [{ label: t("nav.title") }];

  if (redirecting || agentsQ.isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }
  if (agentsQ.isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState title={t("configure.loadError")} onRetry={() => agentsQ.refetch()} />
      </AppShell>
    );
  }
  if (enabled.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Cpu"
          title={t("configure.noAgentsTitle")}
          body={t("configure.noAgentsBody")}
          cta={t("configure.goToAgents")}
          onCta={() => router.push("/agents")}
        />
      </AppShell>
    );
  }

  const allChecked = checked.length === enabled.length;
  const canRun = !!prId && checked.length > 0 && !start.isPending;

  const run = async () => {
    if (!canRun || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await start.mutateAsync({ prId, agentIds: checked.map((a) => a.id) });
      router.push(`/multi-agent/${res.id}`);
    } catch {
      // The global mutation error toast reports it; stay on the page.
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("configure.title")}</h1>
          <p style={s.subtitle}>{t("configure.subtitle")}</p>
        </div>

        <section style={s.step} aria-label={t("configure.stepPr")}>
          <div style={s.stepHead}>
            <span style={s.stepNum}>1</span>
            <span style={s.stepTitle}>{t("configure.stepPr")}</span>
          </div>
          <SelectInput
            mono={false}
            value={prId}
            onChange={(v) => {
              setChosenPr(v);
              if (v) writeLastPr(v);
            }}
            options={[
              { value: "", label: t("configure.prPlaceholder") },
              ...pulls.map((p) => ({
                value: p.id as string,
                label: t("configure.prOption", { number: p.number, title: p.title }),
              })),
            ]}
          />
        </section>

        {prId && <RecentRuns runs={recentQ.data?.runs ?? []} />}

        <section style={s.step} aria-label={t("configure.stepAgents")}>
          <div style={s.stepHead}>
            <span style={s.stepNum}>2</span>
            <span style={s.stepTitle}>{t("configure.stepAgents")}</span>
            {prId && (
              <span style={s.selectAll}>
                <Button
                  kind="tertiary"
                  size="sm"
                  disabled={allChecked}
                  onClick={() => setUnchecked(new Set())}
                >
                  {t("configure.selectAll")}
                </Button>
              </span>
            )}
          </div>
          {prId ? (
            <div style={s.cards}>
              {enabled.map((a, i) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  index={i}
                  checked={!unchecked.has(a.id)}
                  estimate={estById.get(a.id)}
                  onChange={(v) =>
                    setUnchecked((prev) => {
                      const next = new Set(prev);
                      if (v) next.delete(a.id);
                      else next.add(a.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div style={s.empty}>
              <EmptyState
                icon="GitPullRequest"
                title={t("configure.noPrTitle")}
                body={t("configure.noPrBody")}
              />
            </div>
          )}
        </section>

        <div style={s.footer}>
          <span className="mono tnum" style={s.estimate}>
            {t("configure.estimate", { time: footer.time, cost: footer.cost })}
          </span>
          <Button kind="primary" icon="Sparkles" disabled={!canRun} onClick={run}>
            {t("configure.run", { count: checked.length })}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
