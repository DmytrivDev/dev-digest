/* ScanSummary — what the last scan actually did.

   The report is NOT persisted (the candidates are the stored result), so this
   renders only after a scan in this session. It is here because a thin list is
   the normal outcome: the model proposes a dozen rules and most fail evidence
   validation. Showing "13 proposed · 3 kept" with the reasons turns that from a
   feature that looks broken into one that is visibly doing its job. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel } from "@devdigest/ui";
import type { ConventionScanReport } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { s } from "./styles";

export function ScanSummary({ report }: { report: ConventionScanReport }) {
  const t = useTranslations("conventions");
  const [open, setOpen] = React.useState(false);

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <SectionLabel>{t("scan.title")}</SectionLabel>
        <span style={s.counts}>
          {t("scan.counts", {
            proposed: report.proposed,
            kept: report.kept,
            created: report.created,
          })}
        </span>
        <div style={s.headRight}>
          <Badge mono>{report.model}</Badge>
          <Button
            kind="ghost"
            size="sm"
            icon={open ? "ChevronDown" : "ChevronRight"}
            onClick={() => setOpen(!open)}
          >
            {open ? t("scan.hide") : t("scan.show")}
          </Button>
        </div>
      </div>

      {open && (
        <div style={s.body}>
          <dl style={s.grid}>
            <dt style={s.dt}>{t("scan.model")}</dt>
            <dd style={s.dd}>
              {report.provider} · {report.model}
            </dd>
            {report.head_sha && (
              <>
                <dt style={s.dt}>{t("scan.headSha")}</dt>
                <dd style={s.ddMono}>{report.head_sha}</dd>
              </>
            )}
            <dt style={s.dt}>{t("scan.configSamples")}</dt>
            <dd style={s.ddMono}>{report.config_samples.join(", ")}</dd>
            <dt style={s.dt}>{t("scan.codeSamples")}</dt>
            <dd style={s.ddMono}>{report.code_samples.join(", ")}</dd>
            <dt style={s.dt}>{t("scan.cost")}</dt>
            <dd style={s.dd}>
              {formatCost(report.cost_usd)} ·{" "}
              {t("scan.tokens", {
                in: report.tokens_in.toLocaleString("en-US"),
                out: report.tokens_out.toLocaleString("en-US"),
              })}
            </dd>
          </dl>

          {report.dropped.length > 0 && (
            <div style={s.dropped}>
              <SectionLabel>{t("scan.droppedTitle")}</SectionLabel>
              <ul style={s.list}>
                {report.dropped.map((d, i) => (
                  <li key={i} style={s.listItem}>
                    <span style={s.droppedRule}>{d.rule}</span>
                    <span style={s.droppedReason}>{t(`scan.reason.${d.reason}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
