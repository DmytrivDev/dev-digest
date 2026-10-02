/* ContextTab — attach the active repository's markdown documents to this agent.
   They are injected into every run as one untrusted `## Project context` block.
   Documents the agent inherits through enabled linked skills appear read-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/ContextDocPicker";
import { ApiError } from "@/lib/api";
import { useAgentContextDocs, useSetAgentContextDocs } from "@/lib/hooks/agents";
import { useContextFiles } from "@/lib/hooks/core";
import { useActiveRepo } from "@/lib/repo-context";
import { agentTokenEstimate } from "./helpers";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tc = useTranslations("context");
  const { repoId, reposLoaded } = useActiveRepo();
  const list = useContextFiles(repoId);
  const attachments = useAgentContextDocs(agent.id, repoId);
  const save = useSetAgentContextDocs();

  // Repositories still loading: no active repo yet is not "no repo selected".
  if (repoId === null && !reposLoaded) return <Skeleton height={44} />;
  if (repoId === null) {
    return (
      <div style={s.wrap}>
        <ContextDocPicker repoId={null} docs={[]} attached={[]} onSave={() => {}} />
      </div>
    );
  }

  const failed = list.isError ? list : attachments.isError ? attachments : null;
  if (failed) {
    return (
      <ErrorState
        title={tc("picker.loadError")}
        body={failed.error instanceof ApiError ? failed.error.message : undefined}
        onRetry={() => {
          if (list.isError) list.refetch();
          if (attachments.isError) attachments.refetch();
        }}
      />
    );
  }
  if (!list.data || !attachments.data) {
    return (
      <div style={s.wrap} aria-label={tc("picker.loading")}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  const { attached, inherited } = attachments.data;
  const header = (
    <>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attachedOf", { n: attached.length, total: list.data.docs.length })}
        </Badge>
        <Badge>{t("context.tokens", { count: agentTokenEstimate(attached, inherited).toLocaleString("en-US") })}</Badge>
      </div>
      <p style={s.note}>{t("context.note")}</p>
    </>
  );

  return (
    <ContextDocPicker
      repoId={repoId}
      docs={list.data.docs}
      attached={attached}
      inherited={inherited}
      header={header}
      saveError={save.isError ? tc("picker.saveError") : null}
      onSave={(paths) => save.mutate({ agentId: agent.id, repoId, paths })}
    />
  );
}
