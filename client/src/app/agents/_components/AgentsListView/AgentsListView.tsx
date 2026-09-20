/* /agents — Agents list (A2, L03). AgentCards + create. Selecting an agent
   navigates to the 5-tab editor at /agents/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useAgents, useReorderAgents, useUpdateAgent } from "../../../../lib/hooks/agents";
import { AgentCard } from "../AgentCard";
import { CreateAgentModal } from "./_components/CreateAgentModal";
import { TEMPLATES } from "./constants";
import { reorderIds } from "../../../../lib/reorder";
import { filterAgents } from "./helpers";
import { s } from "./styles";

export function AgentsListView() {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const update = useUpdateAgent();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const reorder = useReorderAgents();
  // Only the drag IN FLIGHT is state; the shown order is derived from the saved
  // list, so an abandoned drag or a failed save cannot leave a private order.
  const [drag, setDrag] = React.useState<{ from: string; over: string } | null>(null);

  const all = React.useMemo(() => agents ?? [], [agents]);
  // Reordering a filtered list would save positions for cards nobody can see.
  const canDrag = search.trim() === "";
  const ordered = React.useMemo(() => {
    if (!drag) return all;
    const byId = new Map(all.map((a) => [a.id, a]));
    return reorderIds(all.map((a) => a.id), drag.from, drag.over)
      .map((id) => byId.get(id))
      .filter((a): a is NonNullable<typeof a> => a !== undefined);
  }, [all, drag]);

  const list = filterAgents(ordered, search);

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("list.title")}</h1>
            <p style={s.subtitle}>{t("list.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("list.addAgent")}
              </Button>
            }
            items={[
              { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
              { divider: true },
              ...TEMPLATES.map((tp) => ({
                label: tp,
                icon: "Cpu" as const,
                muted: true,
                onClick: () => setCreating(true),
              })),
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
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Cpu"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((a) => (
              <div
                key={a.id}
                draggable={canDrag}
                title={canDrag ? t("page.dragHint") : t("page.dragWhileFiltering")}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDrag({ from: a.id, over: a.id });
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  if (drag.over !== a.id) setDrag({ from: drag.from, over: a.id });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag) reorder.mutate(ordered.map((row) => row.id));
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
                style={{ cursor: canDrag ? "grab" : "default", opacity: drag?.from === a.id ? 0.5 : 1 }}
              >
                <AgentCard
                  ag={a}
                  onClick={() => router.push(`/agents/${a.id}?tab=config`)}
                  onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
