/* PrMetaInput — the editable PR meta tab of a manual eval case (SPEC-05 AC-8):
   an optional Title and Body. There is no PR number (a manual case has none) and
   no Linked issue (a non-goal). Both texts reach the prompt only inside the
   engine's untrusted PR-description slot. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput, Textarea } from "@devdigest/ui";
import { s } from "./styles";

const BODY_ROWS = 6;

export function PrMetaInput({
  title,
  body,
  onTitle,
  onBody,
}: {
  title: string;
  body: string;
  onTitle: (next: string) => void;
  onBody: (next: string) => void;
}) {
  const t = useTranslations("eval");
  return (
    <div>
      <label style={s.field}>
        <span style={s.label}>{t("caseModal.prMeta.titleLabel")}</span>
        <TextInput value={title} onChange={onTitle} />
      </label>
      <label style={s.field}>
        <span style={s.label}>{t("caseModal.prMeta.bodyLabel")}</span>
        <Textarea rows={BODY_ROWS} value={body} onChange={onBody} />
      </label>
    </div>
  );
}
