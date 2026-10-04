"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingReadiness } from "@devdigest/shared";
import { s } from "./styles";

/** The one line that says why there is no (fresh) tour yet.
    - not cloned: the message and "Check again"; no Generate control at all (AC-7);
    - generating: the wait message (AC-17);
    - not indexed: the message beside a disabled Generate — shown here only when
      there is no tour, because with a tour the header's Regenerate carries it (AC-8).
    Nothing renders for a ready repository that is idle. */
export function ReadinessNotice({
  readiness,
  generating,
  hasTour,
  checking,
  onCheckAgain,
}: {
  readiness: OnboardingReadiness;
  generating: boolean;
  hasTour: boolean;
  checking: boolean;
  onCheckAgain: () => void;
}) {
  const t = useTranslations("onboarding");

  if (readiness === "not_cloned") {
    return (
      <div role="status" style={s.notice}>
        <span style={s.text}>{t("readiness.notCloned")}</span>
        <Button kind="secondary" size="sm" icon="RefreshCw" loading={checking} onClick={onCheckAgain}>
          {t("readiness.checkAgain")}
        </Button>
      </div>
    );
  }

  if (generating) {
    return (
      <div role="status" style={s.notice}>
        <span style={s.text}>{t("readiness.generating")}</span>
      </div>
    );
  }

  if (readiness === "not_indexed") {
    return (
      <div role="status" style={s.notice}>
        <span style={s.text}>{t("readiness.notIndexed")}</span>
        {!hasTour && (
          <Button kind="primary" size="sm" icon="Play" disabled>
            {t("empty.cta")}
          </Button>
        )}
      </div>
    );
  }

  return null;
}
