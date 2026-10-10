/* CompareBody — what a loaded comparison shows: four cards (RECALL, PRECISION,
   CITATION, COST), the system-prompt diff, the config changes, the per-case
   flips and the cases only one of the two runs contained (AC-98…101). Every
   string taken from the runs (config values, case names) is rendered as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { EvalCompare } from "@devdigest/shared";
import { METRICS } from "../../../../constants";
import { configValue, costCard, metricDeltaColor, percentCard } from "../../helpers";
import { s } from "../../styles";
import { DeltaCard } from "../DeltaCard";
import { PromptDiff } from "../PromptDiff";

export function CompareBody({ data }: { data: EvalCompare }) {
  const t = useTranslations("eval");
  const cost = costCard(data);

  return (
    <div style={s.body}>
      <div style={s.cards}>
        {METRICS.map((m) => {
          const card = percentCard(data.metrics.old[m.key], data.metrics.new[m.key]);
          return (
            <DeltaCard
              key={m.key}
              testId={`compare-card-${m.key}`}
              label={t(m.compareKey)}
              oldText={card.oldText}
              newText={card.newText}
              color={m.color}
              direction={card.direction}
              deltaText={t("compare.deltaPoints", { pts: card.points })}
              deltaColor={metricDeltaColor(card.direction)}
            />
          );
        })}
        <DeltaCard
          testId="compare-card-cost"
          label={t("common.metrics.cost")}
          oldText={cost.oldText}
          newText={cost.newText}
          color="var(--text-primary)"
          direction={cost.direction}
          deltaText={cost.deltaText}
          deltaColor="var(--text-secondary)"
        />
      </div>

      <PromptDiff
        lines={data.prompt_diff}
        oldVersion={data.old.agent_version}
        newVersion={data.new.agent_version}
      />

      {data.config_changes.length > 0 && (
        <section>
          <SectionLabel icon="Cpu">{t("compare.configChanges")}</SectionLabel>
          <ul style={s.list}>
            {data.config_changes.map((c) => (
              <li key={c.field} className="mono" style={s.mono}>
                {t("compare.configChange", {
                  field: t(`compare.configField.${c.field}`),
                  old: configValue(c.old),
                  new: configValue(c.new),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.flips.length > 0 && (
        <section>
          <SectionLabel icon="Activity">{t("compare.flips")}</SectionLabel>
          <ul style={s.list}>
            {data.flips.map((f) => (
              <li key={f.case_id} style={s.flipRow}>
                <span className="mono">{f.name}</span>
                <span style={s.flip(f.direction)}>
                  {t(f.direction === "now_passing" ? "compare.nowPassing" : "compare.nowFailing")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(data.only_in_old.length > 0 || data.only_in_new.length > 0) && (
        <section>
          {data.only_in_old.length > 0 && (
            <>
              <div style={s.subHeading}>{t("compare.onlyInOld", { version: data.old.agent_version })}</div>
              <ul style={s.list}>
                {data.only_in_old.map((c) => (
                  <li key={c.case_id} className="mono" style={s.mono}>
                    {c.name}
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.only_in_new.length > 0 && (
            <>
              <div style={s.subHeading}>{t("compare.onlyInNew", { version: data.new.agent_version })}</div>
              <ul style={s.list}>
                {data.only_in_new.map((c) => (
                  <li key={c.case_id} className="mono" style={s.mono}>
                    {c.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
