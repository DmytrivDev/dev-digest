"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingUsage } from "@devdigest/shared";
import { usageLine } from "../../helpers";
import { s } from "./styles";

/** What generating this tour cost: calls, tokens, money and model (AC-36). */
export function UsageFooter({ usage }: { usage: OnboardingUsage }) {
  const t = useTranslations("onboarding");
  return <footer style={s.footer}>{usageLine(usage, t)}</footer>;
}
