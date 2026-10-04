"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingHowToRunSection } from "@devdigest/shared";
import { COPIED_MS } from "../../constants";
import { s } from "./styles";

type Step = OnboardingHowToRunSection["steps"][number];

/** One numbered command with its note and a copy button. The copied state is local,
    so copying one step never re-renders the others. Only the command goes to the
    clipboard — never the note (AC-75). The button is a fixed-size icon and "Copied"
    floats beside it, so copying never changes the row's size or re-wraps the command. */
function StepRow({ step, index }: { step: Step; index: number }) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    void navigator.clipboard?.writeText(step.command);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <li style={s.row}>
      <div style={s.commandRow}>
        <span className="tnum" aria-hidden="true" style={s.index}>
          {index + 1}
        </span>
        <code className="mono" style={s.command}>
          {step.command}
        </code>
        <span style={s.copyWrap}>
          <span aria-live="polite" style={s.copiedSlot}>
            {copied && <span style={s.copiedPill}>{t("howToRun.copied")}</span>}
          </span>
          <button
            type="button"
            aria-label={t("howToRun.copy")}
            title={t("howToRun.copy")}
            onClick={copy}
            style={s.copyBtn(copied)}
          >
            {copied ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
          </button>
        </span>
      </div>
      {step.note && <p style={s.note}>{step.note}</p>}
    </li>
  );
}

/** The commands to run the project locally, in order. */
export function HowToRunSection({ section }: { section: OnboardingHowToRunSection }) {
  return (
    <ol style={s.list}>
      {section.steps.map((step, i) => (
        <StepRow key={step.command} step={step} index={i} />
      ))}
    </ol>
  );
}
