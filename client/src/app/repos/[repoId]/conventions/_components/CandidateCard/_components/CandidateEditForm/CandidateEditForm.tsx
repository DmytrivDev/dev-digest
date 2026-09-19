/* CandidateEditForm — the card's INLINE editor.

   It replaces the rule and the actions in place and leaves the evidence block
   standing, because evidence is a claim about the code that editing the wording
   does not change (the server refuses to re-point it for the same reason). A
   modal or a detail route would move the user away from the list they are
   triaging, which is the whole cost this page is trying to avoid. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SelectInput, Textarea } from "@devdigest/ui";
import { CONVENTION_LIMITS, ConventionCategory } from "@devdigest/shared";
import type { ConventionCategory as Category } from "@devdigest/shared";
import { EDIT_ROWS } from "./constants";
import { s } from "./styles";

export function CandidateEditForm({
  rule,
  category,
  busy,
  onCancel,
  onSave,
}: {
  rule: string;
  category: Category;
  busy?: boolean;
  onCancel: () => void;
  onSave: (patch: { rule: string; category: Category }) => void;
}) {
  const t = useTranslations("conventions");
  const selectId = React.useId();
  const [draftRule, setDraftRule] = React.useState(rule);
  const [draftCategory, setDraftCategory] = React.useState<Category>(category);

  const trimmed = draftRule.trim();
  const remaining = CONVENTION_LIMITS.rule - trimmed.length;
  const tooLong = remaining < 0;
  // The server enforces the same two rules (non-empty, capped) and answers 422.
  // Disabling here is how the user learns it without paying a round trip.
  const canSave = trimmed.length > 0 && !tooLong && !busy;

  return (
    <div style={s.form}>
      <label style={s.label}>{t("card.ruleLabel")}</label>
      <Textarea value={draftRule} onChange={setDraftRule} rows={EDIT_ROWS} />
      <div style={s.meta}>
        <span style={tooLong ? s.counterOver : s.counter}>
          {tooLong
            ? t("card.tooLong", { max: CONVENTION_LIMITS.rule })
            : t("card.charsLeft", { count: remaining })}
        </span>
      </div>

      {/* Category and the actions share one row: the form then costs the card a
          couple of lines rather than doubling its height, which matters when
          you are editing one card in a list of a dozen. */}
      <div style={s.actions}>
        <label style={s.inlineLabel} htmlFor={selectId}>
          {t("card.categoryLabel")}
        </label>
        <div style={s.select}>
          <SelectInput
            id={selectId}
            value={draftCategory}
            onChange={(v) => setDraftCategory(v as Category)}
            options={ConventionCategory.options.map((value) => ({
              value,
              label: t(`category.${value}`),
            }))}
            mono={false}
          />
        </div>
        <div style={s.buttons}>
          <Button kind="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t("card.cancel")}
          </Button>
          <Button
            kind="primary"
            size="sm"
            icon="Check"
            disabled={!canSave}
            loading={busy}
            onClick={() => onSave({ rule: trimmed, category: draftCategory })}
          >
            {busy ? t("card.saving") : t("card.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
