/* SkillDraftModal — show the `repo-conventions` skill before it is saved.

   The body is assembled SERVER-side (`GET .../skill/draft`) and shown here
   verbatim. The client deliberately does not render the markdown itself: a
   draft shown and then saved untouched has to be byte-identical to what the
   save path writes, because that is what keeps "an unchanged accepted set
   burns no skill version" true. A client-side formatter would decide that by
   accident.

   Each field is an OVERRIDE, not a copy: what the user did not touch is left
   out of the POST entirely, which is exactly how the route reads an omitted
   field — "use what the server assembled". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput, Textarea } from "@devdigest/ui";
import { SKILL_LIMITS } from "@devdigest/shared";
import type { ConventionSkillDraft, Skill } from "@devdigest/shared";
import {
  useConventionSkillDraft,
  useCreateConventionSkill,
} from "@/lib/hooks/conventions";
import { BODY_ROWS, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function SkillDraftModal({
  repoId,
  repoName,
  acceptedCount,
  onClose,
  onCreated,
}: {
  repoId: string;
  repoName: string;
  acceptedCount: number;
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const draft = useConventionSkillDraft(repoId);
  const create = useCreateConventionSkill(repoId);

  // null = untouched, so the POST can omit it. Deriving the shown value from
  // the draft keeps the fields correct when it arrives after the first render.
  const [name, setName] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState<string | null>(null);
  const [body, setBody] = React.useState<string | null>(null);

  const shown = {
    name: name ?? draft.data?.name ?? "",
    description: description ?? draft.data?.description ?? "",
    body: body ?? draft.data?.body ?? "",
  };

  const valid =
    shown.name.trim().length > 0 &&
    shown.name.trim().length <= SKILL_LIMITS.name &&
    shown.description.trim().length <= SKILL_LIMITS.description &&
    shown.body.trim().length > 0;

  const submit = async () => {
    if (!draft.data) return;
    const patch: Partial<ConventionSkillDraft> = {};
    if (name !== null && name !== draft.data.name) patch.name = name.trim();
    if (description !== null && description !== draft.data.description) {
      patch.description = description.trim();
    }
    if (body !== null && body !== draft.data.body) patch.body = body;
    const skill = await create.mutateAsync(patch);
    onCreated(skill);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={shown.name || undefined}
      onClose={create.isPending ? undefined : onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={create.isPending}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={!draft.data || !valid || create.isPending}
            loading={create.isPending}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.explain}>
          {t("modal.explain", { count: acceptedCount, repo: repoName })}
        </div>

        {draft.isLoading && <div style={s.status}>{t("modal.loading")}</div>}
        {draft.isError && <div style={s.error}>{t("modal.loadError")}</div>}

        {draft.data && (
          <>
            <FormField label={t("modal.name")} hint={t("modal.nameHint")} required>
              <TextInput value={shown.name} onChange={setName} mono />
            </FormField>
            <FormField label={t("modal.description")}>
              <TextInput value={shown.description} onChange={setDescription} />
            </FormField>
            <FormField label={t("modal.body")} hint={t("modal.bodyHint")} required>
              <Textarea value={shown.body} onChange={setBody} rows={BODY_ROWS} mono />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
