"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { API_KEYS_HREF } from "../../constants";
import { reasonText, relativeTime } from "../../helpers";
import { s } from "./styles";

/** What limited this tour. One banner lists the sentence of every reason (AC-42),
    with a Settings link when the cause is a missing API key (AC-46). A failed
    regeneration over a stored tour gets its own line (AC-22). Nothing renders
    when there is nothing to say. */
export function StatusBanner({ tour, nowMs }: { tour: OnboardingTour; nowMs: number }) {
  const t = useTranslations("onboarding");
  const { reasons, last_failure: failure, usage } = tour;
  if (reasons.length === 0 && !failure) return null;

  return (
    <div style={s.stack}>
      {reasons.length > 0 && (
        <div role="status" style={s.banner("info")}>
          <Icon.Info size={15} style={s.icon("info")} />
          <ul style={s.list}>
            {reasons.map((reason) => (
              <li key={reason}>
                {reasonText(reason, usage.provider, t)}
                {reason === "llm_not_configured" && (
                  <Link href={API_KEYS_HREF} style={s.link}>
                    {t("banner.apiKeysLink")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failure && (
        <div role="alert" style={s.banner("error")}>
          <Icon.AlertTriangle size={15} style={s.icon("error")} />
          <span>
            {t("banner.failure", {
              reason: reasonText(failure.reason, usage.provider, t),
              when: relativeTime(tour.generated_at, nowMs, t),
            })}
          </span>
        </div>
      )}
    </div>
  );
}
