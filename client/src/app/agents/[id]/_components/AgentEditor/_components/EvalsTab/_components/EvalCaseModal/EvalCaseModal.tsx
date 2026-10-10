/* EvalCaseModal — one eval case, in three modes (SPEC-04 C, SPEC-05, SPEC-07):
   - create: an empty case the user writes by hand (title "New eval case");
   - edit a MANUAL case: the same editable Diff / PR meta, prefilled;
   - edit a FINDING-born case: Name, Notes and Expected output only — its Input
     is a frozen copy of the source PR, shown read-only.
   There is no Files tab. "Run case" (secondary, between Cancel and Save) saves
   what changed, then starts a run of THIS case alone and leaves the modal open
   (SPEC-07): the Last run line reads "Running…" and then the new outcome. In
   create mode it creates the case first and hands over to the edit modal.
   There is no "Run on save" toggle (a SPEC-07 non-goal).

   Everything shown comes from the case, the user or the model → rendered as text
   only (NFR-3). Escape closes through `Modal`; Cancel and Escape never ask.

   Fields hold a nullable OVERRIDE over the case (`name ?? case.name`), so an
   untouched field follows the case and Save sends only what differs
   (client/INSIGHTS.md, 2026-09-19). The diff verdict, the skeleton and the
   diff-relative expectation message are all derived from the typed text on every
   render — nothing is stored twice. The parent remounts the modal per case. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { checkPastedDiff, expectationDiffError, findingSkeleton } from "@/lib/eval-case-diff";
import {
  expectationText,
  parseExpectationText,
  runningCaseRunFor,
  runningRunOf,
} from "@/lib/eval";
import {
  useCreateManualEvalCase,
  useEvalRun,
  useEvalRuns,
  useStartCaseRun,
  useUpdateEvalCase,
} from "@/lib/hooks/eval";
import { DiffInput } from "./_components/DiffInput";
import { ExpectedPane } from "./_components/ExpectedPane";
import { LastRunLine } from "./_components/LastRunLine";
import { PrMetaInput } from "./_components/PrMetaInput";
import { ReadOnlyInput } from "./_components/ReadOnlyInput";
import { buildCreateBody, buildPatch, ownRunState, saveBlocked } from "./helpers";
import { s } from "./styles";

const MODAL_WIDTH = 920;
type InputTab = "diff" | "prMeta";

type Props =
  | {
      mode: "create";
      agentId: string;
      agentName: string;
      onClose: () => void;
      /** The case was created by Run case: hand over to the edit modal for `caseId`. */
      onCreated: (caseId: string) => void;
    }
  | { mode: "edit"; evalCase: EvalCase; agentName: string; onClose: () => void };

export function EvalCaseModal(props: Props) {
  const { agentName, onClose } = props;
  const evalCase = props.mode === "edit" ? props.evalCase : null;
  const agentId = props.mode === "edit" ? props.evalCase.agent_id : props.agentId;
  // Create mode and a manual case edit their input; a finding-born case cannot.
  const editable = evalCase === null || evalCase.origin === "manual";

  const t = useTranslations("eval");
  const create = useCreateManualEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);
  const startCase = useStartCaseRun(agentId);
  // The click lands before React re-renders with `isPending`; the refs keep a
  // double click from creating two cases or starting two runs (SPEC-07 AC-8).
  const creating = React.useRef(false);
  const runInFlight = React.useRef(false);
  const [name, setName] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<string | null>(null);
  const [expected, setExpected] = React.useState<string | null>(null);
  const [diff, setDiff] = React.useState<string | null>(null);
  const [prTitle, setPrTitle] = React.useState<string | null>(null);
  const [prBody, setPrBody] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<InputTab>("diff");

  const shownName = name ?? evalCase?.name ?? "";
  const shownNotes = notes ?? evalCase?.notes ?? "";
  const shownExpected = expected ?? (evalCase ? expectationText(evalCase.expectation) : "");
  const shownDiff = diff ?? evalCase?.input_diff ?? "";
  const shownTitle = prTitle ?? evalCase?.input_meta.title ?? "";
  const shownBody = prBody ?? evalCase?.input_meta.body ?? "";

  const parsed = parseExpectationText(shownExpected);
  const check = React.useMemo(() => checkPastedDiff(shownDiff), [shownDiff]);
  const skeleton = findingSkeleton(check);
  const expectationError = parsed.ok ? expectationDiffError(check, parsed.value) : null;
  const pending = create.isPending || update.isPending;
  const blocked = saveBlocked({
    name: shownName,
    expectationOk: parsed.ok,
    expectationError,
    editable,
    diffOk: check.ok,
    pending,
  });
  // Save never waits for a run (AC-15); Run case waits for every running run (AC-3).
  const canSave = !blocked;

  // The case's own run: found in the agent's runs list (it was started before this
  // modal opened), or followed by id from the 202 (a finished case run leaves the
  // list, so only the run read can say it was interrupted — AC-17). All derived.
  const runs = useEvalRuns(agentId);
  const runList = runs.data ?? [];
  const anyRunning = runningRunOf(runList) !== null;
  const listOwn = evalCase ? runningCaseRunFor(runList, evalCase.id) : null;
  const [trackedRunId, setTrackedRunId] = React.useState<string | null>(null);
  if (trackedRunId === null && listOwn) setTrackedRunId(listOwn.id);
  const own = useEvalRun(trackedRunId, agentId);
  const { running: ownRunning, interrupted } = ownRunState({
    listRunning: listOwn !== null,
    trackedRunId,
    read: own,
  });
  const canRunCase = !blocked && !anyRunning && !ownRunning && !startCase.isPending;

  const typedInput = { diff: shownDiff, title: shownTitle, body: shownBody };

  const save = () => {
    if (!parsed.ok) return;
    const input = typedInput;
    if (!evalCase) {
      if (creating.current || runInFlight.current) return;
      creating.current = true;
      const body = buildCreateBody({ name: shownName, notes: shownNotes, expectation: parsed.value, input });
      create.mutate(body, {
        onSuccess: onClose,
        onSettled: () => {
          creating.current = false;
        },
      });
      return;
    }
    const patch = buildPatch(evalCase, {
      name: shownName,
      notes: shownNotes,
      expectation: parsed.value,
      input: editable ? input : undefined,
    });
    if (!patch) return onClose();
    update.mutate({ id: evalCase.id, patch }, { onSuccess: onClose });
  };

  // Save what changed (if anything), then start a run of this case; the modal stays
  // open. A failing hook has already raised its ONE toast, so a rejection only
  // stops the sequence here: no run starts after a failed save (AC-9).
  const onCreated = props.mode === "create" ? props.onCreated : null;
  const runCase = async () => {
    if (!parsed.ok || runInFlight.current || creating.current) return;
    runInFlight.current = true;
    try {
      if (!evalCase) {
        const created = await create.mutateAsync(
          buildCreateBody({ name: shownName, notes: shownNotes, expectation: parsed.value, input: typedInput }),
        );
        try {
          await startCase.mutateAsync({ caseId: created.id, afterSave: true });
        } catch {
          /* the start hook toasted "Case saved; not run: …" */
        } finally {
          // The case exists either way: hand over to its edit modal (AC-7, AC-11).
          onCreated?.(created.id);
        }
        return;
      }
      const patch = buildPatch(evalCase, {
        name: shownName,
        notes: shownNotes,
        expectation: parsed.value,
        input: editable ? typedInput : undefined,
      });
      if (patch) await update.mutateAsync({ id: evalCase.id, patch });
      const started = await startCase.mutateAsync({ caseId: evalCase.id, afterSave: patch !== null });
      setTrackedRunId(started.run_id);
    } catch {
      /* the hook that failed already raised the one toast */
    } finally {
      runInFlight.current = false;
    }
  };

  const sourceText = !evalCase
    ? null
    : evalCase.origin === "manual"
      ? t("caseModal.source.manual")
      : evalCase.source?.available
        ? t("caseModal.source.line", {
            number: evalCase.source.pr_number,
            file: evalCase.expectation.file,
            start: evalCase.expectation.start_line,
            end: evalCase.expectation.end_line,
          })
        : t("caseModal.source.removed");

  return (
    <Modal
      width={MODAL_WIDTH}
      title={evalCase ? t("caseModal.title", { name: evalCase.name }) : t("caseModal.createTitle")}
      subtitle={t(evalCase ? "caseModal.subtitle" : "caseModal.createSubtitle", { agent: agentName })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("caseModal.cancel")}
          </Button>
          <Button
            kind="secondary"
            icon="Play"
            loading={ownRunning || startCase.isPending}
            disabled={!canRunCase}
            onClick={runCase}
          >
            {t("caseModal.runCase")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
            {pending ? t("caseModal.saving") : t("caseModal.save")}
          </Button>
        </div>
      }
    >
      <div style={s.grid}>
        <div style={s.left}>
          <label style={s.field}>
            <span style={s.fieldLabel}>{t("caseModal.nameLabel")}</span>
            <TextInput mono value={shownName} onChange={setName} />
          </label>
          <label style={s.field}>
            <span style={s.fieldLabel}>{t("caseModal.notesLabel")}</span>
            <Textarea
              rows={2}
              value={shownNotes}
              onChange={setNotes}
              placeholder={t("caseModal.notesPlaceholder")}
            />
          </label>
          <div style={s.inputLabel}>{t("caseModal.inputLabel")}</div>
          <Tabs
            tabs={[
              { key: "diff", label: t("caseModal.tabs.diff") },
              { key: "prMeta", label: t("caseModal.tabs.prMeta") },
            ]}
            value={tab}
            onChange={(k) => setTab(k as InputTab)}
            pad="0 16px"
          />
          <div style={s.inputBody}>
            {!editable && evalCase ? (
              <ReadOnlyInput evalCase={evalCase} tab={tab} />
            ) : tab === "diff" ? (
              <DiffInput value={shownDiff} onChange={setDiff} check={check} />
            ) : (
              <PrMetaInput title={shownTitle} body={shownBody} onTitle={setPrTitle} onBody={setPrBody} />
            )}
          </div>
        </div>
        <div style={s.right}>
          <ExpectedPane
            value={shownExpected}
            onChange={setExpected}
            valid={parsed.ok}
            error={expectationError}
            skeleton={
              editable
                ? {
                    enabled: skeleton !== null,
                    onClick: () => skeleton && setExpected(JSON.stringify(skeleton, null, 2)),
                  }
                : undefined
            }
          />
          {evalCase && <LastRunLine evalCase={evalCase} ownRunning={ownRunning} interrupted={interrupted} />}
          {sourceText && <div style={s.source}>{sourceText}</div>}
        </div>
      </div>
    </Modal>
  );
}
