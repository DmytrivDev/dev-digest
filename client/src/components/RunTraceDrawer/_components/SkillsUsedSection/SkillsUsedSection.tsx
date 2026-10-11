/* SkillsUsedSection — which skills this run carried, and at which version.

   Sits directly above "Prompt assembly": that section shows the assembled
   `skills` TEXT, this one says where the text came from. Reads the trace's
   `skills_used` snapshot rather than the agent's current links, so an old run
   keeps reporting what it actually ran with. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { SkillUsed } from "@devdigest/shared";
import { sourceIcon, typeColor } from "@/lib/skills";
import { TraceSection } from "../TraceSection";
import { s } from "./styles";

export function SkillsUsedSection({ skills }: { skills: SkillUsed[] | null | undefined }) {
  const t = useTranslations("runs");
  const tSkills = useTranslations("skills");

  // Absent (an older trace, or the degraded failure trace) is NOT the same as
  // "this agent had no skills" — we cannot report what was never recorded, so
  // the section is not rendered at all rather than claiming zero.
  if (skills == null) return null;

  const attached = skills.filter((sk) => sk.enabled).length;

  return (
    <TraceSection
      icon="Sparkles"
      title={t("trace.skillsUsed.title")}
      right={
        <Badge color="var(--text-muted)">
          {t("trace.skillsUsed.count", { attached, total: skills.length })}
        </Badge>
      }
    >
      {skills.length === 0 ? (
        <span style={s.none}>{t("trace.skillsUsed.none")}</span>
      ) : (
        <>
          <p style={s.hint}>{t("trace.skillsUsed.hint")}</p>
          <div style={s.list}>
            {skills.map((sk) => {
              const color = typeColor(sk.type);
              const SourceIcon = Icon[sourceIcon(sk.source)];
              return (
                <div key={sk.id} style={s.row(!sk.enabled)}>
                  <span className="mono" style={s.order}>
                    {sk.order + 1}
                  </span>
                  <Link href={`/skills/${sk.id}`} className="mono" style={s.name}>
                    {sk.name}
                  </Link>
                  <span style={s.typeChip(color)}>{tSkills(`listItem.type.${sk.type}`)}</span>
                  <span style={s.meta} title={tSkills(`listItem.source.${sk.source}`)}>
                    <SourceIcon size={11} />
                    {tSkills(`card.version`, { version: sk.version })}
                  </span>
                  {sk.untrusted && (
                    <Badge color="var(--warn)" bg="var(--warn-bg)" icon="Shield">
                      {t("trace.skillsUsed.untrusted")}
                    </Badge>
                  )}
                  <span style={s.spacer} />
                  {!sk.enabled ? (
                    <Badge color="var(--text-muted)">{t("trace.skillsUsed.skipped")}</Badge>
                  ) : (
                    sk.tokens != null && (
                      <span className="mono" style={s.tokens}>
                        {t("trace.prompt.tokens", { count: sk.tokens.toLocaleString("en-US") })}
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </TraceSection>
  );
}
