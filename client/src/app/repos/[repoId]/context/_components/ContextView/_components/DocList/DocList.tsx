/* DocList — one selectable row per document, carrying its repository-relative
   path (two README.md in different folders stay distinguishable). Rows are real
   buttons, so Tab / Enter / Space work without any key handling here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { s } from "./styles";

export function DocList({
  docs,
  query,
  selectedPath,
  onSelect,
}: {
  /** Already filtered by the caller. */
  docs: ContextDoc[];
  /** The filter text, only to word the "nothing matches" message. */
  query: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  if (docs.length === 0) {
    return <div style={s.none}>{t("filter.noMatches", { query })}</div>;
  }
  return (
    <ul aria-label={t("list.label")} style={s.list}>
      {docs.map((d) => {
        const selected = d.path === selectedPath;
        return (
          <li key={d.path}>
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              title={d.path}
              onClick={() => onSelect(d.path)}
              style={s.row(selected)}
            >
              <Icon.FileText size={13} style={s.icon(selected)} />
              <span className="mono" style={s.path}>
                {d.path}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
