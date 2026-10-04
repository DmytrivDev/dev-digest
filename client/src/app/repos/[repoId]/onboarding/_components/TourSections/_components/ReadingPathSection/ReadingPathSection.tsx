"use client";

import React from "react";
import { MonoLink } from "@devdigest/ui";
import type { OnboardingGuidedReadingSection } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

/** The suggested reading order: each file links to the indexed commit (AC-67)
    with the model's one-line reason. An ordered list — the order is the point. */
export function ReadingPathSection({
  section,
  repoFullName,
  sha,
}: {
  section: OnboardingGuidedReadingSection;
  repoFullName: string;
  sha: string;
}) {
  return (
    <ol style={s.list}>
      {section.items.map((item, i) => (
        <li key={item.path} style={s.row}>
          <span className="tnum" aria-hidden="true" style={s.step}>
            {i + 1}
          </span>
          <div style={s.main}>
            <MonoLink href={githubBlobUrl(repoFullName, sha, item.path)}>{item.path}</MonoLink>
            {item.why && <p style={s.why}>{item.why}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
