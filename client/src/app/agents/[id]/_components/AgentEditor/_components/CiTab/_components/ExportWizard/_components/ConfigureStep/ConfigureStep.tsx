/* Step 3 — Configure (AC-10): trigger chips (synchronize locked), the static
   "Secrets expected" table (no request — whether the secret exists is not
   checked), the "Post results as" radio group and the merge-blocking note.
   Changing a value is reported to the wizard, which owns the regenerate rule. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, Icon } from "@devdigest/ui";
import type { CiPostAs, CiTrigger } from "@devdigest/shared";
import { DEFAULT_POST_AS, LOCKED_TRIGGER, POST_AS_VALUES, SECRETS, TRIGGER_VALUES } from "../../constants";
import { stepPostAs } from "../../helpers";
import { s } from "../../styles";

export function ConfigureStep({
  triggers,
  postAs,
  onToggleTrigger,
  onPostAs,
  replacedNotice,
}: {
  triggers: readonly CiTrigger[];
  postAs: CiPostAs;
  onToggleTrigger: (trigger: CiTrigger) => void;
  onPostAs: (value: CiPostAs) => void;
  replacedNotice: boolean;
}) {
  const t = useTranslations("ci");
  const radioRefs = React.useRef<Partial<Record<CiPostAs, HTMLButtonElement | null>>>({});

  const onRadioKey = (e: React.KeyboardEvent) => {
    const next = stepPostAs(postAs, e.key);
    if (!next) return;
    e.preventDefault();
    onPostAs(next);
    radioRefs.current[next]?.focus();
  };

  return (
    <>
      <div>
        <div style={s.sectionLabel}>{t("exportWizard.configure.trigger")}</div>
        <div style={s.chips}>
          {TRIGGER_VALUES.map((trigger) => {
            const active = triggers.includes(trigger);
            const label = `pull_request:${trigger}`;
            return trigger === LOCKED_TRIGGER ? (
              <span
                key={trigger}
                aria-disabled="true"
                title={t("exportWizard.configure.synchronizeLocked")}
                style={s.lockedChip}
              >
                <Chip active icon="Check">
                  {label}
                </Chip>
              </span>
            ) : (
              <Chip
                key={trigger}
                active={active}
                icon={active ? "Check" : undefined}
                onClick={() => onToggleTrigger(trigger)}
              >
                {label}
              </Chip>
            );
          })}
        </div>
      </div>

      <div>
        <div style={s.sectionLabel}>{t("exportWizard.configure.secretsTitle")}</div>
        <div style={s.secrets}>
          {SECRETS.map((secret, i) => (
            <div key={secret.name} style={s.secretRow(i === SECRETS.length - 1)}>
              <span className="mono" style={s.secretName}>
                {secret.name}
              </span>
              <span style={s.secretDesc}>{t(`exportWizard.configure.${secret.descKey}`)}</span>
              <Badge color={`var(--${secret.tone})`} bg={`var(--${secret.tone}-bg)`} dot>
                {t(`exportWizard.configure.${secret.pillKey}`)}
              </Badge>
            </div>
          ))}
        </div>
        <div style={{ ...s.muted, marginTop: 8 }}>{t("exportWizard.configure.secretsNote")}</div>
      </div>

      <div>
        <div style={s.sectionLabel} id="ci-post-as-label">
          {t("exportWizard.configure.postAsLabel")}
        </div>
        <div role="radiogroup" aria-labelledby="ci-post-as-label" style={s.radios} onKeyDown={onRadioKey}>
          {POST_AS_VALUES.map((value) => {
            const checked = value === postAs;
            return (
              <button
                key={value}
                ref={(el) => {
                  radioRefs.current[value] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => onPostAs(value)}
                style={s.radio}
              >
                <span style={s.radioDot(checked)}>{checked && <span style={s.radioDotInner} />}</span>
                {t(`exportWizard.configure.postAs.${value}`)}
                {value === DEFAULT_POST_AS && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                    {t("exportWizard.configure.recommended")}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={s.info}>
        <Icon.Info size={15} style={s.infoIcon} />
        <span>
          {t.rich("exportWizard.configure.mergeInfo", {
            b: (chunks) => <strong style={s.strong}>{chunks}</strong>,
          })}
        </span>
      </div>

      {replacedNotice && (
        <div role="status" style={s.notice}>
          {t("exportWizard.configure.replacedNotice")}
        </div>
      )}
    </>
  );
}
