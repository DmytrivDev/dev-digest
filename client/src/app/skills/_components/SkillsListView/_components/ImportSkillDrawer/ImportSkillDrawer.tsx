/* ImportSkillDrawer — pick a .md or .zip, see what it WOULD become, then save.
   The two steps are the point: an imported skill is a stranger's instructions
   heading for an agent's prompt, so nothing is written until you have read it.
   The archive's other entries are listed by the server and never opened. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Icon, Markdown } from "@devdigest/ui";
import { ApiError } from "../../../../../../lib/api";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import type { SkillImportPreview } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ACCEPTED_EXTENSIONS, DRAWER_WIDTH, MAX_UPLOAD_BYTES } from "./constants";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const parse = useImportSkillPreview();
  const create = useCreateSkill();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreview(null);
    setFilename(file.name);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${Math.round(file.size / 1024)} KB is too large (limit ${MAX_UPLOAD_BYTES / 1024} KB).`);
      return;
    }
    try {
      const contentBase64 = await readFileAsBase64(file);
      setPreview(
        await parse.mutateAsync({ filename: file.name, content_base64: contentBase64 }),
      );
    } catch (err) {
      // A rejected import is expected input, not a system failure, so it is
      // shown inline in the drawer instead of as a toast.
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const save = async () => {
    if (!preview) return;
    // Imported skills land DISABLED. Saving is not the same as trusting: you
    // enable it once you have read it, and until then it cannot reach a prompt.
    const skill = await create.mutateAsync({
      name: preview.name,
      description: preview.description,
      type: preview.type,
      body: preview.body,
      source: "imported_url",
      enabled: false,
    });
    toast.success(t("import.savedToast", { name: skill.name }));
    onClose();
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Check"
            onClick={save}
            disabled={!preview || create.isPending}
          >
            {create.isPending ? t("import.saving") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.picker}>
          <Icon.Upload size={18} style={{ color: "var(--text-muted)" }} />
          <span style={s.pickerText}>
            {filename ? t("import.picked", { name: filename }) : t("import.subtitle")}
          </span>
          <Button kind="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            {parse.isPending ? t("import.parsing") : t("import.pick")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            aria-label={t("import.pick")}
            style={s.hidden}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              // Reset so picking the SAME file again still fires onChange.
              e.target.value = "";
            }}
          />
        </div>

        {error && <div style={s.error}>{`${t("import.parseError")}: ${error}`}</div>}

        {preview && (
          <>
            <div>
              <div style={s.sectionTitle}>{t("import.previewHeading")}</div>
              <div style={s.note}>{t("import.previewNote")}</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                {preview.name}
              </span>
              <Badge color="var(--text-secondary)">{t(`listItem.type.${preview.type}`)}</Badge>
              {preview.source_entry && (
                <Badge color="var(--text-muted)" mono icon="FileText">
                  {t("import.sourceEntry", { entry: preview.source_entry })}
                </Badge>
              )}
            </div>

            {preview.description && <div style={s.note}>{preview.description}</div>}

            {preview.ignored_entries.length > 0 && (
              <div style={s.ignoredBox}>
                <div style={s.sectionTitle}>
                  {t("import.ignoredHeading", { count: preview.ignored_entries.length })}
                </div>
                <div style={s.note}>{t("import.ignoredNote")}</div>
                <ul style={s.ignoredList}>
                  {preview.ignored_entries.map((entry) => (
                    <li key={entry} className="mono" style={s.ignoredItem}>
                      {entry}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={s.notice}>
              <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} />
              <span>{t("import.disabledNote")}</span>
            </div>

            <div style={s.bodyBox}>
              <Markdown>{preview.body}</Markdown>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
