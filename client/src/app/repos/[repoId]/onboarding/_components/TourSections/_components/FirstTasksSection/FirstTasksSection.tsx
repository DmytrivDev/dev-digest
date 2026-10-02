"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { OnboardingFirstTasksSection } from "@devdigest/shared";
import { s } from "./styles";

/** Starter tasks. They are the model's suggestion, not a fact about the repo —
    the section says so (AC-86). Scopes were checked against the index server-side. */
export function FirstTasksSection({ section }: { section: OnboardingFirstTasksSection }) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.root}>
      <span style={s.label}>{t("firstTasks.label")}</span>
      <ul style={s.list}>
        {section.items.map((item) => (
          <li key={`${item.title}|${item.scope}`} style={s.row}>
            <div style={s.head}>
              <span style={s.title}>{item.title}</span>
              <Badge>{t(`firstTasks.complexity.${item.complexity}`)}</Badge>
            </div>
            <p style={s.scope}>
              {t("firstTasks.scope")}: <span className="mono">{item.scope}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
