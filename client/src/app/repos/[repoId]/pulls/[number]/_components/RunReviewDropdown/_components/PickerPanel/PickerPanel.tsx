/* PickerPanel — the body of the Run Review dropdown (SPEC-08 AC-1, AC-2, AC-7).
   Mounted by <Dropdown> only while it is open, so every row is checked on each
   open and the estimates query fires only then. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentRunEstimates } from "@/lib/hooks/multi-agent";
import { approxSeconds } from "@/lib/multi-agent";
import { s } from "./styles";

export function PickerPanel({
  agents,
  warnMerged,
  pending,
  onRun,
}: {
  /** All agents in list order; disabled ones are omitted from the rows. */
  agents: Agent[];
  warnMerged: boolean;
  pending: boolean;
  onRun: (agentIds: string[]) => void;
}) {
  const t = useTranslations("multiAgent");
  const tPr = useTranslations("prReview");
  const router = useRouter();
  const enabled = agents.filter((a) => a.enabled);
  // Store what the user UNchecked: a fresh open has every row checked, and the
  // checked set stays derived from the agent list instead of a copy of it.
  const [unchecked, setUnchecked] = React.useState<ReadonlySet<string>>(new Set());
  const checkedIds = enabled.filter((a) => !unchecked.has(a.id)).map((a) => a.id);
  const { data: est } = useAgentRunEstimates(enabled.map((a) => a.id));
  const avgById = new Map((est?.estimates ?? []).map((e) => [e.agent_id, e.avg_duration_ms]));

  const toggle = (id: string, on: boolean) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  const warning = warnMerged && (
    <div style={s.warning}>
      <Icon.AlertTriangle size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span>{tPr("runReview.mergedWarning")}</span>
    </div>
  );

  if (enabled.length === 0) {
    return (
      <div style={s.panel}>
        {warning}
        <button type="button" style={s.link} onClick={() => router.push("/agents")}>
          <Icon.Settings size={14} style={{ color: "var(--text-muted)" }} />
          <span>{t("picker.noEnabledAgents")}</span>
        </button>
      </div>
    );
  }

  return (
    <div style={s.panel}>
      {warning}
      <div style={s.header}>
        <span style={s.title}>{t("picker.title")}</span>
        <button
          type="button"
          style={s.clear}
          onClick={() => setUnchecked(new Set(enabled.map((a) => a.id)))}
        >
          {t("picker.clear")}
        </button>
      </div>
      <div style={s.rows} role="group" aria-label={t("picker.agentsLabel")}>
        {enabled.map((a) => (
          <div key={a.id} style={s.row}>
            <Checkbox
              checked={!unchecked.has(a.id)}
              onChange={(v) => toggle(a.id, v)}
              label={a.name}
            />
            <span className="mono" style={s.rowHint}>
              {approxSeconds(avgById.get(a.id))}
            </span>
          </div>
        ))}
      </div>
      <div style={s.action}>
        <Button
          kind="primary"
          size="md"
          full
          icon="Sparkles"
          disabled={checkedIds.length === 0 || pending}
          onClick={() => onRun(checkedIds)}
        >
          {t("picker.run", { count: checkedIds.length })}
        </Button>
      </div>
      <div style={s.divider} />
      <button type="button" style={s.link} onClick={() => router.push("/agents")}>
        <Icon.Settings size={14} style={{ color: "var(--text-muted)" }} />
        <span>{t("picker.configureAgents")}</span>
      </button>
    </div>
  );
}
