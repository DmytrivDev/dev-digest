/* /skills — Skills list (L02). A grid of SkillCards, like the agents list.

   Clicking a card opens the body in a side panel, not a new page. Browsing
   skills is a reading task — you open several in a row to find the one that
   says what you meant — and a navigation per skill turns that into
   back-and-forth through a list you have to find your place in again.

   The panel is read-only and carries `Open editor`, so /skills/:id stays the
   single place a body can be written. An earlier revision navigated straight
   there on click; the duplication that argued against a panel back then was a
   drawer that ALSO offered editing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useReorderSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { reorderIds } from "../../../../lib/reorder";
import { SkillCard } from "../SkillCard";
import { filterSkills } from "../../../../lib/skills";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { SkillPreviewPanel } from "./_components/SkillPreviewPanel";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // The id, not the skill: the list refetches (a toggle, another tab) and the
  // panel must show the CURRENT row rather than the copy it opened with.
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const reorder = useReorderSkills();
  // Only the drag IN FLIGHT is state. The displayed order is derived from the
  // saved list, so a failed save cannot leave a local order behind that
  // disagrees with the server.
  const [drag, setDrag] = React.useState<{ from: string; over: string } | null>(null);

  const all = React.useMemo(() => skills ?? [], [skills]);
  // Dragging a FILTERED list would save an order for cards that are not on
  // screen, so the handle is off while a search is active.
  const canDrag = search.trim() === "";
  const ordered = React.useMemo(() => {
    if (!drag) return all;
    const byId = new Map(all.map((sk) => [sk.id, sk]));
    return reorderIds(all.map((sk) => sk.id), drag.from, drag.over)
      .map((id) => byId.get(id))
      .filter((sk): sk is NonNullable<typeof sk> => sk !== undefined);
  }, [all, drag]);

  const list = filterSkills(ordered, search);
  const previewing = previewId ? (skills ?? []).find((sk) => sk.id === previewId) : undefined;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      {previewing && <SkillPreviewPanel skill={previewing} onClose={() => setPreviewId(null)} />}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              {
                label: t("page.menu.createFromScratch"),
                icon: "Edit",
                onClick: () => setCreating(true),
              },
              { divider: true },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <div
                key={sk.id}
                draggable={canDrag}
                title={canDrag ? t("page.dragHint") : t("page.dragWhileFiltering")}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDrag({ from: sk.id, over: sk.id });
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  if (drag.over !== sk.id) setDrag({ from: drag.from, over: sk.id });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag) reorder.mutate(ordered.map((row) => row.id));
                  setDrag(null);
                }}
                // Ending a drag without a drop abandons the reorder: nothing was
                // saved, so dropping the preview restores the saved order.
                onDragEnd={() => setDrag(null)}
                style={{ cursor: canDrag ? "grab" : "default", opacity: drag?.from === sk.id ? 0.5 : 1 }}
              >
                <SkillCard
                  skill={sk}
                  active={sk.id === previewId}
                  onClick={() => setPreviewId(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
