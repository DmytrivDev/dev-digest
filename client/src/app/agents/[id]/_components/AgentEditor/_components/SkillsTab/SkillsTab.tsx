/* SkillsTab — attach, detach and reorder the skills linked to this agent.

   Order is the order the blocks appear in the assembled prompt, so it is shown
   as an explicit position and moved by dragging the handle. The handle is also
   a button: HTML5 drag-and-drop is pointer-only, and losing keyboard reordering
   would be a regression, so ↑/↓ on a focused handle does the same move. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { filterSkills, typeColor } from "../../../../../../../lib/skills";
import { moveLink, orderForPicker, reorderLink, toggleLink } from "./helpers";
import { s } from "./styles";

/** The drag in flight: what is being moved, and what it is hovering over. */
interface Drag {
  id: string;
  overId: string | null;
}

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const { data: skills, isLoading } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");
  // Only the drag IN FLIGHT is state. The order itself stays server-owned —
  // mirroring `links` into state is how the two silently drift apart.
  const [drag, setDrag] = React.useState<Drag | null>(null);

  // The server is the source of truth for the order; `links` already arrives
  // sorted by it, so there is no local ordering state to drift.
  const saved = React.useMemo(() => (links ?? []).map((l) => l.skill_id), [links]);

  // What the list looks like if the drag were dropped right now. Derived during
  // render, never stored — storing it would be a second source of truth.
  const linked =
    drag?.overId != null && drag.overId !== drag.id
      ? reorderLink(saved, drag.id, drag.overId)
      : saved;

  const save = (next: string[]) => setSkills.mutate({ agentId: agent.id, skillIds: next });

  const all = skills ?? [];
  const visible = filterSkills(orderForPicker(all, linked), filter);

  const drop = () => {
    if (drag?.overId != null) save(linked);
    setDrag(null);
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: linked.length, total: all.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {all.length === 0 ? (
        <EmptyState
          icon="Sparkles"
          title={tSkills("page.empty.title")}
          body={tSkills("page.empty.body")}
        />
      ) : (
        <div style={s.list}>
          {visible.map((skill) => {
            const position = linked.indexOf(skill.id);
            const isLinked = position >= 0;
            const color = typeColor(skill.type);
            const isDragging = drag?.id === skill.id;
            return (
              <div
                key={skill.id}
                // Only a linked row can be reordered; an unlinked one has no
                // position to move. Dropping onto one is a no-op anyway —
                // `reorderLink` returns the list unchanged.
                draggable={isLinked}
                onDragStart={(e) => {
                  if (!isLinked) return;
                  // Firefox refuses to start a drag unless some data is set,
                  // and jsdom has no dataTransfer at all — hence the guard.
                  e.dataTransfer?.setData("text/plain", skill.id);
                  setDrag({ id: skill.id, overId: null });
                }}
                onDragOver={(e) => {
                  if (!drag || !isLinked || drag.id === skill.id) return;
                  // Without preventDefault the browser treats the row as an
                  // invalid drop target and never fires onDrop.
                  e.preventDefault();
                  setDrag((d) => (d && d.overId !== skill.id ? { ...d, overId: skill.id } : d));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop();
                }}
                onDragEnd={() => setDrag(null)}
                style={s.row(isLinked, isDragging)}
              >
                <button
                  type="button"
                  disabled={!isLinked}
                  aria-label={t("skills.dragHandle", { name: skill.name })}
                  title={t("skills.dragHandle", { name: skill.name })}
                  onKeyDown={(e) => {
                    if (!isLinked) return;
                    const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                    if (delta === 0) return;
                    // The arrows would otherwise scroll the panel out from
                    // under the handle the user is holding focus on.
                    e.preventDefault();
                    const next = moveLink(linked, skill.id, delta as -1 | 1);
                    if (next.join() !== linked.join()) save(next);
                  }}
                  style={s.grip(!isLinked)}
                >
                  <Icon.Menu size={14} />
                </button>
                <span className="mono" style={s.position}>
                  {isLinked ? position + 1 : ""}
                </span>
                <Checkbox
                  checked={isLinked}
                  onChange={() => save(toggleLink(linked, skill.id))}
                  label={<span className="mono" style={s.name}>{skill.name}</span>}
                />
                <span style={{ flex: 1 }} />
                {!skill.enabled && (
                  <Badge color="var(--text-muted)">{tSkills("card.disabled")}</Badge>
                )}
                <span style={s.typeChip(color)}>{tSkills(`listItem.type.${skill.type}`)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
