"use client";

import React from "react";
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
      {section.items.map((item) => (
        <li key={item.path}>
          <a
            className="mono"
            href={githubBlobUrl(repoFullName, sha, item.path)}
            target="_blank"
            rel="noopener noreferrer"
            style={s.link}
          >
            {item.path}
          </a>
          {item.why && <p style={s.why}>{item.why}</p>}
        </li>
      ))}
    </ol>
  );
}
