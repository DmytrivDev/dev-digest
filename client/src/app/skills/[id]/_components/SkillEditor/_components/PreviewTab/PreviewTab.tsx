/* PreviewTab — the skill body rendered the way the reviewing agent receives it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { needsVetting } from "../../../../../../../lib/skills";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      {needsVetting(skill) && (
        <div style={s.notice}>
          <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}
      <div style={s.card}>
        {skill.body.trim().length > 0 ? (
          <Markdown>{skill.body}</Markdown>
        ) : (
          <span style={s.empty}>{t("preview.empty")}</span>
        )}
      </div>
    </div>
  );
}
