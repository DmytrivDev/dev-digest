/* ExportWizard — "Export to CI" (SPEC-08 AC-4..AC-16): a four-step Modal that
   previews the generated files, lets the user adjust triggers and post-as, and
   installs them as a PR or a zip.

   The wizard owns the form state (step, repo, triggers, post-as, the edited
   workflow, the regenerate notice, the install choice); the steps are
   presentational. Server data comes only from the hooks: the preview is a query
   keyed by what it was generated from, so a changed value regenerates it. The
   "edits were replaced" rule runs in the change handlers, not in an effect.
   Nothing is requested while the wizard sits on step 1 — Esc there is free. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent, CiPostAs, CiPreviewInput, CiTrigger } from "@devdigest/shared";
import { useCiPreview, useExportCi } from "@/lib/hooks/ci";
import { useRepos } from "@/lib/hooks/core";
import { useActiveRepo } from "@/lib/repo-context";
import { ConfigureStep } from "./_components/ConfigureStep";
import { DocsHelpLink } from "./_components/DocsHelpLink";
import { InstallStep,type InstallAction } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { TargetStep } from "./_components/TargetStep";
import {
  CI_PROVIDER,
  DEFAULT_POST_AS,
  DEFAULT_TRIGGERS,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_KEYS,
  STEP_PREVIEW,
  STEP_TARGET,
} from "./constants";
import { describeCiError, normalizeTriggers, toggleTrigger, type WizardInitial } from "./helpers";
import { s } from "./styles";

export function ExportWizard({
  agent,
  initial,
  onClose,
}: {
  agent: Agent;
  initial: WizardInitial;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const { repoId: activeRepoId } = useActiveRepo();
  const repos = useRepos().data ?? [];

  const [step, setStep] = React.useState(STEP_TARGET);
  const [pickedRepoId, setPickedRepoId] = React.useState<string | null>(initial.repoId ?? null);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>(() =>
    normalizeTriggers(initial.triggers ?? DEFAULT_TRIGGERS),
  );
  const [postAs, setPostAs] = React.useState<CiPostAs>(initial.postAs ?? DEFAULT_POST_AS);
  const [editedWorkflow, setEditedWorkflow] = React.useState<string | null>(null);
  const [replacedNotice, setReplacedNotice] = React.useState(false);
  const [action, setAction] = React.useState<InstallAction>("open_pr");

  const exportCi = useExportCi(agent.id);
  // A second click can land before React re-renders with `isPending`.
  const installing = React.useRef(false);

  // The picked repo, else the active one — derived, so it follows the repo list.
  const repo =
    repos.find((r) => r.id === pickedRepoId) ?? repos.find((r) => r.id === activeRepoId) ?? null;
  const providerSupported = agent.provider === CI_PROVIDER;

  const previewInput: CiPreviewInput | null =
    step >= STEP_PREVIEW && repo && providerSupported
      ? { repo_id: repo.id, triggers, post_as: postAs }
      : null;
  const preview = useCiPreview(agent.id, previewInput);
  const files = preview.data?.files;

  const providerMessage = t("exportWizard.target.providerNotSupported");
  const previewError = preview.isError ? describeCiError(preview.error, providerMessage) : null;
  const installError = exportCi.isError ? describeCiError(exportCi.error, providerMessage) : null;

  // Changing what the workflow is generated from regenerates it: a hand edit
  // cannot survive that, so say so (AC-10). Done here, in the handler.
  const dropEdits = () => {
    if (editedWorkflow === null) return;
    setEditedWorkflow(null);
    setReplacedNotice(true);
  };
  const onRepo = (id: string) => {
    if (id === repo?.id) return;
    setPickedRepoId(id);
    dropEdits();
  };
  const onToggleTrigger = (trigger: CiTrigger) => {
    setTriggers(toggleTrigger(triggers, trigger));
    dropEdits();
  };
  const onPostAs = (value: CiPostAs) => {
    if (value === postAs) return;
    setPostAs(value);
    dropEdits();
  };
  const onEdit = (contents: string) => {
    setEditedWorkflow(contents);
    setReplacedNotice(false);
  };

  const install = () => {
    if (installing.current || !previewInput) return;
    installing.current = true;
    exportCi.mutate(
      {
        ...previewInput,
        target: "gha",
        action,
        ...(editedWorkflow !== null ? { workflow_contents: editedWorkflow } : {}),
      },
      { onSettled: () => (installing.current = false) },
    );
  };

  const goBack = () => {
    // Leaving Install forgets its answer, so a changed setup can be installed again.
    if (step === STEP_INSTALL) exportCi.reset();
    setStep(step - 1);
  };

  const canContinue =
    step === STEP_TARGET ? !!repo && providerSupported : step === STEP_PREVIEW ? !!files : true;

  const footer = (
    <div style={s.footer}>
      {step > STEP_TARGET ? (
        <Button kind="secondary" icon="ChevronLeft" onClick={goBack}>
          {t("exportWizard.back")}
        </Button>
      ) : (
        <span />
      )}
      {step < STEP_INSTALL ? (
        <Button kind="primary" iconRight="ArrowRight" disabled={!canContinue} onClick={() => setStep(step + 1)}>
          {t("exportWizard.continue")}
        </Button>
      ) : exportCi.isSuccess ? (
        <Button kind="primary" icon="Check" onClick={onClose}>
          {t("exportWizard.done")}
        </Button>
      ) : (
        <Button kind="primary" icon="Check" disabled={exportCi.isPending || !files} onClick={install}>
          {exportCi.isPending ? t("exportWizard.installing") : t("exportWizard.installAction")}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      width={720}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.stepsBar}>
        <ExportWizardSteps step={step} labels={STEP_KEYS.map((k) => t(`exportWizard.steps.${k}`))} />
      </div>
      <div style={s.body}>
        {step === STEP_TARGET && (
          <TargetStep
            repos={repos}
            repoId={repo?.id ?? null}
            onRepo={onRepo}
            providerSupported={providerSupported}
          />
        )}
        {step >= STEP_PREVIEW && previewError && (
          <>
            <div role="alert" style={s.alert("crit")}>
              {previewError}
            </div>
            {step !== STEP_INSTALL && <DocsHelpLink />}
          </>
        )}
        {step === STEP_PREVIEW && !files && !previewError && (
          <div style={s.muted}>{t("exportWizard.preview.generating")}</div>
        )}
        {step === STEP_PREVIEW && files && (
          <PreviewStep
            files={files}
            editedWorkflow={editedWorkflow}
            onEdit={onEdit}
            replacedNotice={replacedNotice}
          />
        )}
        {step === STEP_CONFIGURE && (
          <ConfigureStep
            triggers={triggers}
            postAs={postAs}
            onToggleTrigger={onToggleTrigger}
            onPostAs={onPostAs}
            replacedNotice={replacedNotice}
          />
        )}
        {step === STEP_INSTALL && (
          <InstallStep
            repoName={repo?.full_name ?? ""}
            fileCount={files?.length ?? null}
            action={action}
            onAction={setAction}
            outcome={exportCi.data}
            error={installError}
          />
        )}
      </div>
    </Modal>
  );
}
