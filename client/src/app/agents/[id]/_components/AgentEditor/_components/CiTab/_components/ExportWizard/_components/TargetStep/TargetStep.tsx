/* Step 1 — Target (AC-5, AC-6): the repository picker and the single
   GitHub Actions card. Other CI targets are out of scope for this iteration,
   so there is no card for them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, FormField, Icon, SelectInput } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { s } from "../../styles";

export function TargetStep({
  repos,
  repoId,
  onRepo,
  providerSupported,
}: {
  repos: Repo[];
  repoId: string | null;
  onRepo: (id: string) => void;
  providerSupported: boolean;
}) {
  const t = useTranslations("ci");
  const options = repos.map((r) => ({ value: r.id, label: r.full_name }));
  if (!repoId) options.unshift({ value: "", label: t("exportWizard.target.repoPlaceholder") });

  return (
    <>
      <FormField label={t("exportWizard.target.repoLabel")}>
        <SelectInput value={repoId ?? ""} onChange={onRepo} options={options} />
      </FormField>

      <div style={s.card(true)} aria-label={t("exportWizard.target.ghaTitle")}>
        <div style={s.cardHead}>
          <div style={s.cardIcon}>
            <Icon.Workflow size={18} />
          </div>
          <span style={s.cardTitle}>{t("exportWizard.target.ghaTitle")}</span>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {t("exportWizard.target.recommended")}
          </Badge>
        </div>
        <div style={s.cardDesc}>{t("exportWizard.target.ghaDesc")}</div>
      </div>

      {!providerSupported && (
        <div role="alert" style={s.alert("warn")}>
          {t("exportWizard.target.providerNotSupported")}
        </div>
      )}
    </>
  );
}
