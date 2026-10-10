/* ReadOnlyInput — the frozen Input of a finding-born eval case (SPEC-04 AC-37,
   AC-38): its diff and PR meta are a copy of the source PR and cannot be edited.
   Everything shown is stored text, rendered as text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import { diffLineKind } from "../../helpers";
import { s } from "./styles";

export function ReadOnlyInput({ evalCase, tab }: { evalCase: EvalCase; tab: "diff" | "prMeta" }) {
  const t = useTranslations("eval");
  const meta = evalCase.input_meta;

  if (tab === "diff") {
    return (
      <pre className="mono" style={s.diff}>
        {evalCase.input_diff.split("\n").map((line, i) => (
          <span key={i} style={s.diffLine(diffLineKind(line))}>
            {line || " "}
          </span>
        ))}
      </pre>
    );
  }
  return (
    <div>
      <div style={s.metaLabel}>{t("caseModal.prMeta.number")}</div>
      <div className="mono" style={s.metaValue}>
        {meta.pr_number === null ? "" : `#${meta.pr_number}`}
      </div>
      <div style={s.metaLabel}>{t("caseModal.prMeta.title")}</div>
      <div style={s.metaValue}>{meta.title}</div>
      <div style={s.metaLabel}>{t("caseModal.prMeta.body")}</div>
      <div style={s.metaValue}>{meta.body ? meta.body : t("caseModal.prMeta.noBody")}</div>
    </div>
  );
}
