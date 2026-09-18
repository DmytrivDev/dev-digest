/* ConfigTab — name / description / type / body, plus the enabled toggle and a
   delete danger zone. The body is the whole skill; everything else is metadata,
   which is why only a body change bumps the version. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { SKILL_LIMITS } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { approxTokens, TYPE_OPTIONS } from "../../../../../../../lib/skills";
import { s } from "./styles";

/** `{n}/{max}` beside a capped field, red once the value exceeds the cap. */
function CharCount({ value, max }: { value: string; max: number }) {
  const t = useTranslations("skills");
  const over = value.length > max;
  return (
    <span
      className="mono"
      style={{ fontSize: 11, color: over ? "var(--crit)" : "var(--text-muted)" }}
    >
      {t("config.charCount", { count: value.length, max })}
    </span>
  );
}

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  // Switching skills resets this form by REMOUNTING it — SkillEditor passes
  // `key={skill.id}` — so there is no effect mirroring props into state.
  const bodyChanged = body !== skill.body;
  const dirty =
    bodyChanged ||
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    enabled !== skill.enabled;

  const revert = () => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  };

  // The server rejects an over-long name or description with a 422, so the cap
  // has to be visible while typing. `maxLength` alone is not enough: a value
  // that arrived over the cap from the API (the seed wrote one straight through
  // Drizzle) is NOT truncated by the browser, and the form would then fail to
  // save on a field the user never touched. The counter is what makes that
  // state legible — and `dirty` still allows the save attempt, so shortening
  // the field is the fix rather than a dead end.
  const overLimit =
    name.length > SKILL_LIMITS.name || description.length > SKILL_LIMITS.description;

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge color="var(--text-secondary)" icon="GitCommit" mono>
          {t("card.version", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <FormField
        label={t("config.name")}
        required
        right={<CharCount value={name} max={SKILL_LIMITS.name} />}
      >
        <TextInput
          value={name}
          onChange={setName}
          mono
          maxLength={SKILL_LIMITS.name}
          placeholder={t("config.namePlaceholder")}
        />
      </FormField>

      <FormField
        label={t("config.description")}
        hint={t("config.descriptionHint")}
        right={<CharCount value={description} max={SKILL_LIMITS.description} />}
      >
        <TextInput
          value={description}
          onChange={setDescription}
          maxLength={SKILL_LIMITS.description}
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
        <div style={s.editor}>
          <div style={s.editorBar}>
            <Icon.FileText size={14} style={{ color: "var(--text-muted)" }} />
            <span className="mono" style={s.filename}>{`${skill.name}.md`}</span>
            {bodyChanged && <Badge color="var(--text-muted)">{t("config.unsaved")}</Badge>}
            <span className="mono" style={s.tokens}>
              {t("config.tokens", { count: approxTokens(body).toLocaleString("en-US") })}
            </span>
          </div>
          <Textarea
            value={body}
            onChange={setBody}
            rows={18}
            mono
            placeholder={t("config.bodyPlaceholder")}
          />
        </div>
      </FormField>

      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          disabled={!dirty || overLimit || update.isPending}
        >
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={revert} disabled={!dirty}>
          {t("config.cancel")}
        </Button>
        {bodyChanged && (
          <span style={s.nextVersion}>
            {t("config.nextVersion", { version: skill.version + 1 })}
          </span>
        )}
      </div>

      <div style={s.danger}>
        <div style={s.dangerText}>
          <div style={s.dangerTitle}>{t("config.dangerTitle")}</div>
          <div style={s.dangerBody}>{t("config.dangerBody")}</div>
        </div>
        <Button
          kind="danger"
          size="sm"
          icon="Trash"
          disabled={del.isPending}
          onClick={() => {
            if (!window.confirm(t("card.deleteConfirm", { name: skill.name }))) return;
            del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
          }}
        >
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}
