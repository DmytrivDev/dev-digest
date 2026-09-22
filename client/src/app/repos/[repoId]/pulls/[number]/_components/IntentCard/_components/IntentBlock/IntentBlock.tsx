"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

interface IntentBlockProps {
  intent: string;
  inScope: string[];
  outOfScope: string[];
}

/**
 * Pure presentation: the italic quoted intent sentence, then two labelled
 * columns (in scope / out of scope). Mirrors the mock's `IntentBlock`
 * (screen_pr_detail.jsx, artboard "PR Detail · Overview (Brief)").
 */
export function IntentBlock({ intent, inScope, outOfScope }: IntentBlockProps) {
  const t = useTranslations("brief");

  return (
    <div>
      <p style={s.quote}>&ldquo;{intent}&rdquo;</p>
      <div style={s.columns}>
        <div>
          <div style={s.columnHeader("var(--ok)")}>
            <Icon.Check size={12} />
            {t("intent.inScope")}
          </div>
          <ul style={s.list}>
            {inScope.map((item, i) => (
              <li key={i} style={s.item(false)}>
                <span style={s.bullet("var(--ok)")}>·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div style={s.columnHeader("var(--text-muted)")}>
            <Icon.X size={12} />
            {t("intent.outOfScope")}
          </div>
          <ul style={s.list}>
            {outOfScope.map((item, i) => (
              <li key={i} style={s.item(true)}>
                <span style={s.bullet("var(--text-muted)")}>·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
