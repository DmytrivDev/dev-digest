"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  repoId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function OverviewTab({ prId, prBody, repoId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {/* The Intent block is the summary; the raw description below it is the
          material it was derived from — summary first. */}
      <IntentCard prId={prId} />

      <BlastRadiusCard
        repoId={repoId}
        prId={prId}
        repoFullName={repoFullName}
        headSha={headSha}
      />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
