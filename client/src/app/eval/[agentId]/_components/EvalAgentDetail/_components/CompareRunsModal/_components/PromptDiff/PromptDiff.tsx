/* PromptDiff — "SYSTEM PROMPT DIFF": the server's line diff of the two
   recorded prompts (AC-92 / AC-99). Added lines sit on `--code-add`, removed
   ones on `--code-del`; identical prompts show "No changes" (AC-100). Prompt
   text is user data, so every line is rendered as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { EvalCompare } from "@devdigest/shared";
import { s } from "./styles";

interface Props {
  lines: EvalCompare["prompt_diff"];
  oldVersion: number;
  newVersion: number;
}

export function PromptDiff({ lines, oldVersion, newVersion }: Props) {
  const t = useTranslations("eval");
  const unchanged = lines.every((l) => l.kind === "context");

  return (
    <section>
      <SectionLabel icon="FileText">{t("compare.promptDiff")}</SectionLabel>
      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.swatch("var(--code-del)")} />
          {t("compare.legendOld", { version: oldVersion })}
        </span>
        <span style={s.legendItem}>
          <span style={s.swatch("var(--code-add)")} />
          {t("compare.legendNew", { version: newVersion })}
        </span>
      </div>
      {unchanged ? (
        <div style={s.none}>{t("compare.noChanges")}</div>
      ) : (
        <pre className="mono" style={s.pre}>
          {lines.map((l, i) => (
            // The diff is positional (a line can repeat), so the index is the identity.
            <div key={i} data-kind={l.kind} style={s.line(l.kind)}>
              {l.text || " "}
            </div>
          ))}
        </pre>
      )}
    </section>
  );
}
