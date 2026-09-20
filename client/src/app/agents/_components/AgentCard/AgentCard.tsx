/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const [confirming, setConfirming] = React.useState(false);
  const color = modelColor(ag.model);
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
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
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>

      {confirming && (
        // Portalled to <body>, so it is neither dimmed by a disabled card nor
        // able to bubble a click back into it.
        <ConfirmDialog
          title={t("card.deleteTitle", { name: ag.name })}
          body={t("card.deleteBody")}
          confirmLabel={t("card.deleteCta")}
          busy={del.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => del.mutate(ag.id)}
        />
      )}
    </div>
  );
}
