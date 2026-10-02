/* ContextTab — attach the active repository's markdown documents to this skill.
   Any agent that carries the skill inherits them, so the tab also shows how the
   documents are serialized into the prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/ContextDocPicker";
import { ApiError } from "@/lib/api";
import { useContextFiles } from "@/lib/hooks/core";
import { useSkillContextDocs, useSetSkillContextDocs } from "@/lib/hooks/skills";
import { useActiveRepo } from "@/lib/repo-context";
import { serializePreview, skillTokenEstimate } from "./helpers";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tc = useTranslations("context");
  const { repoId, reposLoaded } = useActiveRepo();
  const list = useContextFiles(repoId);
  const attachments = useSkillContextDocs(skill.id, repoId);
  const save = useSetSkillContextDocs();

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

  const { attached } = attachments.data;
  const serialized = serializePreview(attached.map((a) => a.path));
  const header = (
    <>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attached", { n: attached.length })}
        </Badge>
        <Badge>{t("context.tokens", { count: skillTokenEstimate(attached).toLocaleString("en-US") })}</Badge>
      </div>
      <p style={s.note}>{t("context.note")}</p>
    </>
  );

  return (
    <>
      <ContextDocPicker
        repoId={repoId}
        docs={list.data.docs}
        attached={attached}
        header={header}
        saveError={save.isError ? tc("picker.saveError") : null}
        onSave={(paths) => save.mutate({ skillId: skill.id, repoId, paths })}
      />
      {serialized !== "" && (
        <div style={s.serializes}>
          <div style={s.serializesLabel}>{t("context.serializesAs")}</div>
          <pre className="mono" style={s.pre}>
            {serialized}
          </pre>
        </div>
      )}
    </>
  );
}
