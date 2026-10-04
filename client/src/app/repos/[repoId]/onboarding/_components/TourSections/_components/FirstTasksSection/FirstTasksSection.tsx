"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { OnboardingFirstTasksSection } from "@devdigest/shared";
import { COMPLEXITY_COLOR } from "../../constants";
import { s } from "./styles";

/** Starter tasks. They are the model's suggestion, not a fact about the repo —
    the section says so (AC-86). Scopes were checked against the index server-side. */
export function FirstTasksSection({ section }: { section: OnboardingFirstTasksSection }) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.root}>
      <span style={s.label}>
        <Icon.Sparkles size={12} aria-hidden="true" />
        {t("firstTasks.label")}
      </span>
      <ul style={s.grid}>
        {section.items.map((item) => (
          <li key={`${item.title}|${item.scope}`} style={s.card}>
            <span style={s.title}>{item.title}</span>
            <span className="mono" title={t("firstTasks.scope")} style={s.scope}>
              {item.scope}
            </span>
            <Badge color={COMPLEXITY_COLOR[item.complexity]} bg="transparent" style={s.badge}>
              {t(`firstTasks.complexity.${item.complexity}`)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
