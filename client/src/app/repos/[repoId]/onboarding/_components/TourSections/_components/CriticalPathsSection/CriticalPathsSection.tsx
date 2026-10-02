"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingCriticalPathsSection } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

/** Files the most other files import, each with the model's reason and an
    "Open" link pinned to the indexed commit (AC-67). */
export function CriticalPathsSection({
  section,
  repoFullName,
  sha,
}: {
  section: OnboardingCriticalPathsSection;
  repoFullName: string;
  sha: string;
}) {
  const t = useTranslations("onboarding");
  return (
    <ul style={s.list}>
      {section.items.map((item) => (
        <li key={item.path} style={s.row}>
          <div style={s.head}>
            <span className="mono" style={s.path}>
              {item.path}
            </span>
            <span style={s.meta}>{t("criticalPaths.importedBy", { count: item.imported_by })}</span>
            <a
              href={githubBlobUrl(repoFullName, sha, item.path)}
              target="_blank"
              rel="noopener noreferrer"
              style={s.open}
            >
              {t("criticalPaths.open")}
            </a>
          </div>
          {item.reason && <p style={s.reason}>{item.reason}</p>}
        </li>
      ))}
    </ul>
  );
}
