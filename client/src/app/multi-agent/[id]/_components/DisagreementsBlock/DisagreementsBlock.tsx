/* DisagreementsBlock — "Where agents disagree" (SPEC-08 AC-33..AC-35). One row
   per finding group: `file:line`, the group title and one cell per agent take
   (name, state label, note). The conflicts-only toggle is local state and off
   on every load. Titles and notes render as plain text (AC-42). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, SEV, Toggle, type Severity } from "@devdigest/ui";
import type { AgentColumn, FindingGroup, FindingTake } from "@devdigest/shared";
import { s } from "./styles";

const TAKE_KEYS = {
  did_not_flag: "disagree.take.didNotFlag",
  failed: "disagree.take.failed",
  cancelled: "disagree.take.cancelled",
  pending: "disagree.take.pending",
} as const;

/** Text + dot colour of one take; a flagged take shows its uppercase severity. */
function takeLabel(
  take: FindingTake,
  t: (key: string) => string,
): { text: string; dot: string; flagged: boolean } {
  if (take.state === "flagged") {
    const sev = take.severity ? SEV[take.severity as Severity] : undefined;
    return {
      text: take.severity ?? t("disagree.take.flagged"),
      dot: sev?.c ?? "var(--warn)",
      flagged: true,
    };
  }
  return { text: t(TAKE_KEYS[take.state]), dot: "var(--text-muted)", flagged: false };
}

export function DisagreementsBlock({
  groups,
  columns,
}: {
  groups: FindingGroup[];
  columns: AgentColumn[];
}) {
  const t = useTranslations("multiAgent");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const doneCount = columns.filter((c) => c.status === "done").length;
  const shown = onlyConflicts ? groups.filter((g) => g.is_conflict) : groups;

  let body: React.ReactNode;
  if (doneCount < 2) {
    body = <div style={s.message}>{t("disagree.needTwo")}</div>;
  } else if (shown.length === 0) {
    body = (
      <div style={s.message}>{onlyConflicts ? t("disagree.noConflicts") : t("disagree.noGroups")}</div>
    );
  } else {
    body = (
      <div style={s.list}>
        {shown.map((g) => (
          <div key={g.id} style={s.group}>
            <div style={s.groupHead}>
              <Icon.Code size={13} style={{ color: "var(--text-muted)" }} />
              <span className="mono" style={s.loc}>
                {g.file}:{g.line}
              </span>
              <span style={s.title}>{g.title}</span>
            </div>
            <div style={s.takes(g.takes.length)}>
              {g.takes.map((take) => {
                const label = takeLabel(take, t);
                return (
                  <div key={take.run_id} style={s.take}>
                    <div style={s.takeAgent}>{take.agent_name ?? t("results.unknownAgent")}</div>
                    <div style={s.takeLabelRow}>
                      <span style={s.dot(label.dot)} />
                      <span style={s.takeLabel(label.flagged)}>{label.text}</span>
                    </div>
                    {take.note && <div style={s.note}>{take.note}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <SectionLabel
        icon="Activity"
        right={
          <label style={s.toggle}>
            {t("disagree.onlyConflicts")}
            <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={15} />
          </label>
        }
      >
        {t("disagree.title")}
      </SectionLabel>
      {body}
    </div>
  );
}
