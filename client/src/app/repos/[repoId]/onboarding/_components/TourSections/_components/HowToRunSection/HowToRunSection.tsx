"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingHowToRunSection } from "@devdigest/shared";
import { COPIED_MS } from "../../constants";
import { s } from "./styles";

type Step = OnboardingHowToRunSection["steps"][number];

/** One command with its note and a copy button. The copied state is local, so
    copying one step never re-renders the others. Only the command goes to the
    clipboard — never the note (AC-75). */
function StepRow({ step }: { step: Step }) {
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
        <code className="mono" style={s.command}>
          {step.command}
        </code>
        <button
          type="button"
          aria-label={t("howToRun.copy")}
          title={t("howToRun.copy")}
          onClick={copy}
          style={s.copyBtn}
        >
          {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
          {copied && <span>{t("howToRun.copied")}</span>}
        </button>
      </div>
      {step.note && <p style={s.note}>{step.note}</p>}
    </li>
  );
}

/** The commands to run the project locally, in order. */
export function HowToRunSection({ section }: { section: OnboardingHowToRunSection }) {
  return (
    <ul style={s.list}>
      {section.steps.map((step) => (
        <StepRow key={step.command} step={step} />
      ))}
    </ul>
  );
}
