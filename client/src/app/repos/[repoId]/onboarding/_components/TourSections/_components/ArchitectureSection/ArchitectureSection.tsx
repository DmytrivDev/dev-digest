"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { OnboardingArchitectureSection } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
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

  return (
    <div style={s.root}>
      {note ?? (
        <>
          <Markdown untrusted noLinks>
            {section.body}
          </Markdown>
          {section.diagram && (
            <MermaidDiagram
              chart={section.diagram}
              fallback={<p style={{ margin: 0 }}>{t("architecture.diagramUnavailable")}</p>}
            />
          )}
        </>
      )}
      {rows.length > 0 && (
        <dl style={s.facts}>
          {rows.map((row) => (
            <React.Fragment key={row.key}>
              <dt style={s.factLabel}>{row.label}</dt>
              <dd className="mono" style={s.factValue}>
                {row.values.map((v) => (
                  <span key={v.key}>{v.text}</span>
                ))}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
