"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { COPIED_MS } from "../../constants";
import { subtitleLine, tourToMarkdown } from "../../helpers";
import { s } from "./styles";

type Copied = "link" | "markdown" | null;

/** Title, provenance subtitle and the page's actions. `showRegenerate` is false
    when the repository has no clone (AC-7: no Generate or Regenerate anywhere);
    `regenerateDisabled` covers generating and not-yet-indexed. `nowMs` comes from
    the caller so relative times are testable. */
export function TourHeader({
  tour,
  repoName,
  nowMs,
  showRegenerate,
  regenerateDisabled,
  onRegenerate,
}: {
  tour: OnboardingTour;
  repoName: string;
  nowMs: number;
  showRegenerate: boolean;
  regenerateDisabled: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState<Copied>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (what: Exclude<Copied, null>, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // no clipboard access: say nothing rather than claim a copy
    }
    setCopied(what);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  return (
    <div style={s.header}>
      <div style={s.text}>
        <h1 style={s.h1}>
          {t("header.titlePrefix")}{" "}
          <span className="mono" style={s.repoName}>
            {repoName}
          </span>
        </h1>
        <p style={s.subtitle}>{subtitleLine(tour, nowMs, t)}</p>
      </div>
      <div style={s.actions}>
        {tour.stale && showRegenerate && (
          <span style={s.stale}>
            <Icon.AlertTriangle size={13} />
            {t("header.stale")}
          </span>
        )}
        {showRegenerate && (
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            disabled={regenerateDisabled}
            onClick={onRegenerate}
          >
            {t("header.regenerate")}
          </Button>
        )}
        <Button
          kind="ghost"
          size="sm"
          icon={copied === "link" ? "Check" : "Link"}
          onClick={() => void copy("link", window.location.href)}
        >
          {copied === "link" ? t("header.linkCopied") : t("header.copyLink")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon={copied === "markdown" ? "Check" : "Copy"}
          onClick={() => void copy("markdown", tourToMarkdown(tour, repoName, t, nowMs))}
        >
          {copied === "markdown" ? t("header.markdownCopied") : t("header.copyMarkdown")}
        </Button>
      </div>
    </div>
  );
}
