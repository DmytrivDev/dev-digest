"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection, OnboardingTour } from "@devdigest/shared";
import { SectionCard } from "./_components/SectionCard";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPathsSection } from "./_components/CriticalPathsSection";
import { HowToRunSection } from "./_components/HowToRunSection";
import { ReadingPathSection } from "./_components/ReadingPathSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { s } from "./styles";

/** The body of one section. A section with an `empty_reason` shows that
    reason's sentence in place of its rows (AC-43); the architecture card keeps
    its measured facts either way (AC-81). */
function SectionBody({
  section,
  repoFullName,
  sha,
}: {
  section: OnboardingSection;
  repoFullName: string;
  sha: string;
}) {
  const t = useTranslations("onboarding");
  const note = section.empty_reason ? (
    <p style={s.empty}>{t(`emptyReasons.${section.empty_reason}`)}</p>
  ) : null;

  switch (section.kind) {
    case "architecture_overview":
      return <ArchitectureSection section={section} note={note} />;
    case "critical_paths":
      return note ?? <CriticalPathsSection section={section} repoFullName={repoFullName} sha={sha} />;
    case "how_to_run":
      return note ?? <HowToRunSection section={section} />;
    case "guided_reading":
      return note ?? <ReadingPathSection section={section} repoFullName={repoFullName} sha={sha} />;
    case "first_tasks":
      return note ?? <FirstTasksSection section={section} />;
  }
}

/** The five collapsible tour sections, in the order the server stores them.
    File links are pinned to the commit the tour was indexed at (AC-67). */
export function TourSections({
  tour,
  repoFullName,
}: {
  tour: OnboardingTour;
  repoFullName: string;
}) {
  return (
    <div style={s.stack}>
      {tour.sections.map((section) => (
        <SectionCard key={section.kind} kind={section.kind}>
          <SectionBody section={section} repoFullName={repoFullName} sha={tour.indexed_sha} />
        </SectionCard>
      ))}
    </div>
  );
}
