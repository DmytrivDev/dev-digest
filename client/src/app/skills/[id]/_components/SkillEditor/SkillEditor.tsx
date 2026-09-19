/* SkillEditor — Config + Preview tabs over one skill, mirroring the agent
   editor's shell so the two read the same way. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* key = remount on skill switch, so the form re-seeds from the new
            skill without an effect mirroring every field into state. */}
        {tab === "preview" ? (
          <PreviewTab skill={skill} />
        ) : tab === "stats" ? (
          <StatsTab key={skill.id} skill={skill} />
        ) : tab === "versions" ? (
          <VersionsTab key={skill.id} skill={skill} />
        ) : (
          <ConfigTab key={skill.id} skill={skill} />
        )}
      </div>
    </div>
  );
}
