/* EvalsTab — the agent's regression suite (SPEC-04 B): metric cards for the
   latest completed run, their trend over the completed runs (SPEC-05), the case
   list with Edit / Delete, and the last runs.

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
import { useDeleteEvalCase, useEvalCases, useEvalRuns } from "@/lib/hooks/eval";
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
  const [pendingDelete, setPendingDelete] = React.useState<EvalCase | null>(null);
  const [creating, setCreating] = React.useState(false);

  const allRuns = runs.data ?? [];
  const caseList = cases.data ?? [];
  const { latest, previous } = latestAndPrevious(allRuns);
  const runningRun = allRuns.find((r) => r.status === "running") ?? null;

  const openId = search.get(CASE_PARAM);
  const openCase = openId ? caseList.find((c) => c.id === openId) : undefined;
  const setOpenId = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set(CASE_PARAM, id);
    else sp.delete(CASE_PARAM);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
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

      <MetricTrend runs={allRuns} isLoading={runs.isLoading} isError={runs.isError} />

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
              />
            ))}
          </div>
        )}
      </div>

      <RunHistory agentId={agent.id} runs={allRuns} />

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
