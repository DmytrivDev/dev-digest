/* SkillCard — type-tinted tile, enabled toggle, type + source chips. Mirrors
   AgentCard so the two lists read the same way. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { needsVetting, sourceIcon, typeColor } from "../../../../lib/skills";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const color = typeColor(skill.type);
  const SourceIcon = Icon[sourceIcon(skill.source)];

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={s.iconButton(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spinning : undefined} />
        </button>
      </div>

      <div style={s.description}>{skill.description || t("card.noDescription")}</div>

      <div style={s.metaRow}>
        <span style={s.typeChip(color)}>{t(`listItem.type.${skill.type}`)}</span>
        <span style={s.source}>
          <SourceIcon size={11} />
          {t(`listItem.source.${skill.source}`)}
        </span>
        <Badge color="var(--text-muted)" mono>
          {t("card.version", { version: skill.version })}
        </Badge>
        {/* Absent (a single-skill read) is not zero, so there is nothing to
            show for it — only a counted number gets a badge. */}
        {skill.agent_count != null && (
          <span title={t("card.agentCountTitle")}>
            <Badge color="var(--text-secondary)" icon="Cpu">
              {t("card.agentCount", { count: skill.agent_count })}
            </Badge>
          </span>
        )}
        {needsVetting(skill) && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("listItem.needsVetting")}
          </Badge>
        )}
      </div>

      {confirming && (
        // The dialog is a DOM descendant of the clickable card, so a click on
        // Cancel would bubble into the card and navigate to the skill.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={t("card.deleteTitle", { name: skill.name })}
            body={t("card.deleteBody")}
            confirmLabel={t("card.deleteCta")}
            busy={del.isPending}
            onCancel={() => setConfirming(false)}
            onConfirm={() => del.mutate(skill.id)}
          />
        </div>
      )}
    </div>
  );
}
