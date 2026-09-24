"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

interface SmartDiffGroupProps {
  label: string;
  hint: string;
  color: string;
  filesCount: number;
  /** Number of files in this group that carry a finding, or `null` when no
      review has run yet ("Review not run yet" instead of a counter). */
  filesWithFindings: number | null;
  defaultOpen: boolean;
  /** Only the FIRST group shows the "review not run" message, so it isn't
      repeated on every header. */
  showReviewNotRun?: boolean;
  children: React.ReactNode;
}

export function SmartDiffGroup({
  label,
  hint,
  color,
  filesCount,
  filesWithFindings,
  defaultOpen,
  showReviewNotRun,
  children,
}: SmartDiffGroupProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen && filesCount > 0);
  const canToggle = filesCount > 0;

  const toggle = () => {
    if (canToggle) setOpen((o) => !o);
  };

  return (
    <div style={s.wrap}>
      <div
        role="button"
        tabIndex={canToggle ? 0 : -1}
        aria-expanded={open}
        aria-disabled={!canToggle || undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") toggle();
        }}
        style={s.header}
      >
        <Icon.ChevronRight
          size={13}
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .12s",
            visibility: canToggle ? "visible" : "hidden",
          }}
        />
        <span style={s.swatch(color)} />
        <span style={s.label}>{label}</span>
        <span style={s.hint}>{hint}</span>
        <span style={s.spacer} />
        {filesWithFindings != null && filesWithFindings > 0 && (
          <span
            style={s.findingsCount}
            aria-label={t("smartDiff.filesWithFindings", { count: filesWithFindings })}
          >
            <span style={s.findingsDot} aria-hidden />
            {filesWithFindings}
          </span>
        )}
        {filesWithFindings == null && showReviewNotRun && (
          <span style={s.reviewNotRun}>{t("smartDiff.reviewNotRun")}</span>
        )}
        <span style={s.filesCount}>{t("smartDiff.filesCount", { count: filesCount })}</span>
      </div>
      {open && <div style={s.body}>{children}</div>}
    </div>
  );
}
