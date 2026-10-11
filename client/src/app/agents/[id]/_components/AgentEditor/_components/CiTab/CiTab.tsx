/* CiTab — where the agent runs in CI (SPEC-08 AC-1..AC-3): the "Fail CI on"
   gate, the repositories it is exported to with the last run of each, the CI
   Runs table filtered to this agent, and the entry points of the Export wizard.
   Server data comes only from the hooks; the wizard is mounted on demand, so it
   starts from fresh state each time it opens. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, FormField, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation } from "@devdigest/shared";
import { CiRunsTable, runStatusTone } from "@/components/CiRunsTable";
import { useCiInstallations, useCiRuns } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { ExportWizard, type WizardInitial } from "./_components/ExportWizard";
import { CI_FAIL_ON_VALUES } from "./constants";
import { newestInstallation, relativeTime, wizardInitialOf } from "./helpers";
import { s } from "./styles";

type Translate = ReturnType<typeof useTranslations>;

function InstallationRow({ installation, now, t }: { installation: CiInstallation; now: number; t: Translate }) {
  const last = installation.last_run;
  const ago = last?.ran_at ? relativeTime(last.ran_at, now) : null;
  return (
    <div style={s.row}>
      <Icon.GitBranch size={16} style={s.rowIcon} />
      <span className="mono" style={s.repo}>
        {installation.repo}
      </span>
      <Badge color="var(--text-secondary)" icon="Workflow">
        {t("ciTab.githubActions")}
      </Badge>
      {last ? (
        <>
          <Badge {...runStatusTone(last.status)} dot>
            {t(`ciTab.runStatus.${last.status}`)}
          </Badge>
          {ago && <span style={s.ago}>{t(`ciTab.ago.${ago.key}`, { n: ago.n })}</span>}
        </>
      ) : (
        <span style={s.ago}>{t("ciTab.noRuns")}</span>
      )}
      <span style={s.versions}>
        {t("ciTab.versions", { generator: installation.generator_version, agent: installation.agent_version })}
      </span>
    </div>
  );
}

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const ta = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const installations = useCiInstallations(agent.id);
  const runs = useCiRuns(agent.id);
  // The wizard's opening state; null = closed. "Add to CI" opens it empty, so the
  // active repo is preselected; "Update CI config" opens it on the newest installation.
  const [wizard, setWizard] = React.useState<WizardInitial | null>(null);
  const [now] = React.useState(() => Date.now());

  const list = installations.data?.installations;
  const newest = list ? newestInstallation(list) : undefined;
  // What the select shows while the save is in flight, derived — not mirrored into state.
  const failOn: CiFailOn = update.isPending
    ? (update.variables?.patch.ci_fail_on ?? agent.ci_fail_on)
    : agent.ci_fail_on;
  const failOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));

  const saveFailOn = (value: string) =>
    update.mutate(
      { id: agent.id, patch: { ci_fail_on: value as CiFailOn } },
      { onSuccess: (data) => toast.success(ta("config.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      {installations.isLoading && <Skeleton height={120} />}
      {installations.isError && (
        <ErrorState title={t("ciTab.loadError")} onRetry={() => installations.refetch()} />
      )}

      {list && list.length === 0 && (
        <EmptyState
          icon="Workflow"
          title={t("ciTab.emptyTitle")}
          body={t("ciTab.emptyBody")}
          cta={t("ciTab.exportToCi")}
          onCta={() => setWizard({})}
        />
      )}

      {list && list.length > 0 && (
        <>
          <div style={s.header}>
            <h2 style={s.h2}>{t("ciTab.heading")}</h2>
            <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
              {t("ciTab.activeIn", { count: list.length })}
            </Badge>
            <div style={s.actions}>
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                onClick={() => newest && setWizard(wizardInitialOf(newest))}
              >
                {t("ciTab.updateConfig")}
              </Button>
              <Button kind="primary" size="sm" icon="Plus" onClick={() => setWizard({})}>
                {t("ciTab.addToCi")}
              </Button>
            </div>
          </div>
          {list.map((installation) => (
            <InstallationRow key={installation.id} installation={installation} now={now} t={t} />
          ))}
          <button type="button" style={s.addRow} onClick={() => setWizard({})}>
            <Icon.Plus size={14} />
            {t("ciTab.addRepository")}
          </button>
        </>
      )}

      <div style={s.failOn}>
        <FormField label={t("ciTab.failOn")} hint={ta("config.ciFailOnHint")}>
          <SelectInput value={failOn} onChange={saveFailOn} options={failOnOptions} />
        </FormField>
      </div>

      {list && list.length > 0 && runs.data && runs.data.runs.length > 0 && (
        <div style={s.runs}>
          <CiRunsTable runs={runs.data.runs} />
        </div>
      )}

      {wizard && <ExportWizard agent={agent} initial={wizard} onClose={() => setWizard(null)} />}
    </div>
  );
}
