/* DiffInput — the editable Diff tab of a manual eval case (SPEC-05): a mono
   textarea and, below it, either the message of the first failing diff check or
   a read-only preview through the shared diff viewer.

   The check is computed by the parent (the Save gate and the skeleton read the
   same verdict) and passed in. The preview gets no `commenting`, so a line shows
   no "+" affordance. The pasted text only ever reaches the DOM as React text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@devdigest/ui";
import { DiffViewer } from "@/components/diff-viewer";
import { previewFile, type DiffCheck } from "@/lib/eval-case-diff";
import { s } from "./styles";

const TEXTAREA_ROWS = 8;

export function DiffInput({
  value,
  onChange,
  check,
}: {
  value: string;
  onChange: (next: string) => void;
  check: DiffCheck;
}) {
  const t = useTranslations("eval");
  const file = React.useMemo(() => (check.ok ? previewFile(check) : null), [check]);

  return (
    <div>
      <label style={s.field}>
        <span style={s.srOnly}>{t("caseModal.tabs.diff")}</span>
        <Textarea
          mono
          rows={TEXTAREA_ROWS}
          value={value}
          onChange={onChange}
          placeholder={t("caseModal.diffPlaceholder")}
        />
      </label>
      {!check.ok && check.code !== null && (
        <div role="alert" style={s.error}>
          {t(`caseModal.diffErrors.${check.code}`)}
        </div>
      )}
      {file && (
        <div style={s.preview}>
          <DiffViewer files={[file]} defaultOpen />
        </div>
      )}
    </div>
  );
}
