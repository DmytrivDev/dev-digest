/* LastRunLine — the "Last run …" strip under a case's expected output. It shows,
   in this order of precedence:
   - "Running…" while this case's own run is running (SPEC-07 AC-13);
   - "Run interrupted — try again" when that run failed as interrupted (AC-17);
   - otherwise the latest outcome of the case, from either kind of run (AC-16).

   Pure presentation: the modal derives `ownRunning` / `interrupted` from the runs
   hooks and hands them in. Everything shown is text (NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { lastRunParts } from "@/lib/eval";
import { resultLineText } from "../../../../helpers";
import { s, type LastRunTone } from "./styles";

export function LastRunLine({
  evalCase,
  ownRunning,
  interrupted,
}: {
  evalCase: EvalCase;
  ownRunning: boolean;
  interrupted: boolean;
}) {
  const t = useTranslations("eval");

  if (ownRunning) {
    return (
      <div style={s.line("none")}>
        <Icon.RefreshCw size={16} style={s.spinner} />
        <span>{t("caseModal.running")}</span>
      </div>
    );
  }
  if (interrupted) {
    return (
      <div style={s.line("warn")}>
        <Icon.AlertTriangle size={16} style={s.icon("warn")} />
        <span>{t("caseModal.interrupted")}</span>
      </div>
    );
  }

  const lastRun = lastRunParts(evalCase.last_outcome, evalCase.expectation);
  const text =
    lastRun.variant === "never"
      ? t("caseModal.lastRun.never")
      : lastRun.variant === "errored"
        ? t("caseModal.lastRun.errored", { reason: lastRun.reason })
        : t(`caseModal.lastRun.${lastRun.variant}`, {
            line: resultLineText(t, lastRun.line),
            seconds: lastRun.seconds,
            cost: formatCost(lastRun.costUsd),
          });
  const tone: LastRunTone =
    lastRun.variant === "passed"
      ? "ok"
      : lastRun.variant === "failed"
        ? "crit"
        : lastRun.variant === "errored"
          ? "warn"
          : "none";
  const LineIcon =
    lastRun.variant === "passed"
      ? Icon.CheckCircle
      : lastRun.variant === "failed"
        ? Icon.XCircle
        : lastRun.variant === "errored"
          ? Icon.AlertTriangle
          : null;

  return (
    <div style={s.line(tone)}>
      {LineIcon && <LineIcon size={16} style={s.icon(tone)} />}
      <span>{text}</span>
    </div>
  );
}
