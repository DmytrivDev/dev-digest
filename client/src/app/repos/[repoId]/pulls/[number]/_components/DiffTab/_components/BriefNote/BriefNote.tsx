"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { BriefLineNote } from "../../helpers";
import { s } from "./styles";

interface BriefNoteProps {
  note: BriefLineNote;
  color: string;
  icon: IconName;
}

/**
 * The inline card under a diff line that the PR Brief points at — a risk area or a
 * review-focus item — styled like the finding cards beside it. Model text renders as
 * plain text only (SPEC-03 AC-30).
 */
export function BriefNote({ note, color, icon }: BriefNoteProps) {
  const t = useTranslations("brief");
  const NoteIcon = Icon[icon];
  const heading =
    note.kind === "risk"
      ? t("diff.riskHeading", { severity: note.severity ?? "" })
      : t("diff.focusHeading");

  return (
    <div style={s.card(color)}>
      <div style={s.head}>
        {NoteIcon && <NoteIcon size={13} color={color} />}
        <span style={s.label(color)}>{heading}</span>
        <span style={s.title}>{note.title}</span>
      </div>
      {note.wholeFile && <div style={s.source}>{t("diff.wholeFile")}</div>}
      {note.text && <div style={s.text}>{note.text}</div>}
      <div style={s.source}>{t("diff.source")}</div>
    </div>
  );
}
