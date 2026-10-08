/* EvalCaseModal — edit-only view of one eval case (SPEC-04 C). Name, Notes and
   the Expected output JSON are editable; the Input (Diff, PR meta) is a frozen
   copy of the source PR and is read-only. There is no Files tab, no skeleton
   and no per-case Run: a case is created from a finding and run with the suite.

   Everything shown comes from the case or the model → rendered as text only
   (NFR-4). Escape closes through `Modal`.

   Fields hold a nullable OVERRIDE over the case (`name ?? evalCase.name`), so
   an untouched field follows the case and Save sends only what differs
   (client/INSIGHTS.md, 2026-09-19). The parent remounts the modal per case
   (`key`). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Modal, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { expectationText, lastRunParts, parseExpectationText } from "@/lib/eval";
import { useUpdateEvalCase } from "@/lib/hooks/eval";
import { resultLineText } from "../../helpers";
import { buildPatch, diffLineKind } from "./helpers";
import { s } from "./styles";

const MODAL_WIDTH = 920;
type InputTab = "diff" | "prMeta";

export function EvalCaseModal({
  evalCase,
  agentName,
  onClose,
}: {
  evalCase: EvalCase;
  agentName: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const update = useUpdateEvalCase(evalCase.agent_id);
  const [name, setName] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<string | null>(null);
  const [expected, setExpected] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<InputTab>("diff");

  const shownName = name ?? evalCase.name;
  const shownNotes = notes ?? evalCase.notes ?? "";
  const shownExpected = expected ?? expectationText(evalCase.expectation);
  const parsed = parseExpectationText(shownExpected);
  const canSave = parsed.ok && shownName.trim() !== "" && !update.isPending;

  const save = () => {
    if (!parsed.ok) return;
    const patch = buildPatch(evalCase, {
      name: shownName,
      notes: shownNotes,
      expectation: parsed.value,
    });
    if (!patch) return onClose();
    update.mutate({ id: evalCase.id, patch }, { onSuccess: onClose });
  };

  const lastRun = lastRunParts(evalCase.last_outcome, evalCase.expectation);
  const lastRunText =
    lastRun.variant === "never"
      ? t("caseModal.lastRun.never")
      : lastRun.variant === "errored"
        ? t("caseModal.lastRun.errored", { reason: lastRun.reason })
        : t(`caseModal.lastRun.${lastRun.variant}`, {
            line: resultLineText(t, lastRun.line),
            seconds: lastRun.seconds,
            cost: formatCost(lastRun.costUsd),
          });
  const lastRunTone =
    lastRun.variant === "passed" ? "ok" : lastRun.variant === "failed" ? "crit" : lastRun.variant === "errored" ? "warn" : "none";
  const LastRunIcon =
    lastRun.variant === "passed" ? Icon.CheckCircle : lastRun.variant === "failed" ? Icon.XCircle : lastRun.variant === "errored" ? Icon.AlertTriangle : null;

  const exp = evalCase.expectation;
  const meta = evalCase.input_meta;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("caseModal.title", { name: evalCase.name })}
      subtitle={t("caseModal.subtitle", { agent: agentName })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("caseModal.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
            {update.isPending ? t("caseModal.saving") : t("caseModal.save")}
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
            {tab === "diff" ? (
              <pre className="mono" style={s.diff}>
                {evalCase.input_diff.split("\n").map((line, i) => (
                  <span key={i} style={s.diffLine(diffLineKind(line))}>
                    {line || " "}
                  </span>
                ))}
              </pre>
            ) : (
              <div>
                <div style={s.metaLabel}>{t("caseModal.prMeta.number")}</div>
                <div className="mono" style={s.metaValue}>
                  #{meta.pr_number}
                </div>
                <div style={s.metaLabel}>{t("caseModal.prMeta.title")}</div>
                <div style={s.metaValue}>{meta.title}</div>
                <div style={s.metaLabel}>{t("caseModal.prMeta.body")}</div>
                <div style={s.metaValue}>{meta.body ? meta.body : t("caseModal.prMeta.noBody")}</div>
              </div>
            )}
          </div>
        </div>
        <div style={s.right}>
          <label style={s.expected}>
            <span style={s.expectedHead}>
              <span style={s.expectedTitle}>{t("caseModal.expectedLabel")}</span>
              {parsed.ok ? (
                <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                  {t("caseModal.validJson")}
                </Badge>
              ) : (
                <Badge color="var(--crit)" bg="var(--crit-bg)" icon="X">
                  {t("caseModal.invalidJson")}
                </Badge>
              )}
            </span>
            <Textarea mono rows={14} value={shownExpected} onChange={setExpected} />
          </label>
          <div style={s.lastRun(lastRunTone)}>
            {LastRunIcon && <LastRunIcon size={16} style={{ color: `var(--${lastRunTone})` }} />}
            <span>{lastRunText}</span>
          </div>
          <div style={s.source}>
            {evalCase.source.available
              ? t("caseModal.source.line", {
                  number: evalCase.source.pr_number,
                  file: exp.file,
                  start: exp.start_line,
                  end: exp.end_line,
                })
              : t("caseModal.source.removed")}
          </div>
        </div>
      </div>
    </Modal>
  );
}
