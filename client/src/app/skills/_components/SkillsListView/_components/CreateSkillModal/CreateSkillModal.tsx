"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { DEFAULT_TYPE, TYPE_OPTIONS } from "../../../../../../lib/skills";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/** Create-skill modal — name / description / type / body. */
export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");

  // The server rejects an empty name or body (min(1)); disabling the button is
  // how the user finds that out here rather than through an error toast.
  const canSubmit = name.trim().length > 0 && body.trim().length > 0 && !create.isPending;

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type,
      body,
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("config.name")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("config.namePlaceholder")}
            mono
          />
        </FormField>
        <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("config.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("config.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={TYPE_OPTIONS.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
          />
        </FormField>
        <FormField label={t("config.body")} required hint={t("config.bodyHint")}>
          <Textarea
            value={body}
            onChange={setBody}
            rows={10}
            mono
            placeholder={t("config.bodyPlaceholder")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
