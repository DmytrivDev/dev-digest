/* EvalCaseModal — one eval case, in three modes (SPEC-04 C, SPEC-05):
   - create: an empty case the user writes by hand (title "New eval case");
   - edit a MANUAL case: the same editable Diff / PR meta, prefilled;
   - edit a FINDING-born case: Name, Notes and Expected output only — its Input
     is a frozen copy of the source PR, shown read-only.
   There is no Files tab and no per-case Run: a case runs with the suite.

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
import { Button, Icon, Modal, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { checkPastedDiff, expectationDiffError, findingSkeleton } from "@/lib/eval-case-diff";
import { expectationText, lastRunParts, parseExpectationText } from "@/lib/eval";
import { useCreateManualEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval";
import { resultLineText } from "../../helpers";
import { DiffInput } from "./_components/DiffInput";
import { ExpectedPane } from "./_components/ExpectedPane";
import { PrMetaInput } from "./_components/PrMetaInput";
import { ReadOnlyInput } from "./_components/ReadOnlyInput";
import { buildCreateBody, buildPatch, nameIsValid } from "./helpers";
import { s } from "./styles";

const MODAL_WIDTH = 920;
type InputTab = "diff" | "prMeta";

type Props =
  | { mode: "create"; agentId: string; agentName: string; onClose: () => void }
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
  // The click lands before React re-renders with `isPending`; the ref keeps a
  // double click from creating two cases.
  const creating = React.useRef(false);
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
  const canSave =
    nameIsValid(shownName) && parsed.ok && expectationError === null && (!editable || check.ok) && !pending;

  const save = () => {
    if (!parsed.ok) return;
    const input = { diff: shownDiff, title: shownTitle, body: shownBody };
    if (!evalCase) {
      if (creating.current) return;
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

  const lastRun = evalCase ? lastRunParts(evalCase.last_outcome, evalCase.expectation) : null;
  const lastRunText =
    lastRun === null
      ? ""
      : lastRun.variant === "never"
        ? t("caseModal.lastRun.never")
        : lastRun.variant === "errored"
          ? t("caseModal.lastRun.errored", { reason: lastRun.reason })
          : t(`caseModal.lastRun.${lastRun.variant}`, {
              line: resultLineText(t, lastRun.line),
              seconds: lastRun.seconds,
              cost: formatCost(lastRun.costUsd),
            });
  const lastRunTone =
    lastRun?.variant === "passed" ? "ok" : lastRun?.variant === "failed" ? "crit" : lastRun?.variant === "errored" ? "warn" : "none";
  const LastRunIcon =
    lastRun?.variant === "passed" ? Icon.CheckCircle : lastRun?.variant === "failed" ? Icon.XCircle : lastRun?.variant === "errored" ? Icon.AlertTriangle : null;

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
          {lastRun && (
            <div style={s.lastRun(lastRunTone)}>
              {LastRunIcon && <LastRunIcon size={16} style={{ color: `var(--${lastRunTone})` }} />}
              <span>{lastRunText}</span>
            </div>
          )}
          {sourceText && <div style={s.source}>{sourceText}</div>}
        </div>
      </div>
    </Modal>
  );
}
