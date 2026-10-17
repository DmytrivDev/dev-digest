"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { todayLocal, validateCustomRange, type UiWindow } from "@/lib/agent-performance";
import { s } from "./styles";

const PRESETS = [
  { days: 1, labelKey: "days1" },
  { days: 30, labelKey: "days30" },
] as const;

const ERROR_ID = "perf-window-error";

/* Presets apply on click; a custom range applies only through Apply, and only
   when it is valid (AC-34). Nothing here fetches — the caller owns the window. */
export function PerfWindowSelector({
  value,
  onChange,
}: {
  value: UiWindow;
  onChange: (w: UiWindow) => void;
}) {
  const t = useTranslations("agentPerformance.window");
  const [customOpen, setCustomOpen] = useState(value.kind === "custom");
  const [start, setStart] = useState(value.kind === "custom" ? value.start : "");
  const [end, setEnd] = useState(value.kind === "custom" ? value.end : "");

  const today = todayLocal(new Date());
  const problem = validateCustomRange(start, end, today);

  const pickPreset = (days: 1 | 30) => {
    setCustomOpen(false);
    onChange({ kind: "days", days });
  };

  const apply = () => {
    if (problem) return;
    onChange({ kind: "custom", start, end });
  };

  return (
    <div style={s.root}>
      <div style={s.row} role="group" aria-label={t("label")}>
        <span style={s.label}>{t("label")}</span>
        {PRESETS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            active={!customOpen && value.kind === "days" && value.days === p.days}
            aria-pressed={value.kind === "days" && value.days === p.days}
            onClick={() => pickPreset(p.days)}
          >
            {t(p.labelKey)}
          </Button>
        ))}
        <Button
          size="sm"
          active={customOpen || value.kind === "custom"}
          aria-pressed={value.kind === "custom"}
          onClick={() => setCustomOpen(true)}
        >
          {t("custom")}
        </Button>
      </div>
      {customOpen && (
        <div style={s.custom}>
          <label style={s.field}>
            {t("start")}
            <input
              type="date"
              style={s.input}
              value={start}
              max={today}
              onChange={(e) => setStart(e.target.value)}
              aria-describedby={problem ? ERROR_ID : undefined}
            />
          </label>
          <label style={s.field}>
            {t("end")}
            <input
              type="date"
              style={s.input}
              value={end}
              max={today}
              onChange={(e) => setEnd(e.target.value)}
              aria-describedby={problem ? ERROR_ID : undefined}
            />
          </label>
          <Button
            size="sm"
            kind="primary"
            disabled={problem !== null}
            aria-describedby={problem ? ERROR_ID : undefined}
            onClick={apply}
          >
            {t("apply")}
          </Button>
          {problem && (
            <span id={ERROR_ID} style={s.error}>
              {t(`errors.${problem}`)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
