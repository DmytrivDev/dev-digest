/* SkillPreviewPanel — the skill's body, read-only, beside the list.

   Browsing skills is a reading task: you open several in a row to find the one
   that says what you meant. A full page navigation per skill turns that into
   back-and-forth, so the list stays on screen and the body opens next to it.

   Read-only on purpose. Everything that WRITES — config, versions, delete —
   lives on /skills/:id, and `Open editor` is the one way through, so there is
   never a second place to edit a body. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { needsVetting, sourceIcon, typeColor } from "../../../../../../lib/skills";
import { s } from "./styles";

const PANEL_WIDTH = 620;

export function SkillPreviewPanel({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const color = typeColor(skill.type);
  const SourceIcon = Icon[sourceIcon(skill.source)];

  return (
    <Drawer
      width={PANEL_WIDTH}
      title={<span className="mono">{skill.name}</span>}
      subtitle={t("panel.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {tCommon("actions.close")}
          </Button>
          <Button kind="primary" icon="Edit" onClick={() => router.push(`/skills/${skill.id}`)}>
            {t("panel.openEditor")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.metaRow}>
          <span style={s.typeChip(color)}>{t(`listItem.type.${skill.type}`)}</span>
          <span style={s.source}>
            <SourceIcon size={11} />
            {t(`listItem.source.${skill.source}`)}
          </span>
          <Badge color="var(--text-muted)" mono>
            {t("card.version", { version: skill.version })}
          </Badge>
          {skill.agent_count != null && (
            <Badge color="var(--text-secondary)" icon="Cpu">
              {t("card.agentCount", { count: skill.agent_count })}
            </Badge>
          )}
          {!skill.enabled && <Badge color="var(--text-muted)">{t("card.disabled")}</Badge>}
        </div>

        {skill.description && <div style={s.description}>{skill.description}</div>}

        {needsVetting(skill) && (
          <div style={s.notice}>
            <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} />
            <span>{t("preview.untrustedNotice")}</span>
          </div>
        )}

        <div style={s.sectionLabel}>{t("panel.bodyLabel")}</div>
        <div style={s.card}>
          {skill.body.trim().length > 0 ? (
            <Markdown>{skill.body}</Markdown>
          ) : (
            <span style={s.empty}>{t("preview.empty")}</span>
          )}
        </div>
      </div>
    </Drawer>
  );
}
