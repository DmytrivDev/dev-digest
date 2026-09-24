/* UnanchoredAnnotations — footer list for annotations that don't land on any
   rendered line in this diff (mirrors OutdatedComments). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cs } from "../comments";
import type { DiffAnnotation } from "../annotations";

export function UnanchoredAnnotations({ items }: { items: DiffAnnotation[] }) {
  const t = useTranslations("shell");
  if (items.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>
        {t("diffViewer.unanchoredTitle", { count: items.length })}
      </span>
      {items.map((a) => (
        <React.Fragment key={a.id}>{a.content}</React.Fragment>
      ))}
    </div>
  );
}
