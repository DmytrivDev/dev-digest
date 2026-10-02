"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Markdown, SectionLabel } from "@devdigest/ui";
import type { OnboardingArchitectureSection } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { DIAGRAM_ROLE_STYLES } from "../../constants";
import { diagramRoles } from "../../helpers";
import { s } from "./styles";

/** Architecture overview: the model's prose and diagram, plus the facts the
    server measured. `note` (an empty-reason sentence) replaces the prose and
    diagram when the model did not write them; the facts are still shown (AC-81).
    The prose is model-written, so it renders inert: no images, no links (AC-83). */
export function ArchitectureSection({
  section,
  note,
}: {
  section: OnboardingArchitectureSection;
  note?: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const { facts } = section;
  const files = (count: number) =>
    t("architecture.facts.files", { count: count.toLocaleString("en-US") });
  const rows: { key: string; label: string; values: { key: string; text: string }[] }[] = [];

  if (facts.package_manager) {
    rows.push({
      key: "packageManager",
      label: t("architecture.facts.packageManager"),
      values: [{ key: facts.package_manager, text: facts.package_manager }],
    });
  }
  if (facts.package_dirs.length > 0) {
    rows.push({
      key: "packageDirs",
      label: t("architecture.facts.packageDirs"),
      values: facts.package_dirs.map((dir) => ({ key: dir, text: dir })),
    });
  }
  if (facts.top_folders.length > 0) {
    rows.push({
      key: "topFolders",
      label: t("architecture.facts.topFolders"),
      values: facts.top_folders.map((f) => ({ key: f.path, text: `${f.path} · ${files(f.files)}` })),
    });
  }
  if (facts.compose_services.length > 0) {
    rows.push({
      key: "composeServices",
      label: t("architecture.facts.composeServices"),
      values: facts.compose_services.map((name) => ({ key: name, text: name })),
    });
  }
  if (facts.extensions.length > 0) {
    rows.push({
      key: "extensions",
      label: t("architecture.facts.extensions"),
      values: facts.extensions.map((e) => ({
        key: e.extension,
        text: `${e.extension} · ${files(e.files)}`,
      })),
    });
  }

  const roles = diagramRoles(section.diagram);

  return (
    <div style={s.root}>
      {note ?? (
        <>
          {section.body && (
            <div style={s.prose}>
              <Markdown untrusted noLinks>
                {section.body}
              </Markdown>
            </div>
          )}
          {section.diagram && (
            <div style={s.diagram}>
              <MermaidDiagram
                chart={section.diagram}
                nodeClasses={DIAGRAM_ROLE_STYLES}
                fallback={<p style={s.diagramFallback}>{t("architecture.diagramUnavailable")}</p>}
              />
              {roles.length > 0 && (
                <ul aria-label={t("architecture.legend")} style={s.legend}>
                  {roles.map((role) => (
                    <li key={role} style={s.legendItem}>
                      <span aria-hidden="true" style={s.swatch(DIAGRAM_ROLE_STYLES[role])} />
                      {t(`architecture.roles.${role}`)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      {rows.length > 0 && (
        <div style={s.factsBlock}>
          <SectionLabel icon="Database">{t("architecture.factsTitle")}</SectionLabel>
          <dl style={s.facts}>
            {rows.map((row) => (
              <React.Fragment key={row.key}>
                <dt style={s.factLabel}>{row.label}</dt>
                <dd style={s.factValue}>
                  {row.values.map((v) => (
                    <Badge key={v.key} mono color="var(--text-primary)" bg="var(--bg-surface)" style={s.chip}>
                      {v.text}
                    </Badge>
                  ))}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
