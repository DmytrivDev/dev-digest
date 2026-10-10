/* EvalCaseRow — one case of the agent's suite (AC-29): status icon, mono name,
   result line, kind badge, severity · category chip and Run / Edit / Delete
   icon buttons. Run starts a run of THIS case alone (SPEC-07); while that run
   is running a spinner stands in for the status icon. A manual case has no
   severity or category, so a "manual" badge stands in for the chip (SPEC-05
   AC-41).

   Case name and labels are user/model text → rendered as text only (NFR-4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, CategoryTag, Icon, IconBtn, SeverityBadge } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { resultLineParts } from "@/lib/eval";
import { CASE_STATUS_ICON } from "../../constants";
import { caseStatus, categoryOf, resultLineText, severityOf } from "../../helpers";
import { s } from "./styles";

export function EvalCaseRow({
  evalCase,
  onOpen,
  onDelete,
  onRun,
  runDisabled,
  running,
}: {
  evalCase: EvalCase;
  onOpen: () => void;
  onDelete: () => void;
  /** Starts a run of this case alone; never opens the modal. */
  onRun: () => void;
  /** Any run of the agent is running (or a start is in flight). */
  runDisabled: boolean;
  /** THIS case's own run is running: a spinner replaces the status icon. */
  running: boolean;
}) {
  const t = useTranslations("eval");
  const [hover, setHover] = React.useState(false);
  const status = caseStatus(evalCase.last_outcome);
  const { icon, color } = CASE_STATUS_ICON[status];
  const StatusIcon = Icon[icon];
  const severity = severityOf(evalCase.labels?.severity ?? "");
  const category = categoryOf(evalCase.labels?.category ?? "");

  return (
    <div
      role="listitem"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={s.row(hover)}
    >
      {running ? (
        <Icon.RefreshCw
          size={15}
          style={s.spinner}
          role="img"
          aria-label={t("evalsTab.row.running")}
        />
      ) : (
        <StatusIcon
          size={15}
          style={s.statusIcon(color)}
          role="img"
          aria-label={t(`evalsTab.row.status.${status}`)}
        />
      )}
      <button type="button" style={s.main}>
        <span className="mono" style={s.name} title={evalCase.name}>
          {evalCase.name}
        </span>
        <span style={s.result}>
          {resultLineText(t, resultLineParts(evalCase.last_outcome, evalCase.expectation))}
        </span>
      </button>
      <Badge color="var(--text-muted)">{t(`common.kind.${evalCase.expectation.kind}`)}</Badge>
      {evalCase.origin === "manual" ? (
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("evalsTab.row.manual")}
        </Badge>
      ) : (
        (severity || category) && (
          <span style={s.chip}>
            {severity && <SeverityBadge severity={severity} />}
            {category && <CategoryTag category={category} />}
          </span>
        )
      )}
      {/* The icon buttons sit inside the clickable row: their clicks must not
          also reach the row's own open handler. */}
      <span style={s.actions(hover)} onClick={(e) => e.stopPropagation()}>
        <IconBtn
          icon="Play"
          label={t("evalsTab.row.run")}
          size={26}
          onClick={onRun}
          disabled={runDisabled}
        />
        <IconBtn icon="Edit" label={t("evalsTab.row.edit")} size={26} onClick={onOpen} />
        <IconBtn icon="Trash" label={t("evalsTab.row.delete")} size={26} danger onClick={onDelete} />
      </span>
    </div>
  );
}
