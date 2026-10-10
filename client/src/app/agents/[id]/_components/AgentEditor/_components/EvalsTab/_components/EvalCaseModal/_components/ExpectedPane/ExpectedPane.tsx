/* ExpectedPane — the Expected output JSON of an eval case: title, valid/invalid
   badge, the editable text, and the inline message of a diff-relative check
   (SPEC-05 AC-11). A manual case adds the "Finding skeleton" button (AC-9, AC-10);
   a finding-born case passes no `skeleton` and shows none. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Textarea } from "@devdigest/ui";
import type { ExpectationDiffError } from "@/lib/eval-case-diff";
import { s } from "./styles";

const PANE_ROWS = 14;

export function ExpectedPane({
  value,
  onChange,
  valid,
  error,
  skeleton,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The text parses as an expectation. */
  valid: boolean;
  /** A valid expectation that does not fit the diff, or `null`. */
  error: ExpectationDiffError | null;
  /** Present only for a manual case; `onClick` is what the button does. */
  skeleton?: { enabled: boolean; onClick: () => void };
}) {
  const t = useTranslations("eval");
  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <span style={s.title}>{t("caseModal.expectedLabel")}</span>
        {valid ? (
          <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
            {t("caseModal.validJson")}
          </Badge>
        ) : (
          <Badge color="var(--crit)" bg="var(--crit-bg)" icon="X">
            {t("caseModal.invalidJson")}
          </Badge>
        )}
        {skeleton && (
          <span style={s.action}>
            <Button kind="ghost" size="sm" icon="Plus" disabled={!skeleton.enabled} onClick={skeleton.onClick}>
              {t("caseModal.skeleton")}
            </Button>
          </span>
        )}
      </div>
      <label style={s.field}>
        <span style={s.srOnly}>{t("caseModal.expectedLabel")}</span>
        <Textarea mono rows={PANE_ROWS} value={value} onChange={onChange} />
      </label>
      {error && (
        <div role="alert" style={s.error}>
          {t(`caseModal.expectationErrors.${error}`)}
        </div>
      )}
    </div>
  );
}
