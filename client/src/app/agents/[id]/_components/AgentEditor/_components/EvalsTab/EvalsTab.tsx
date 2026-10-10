/* EvalsTab — the agent's regression suite (SPEC-04 B): metric cards for the
   latest completed run, their trend over the completed runs (SPEC-05), the case
   list with Run / Edit / Delete, and the last runs.

   A single-case run (SPEC-07) is a run of the agent too, but not part of the
   suite's numbers: the cards, the badge, the trend and the history read
   `suiteRunsOnly`, while "is anything running" reads both scopes.

   The open case lives in the URL (`?tab=evals&case=<id>`), so "In eval suite"
   on a PR finding lands here with its modal open (AC-5) and a reload keeps it.
   "New eval case" opens the same modal in create mode; that open flag is local
   state, not URL state. Server data comes only from the hooks; nothing is copied
   into state. */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState } from "@devdigest/ui";
import type { Agent, EvalCase } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EvalRunButton } from "@/components/EvalRunButton";
import { runningRunOf, suiteRunsOnly } from "@/lib/eval";
import {
  useDeleteEvalCase,
  useEvalCases,
  useEvalRun,
  useEvalRuns,
  useStartCaseRun,
} from "@/lib/hooks/eval";
import { EvalCaseModal } from "./_components/EvalCaseModal";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { EvalMetrics } from "./_components/EvalMetrics";
import { MetricTrend } from "./_components/MetricTrend";
import { RunHistory } from "./_components/RunHistory";
import { CASE_PARAM } from "./constants";
import { latestAndPrevious } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const cases = useEvalCases(agent.id);
  const runs = useEvalRuns(agent.id);
  const del = useDeleteEvalCase(agent.id);
  const startCase = useStartCaseRun(agent.id);
  // The click lands before React re-renders with `isPending`; the ref keeps a
  // double click on a row's Run from starting two runs (AC-21).
  const rowStarting = React.useRef(false);
  // The run a row's Run started is followed by id: the 202 says it was running, so
  // the rows refresh when it is first read final, even if no read caught it
  // `running` (an instant provider error; AC-16, AC-18).
  const [startedRunId, setStartedRunId] = React.useState<string | null>(null);
  useEvalRun(startedRunId, agent.id);
  const [pendingDelete, setPendingDelete] = React.useState<EvalCase | null>(null);
  const [creating, setCreating] = React.useState(false);

  const allRuns = runs.data ?? [];
  const caseList = cases.data ?? [];
  const suiteRuns = suiteRunsOnly(allRuns);
  const { latest, previous } = latestAndPrevious(suiteRuns);
  const runningRun = runningRunOf(allRuns);

  const openId = search.get(CASE_PARAM);
  const openCase = openId ? caseList.find((c) => c.id === openId) : undefined;
  const setOpenId = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set(CASE_PARAM, id);
    else sp.delete(CASE_PARAM);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const runCase = (caseId: string) => {
    if (rowStarting.current) return;
    rowStarting.current = true;
    startCase.mutate(
      { caseId, afterSave: false },
      {
        onSuccess: (started) => setStartedRunId(started.run_id),
        onSettled: () => (rowStarting.current = false),
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.heading}>{t("evalsTab.casesHeading")}</h2>
        {latest && (
          <Badge color="var(--ok)" bg="var(--ok-bg)">
            {t("evalsTab.passing", { passed: latest.cases_passed, scored: latest.cases_scored })}
          </Badge>
        )}
        <div style={s.headerActions}>
          <EvalRunButton
            agentId={agent.id}
            caseCount={caseList.length}
            variant="tab"
            runningRun={runningRun}
          />
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
            {t("evalsTab.newCase")}
          </Button>
        </div>
      </div>

      <div style={s.section}>
        <EvalMetrics latest={latest} previous={previous} />
      </div>

      <MetricTrend runs={suiteRuns} isLoading={runs.isLoading} isError={runs.isError} />

      <div style={s.section}>
        {cases.isLoading ? (
          <div style={s.message}>{t("evalsTab.loadingCases")}</div>
        ) : cases.isError ? (
          <div style={s.message}>{t("evalsTab.loadError")}</div>
        ) : caseList.length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("evalsTab.emptyTitle")} body={t("evalsTab.emptyBody")} />
        ) : (
          <div role="list">
            {caseList.map((c) => (
              <EvalCaseRow
                key={c.id}
                evalCase={c}
                onOpen={() => setOpenId(c.id)}
                onDelete={() => setPendingDelete(c)}
                onRun={() => runCase(c.id)}
                runDisabled={!!runningRun || startCase.isPending}
                running={runningRun?.scope === "case" && runningRun.case_id === c.id}
              />
            ))}
          </div>
        )}
      </div>

      <RunHistory agentId={agent.id} runs={suiteRuns} />

      {openCase && (
        <EvalCaseModal
          key={openCase.id}
          mode="edit"
          evalCase={openCase}
          agentName={agent.name}
          onClose={() => setOpenId(null)}
        />
      )}
      {creating && (
        <EvalCaseModal
          mode="create"
          agentId={agent.id}
          agentName={agent.name}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            // Run case in create mode: the case exists now, so continue in its edit modal.
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t("evalsTab.deleteDialog.title", { name: pendingDelete.name })}
          body={t("evalsTab.deleteDialog.body")}
          confirmLabel={t("evalsTab.deleteDialog.confirm")}
          busy={del.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })}
        />
      )}
    </div>
  );
}
