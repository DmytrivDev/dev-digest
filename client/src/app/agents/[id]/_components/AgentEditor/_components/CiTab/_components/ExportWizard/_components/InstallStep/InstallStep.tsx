/* Step 4 — Install (AC-12, AC-16): the two ways to get the files, the docs
   link, and — once the export answered — the PR link or the zip name. A failed
   export is shown inline with everything the user entered still in place. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiExportOutcome } from "@/lib/hooks/ci";
import { s } from "../../styles";
import { DocsHelpLink } from "../DocsHelpLink";

export type InstallAction = "open_pr" | "zip";

export function InstallStep({
  repoName,
  fileCount,
  action,
  onAction,
  outcome,
  error,
}: {
  repoName: string;
  /** null while the preview behind the install is still being regenerated. */
  fileCount: number | null;
  action: InstallAction;
  onAction: (action: InstallAction) => void;
  outcome: CiExportOutcome | undefined;
  error: string | null;
}) {
  const t = useTranslations("ci");
  const prUrl = outcome?.kind === "open_pr" ? outcome.result.pr_url : null;

  return (
    <>
      <div role="radiogroup" aria-label={t("exportWizard.steps.install")} style={s.group}>
        <button
          type="button"
          role="radio"
          aria-checked={action === "open_pr"}
          onClick={() => onAction("open_pr")}
          style={s.option(action === "open_pr")}
        >
          <span style={s.optionHead}>
            <Icon.GitPullRequest size={16} style={s.optionIcon} />
            <span style={s.optionTitle}>{t("exportWizard.install.prTitle")}</span>
            <Badge color="var(--accent-text)" bg="var(--accent-bg)">
              {t("exportWizard.target.recommended")}
            </Badge>
          </span>
          <span style={s.optionBody}>
            {t.rich("exportWizard.install.prBody", {
              code: (chunks) => (
                <span className="mono" style={s.mono}>
                  {chunks}
                </span>
              ),
              repo: repoName,
              count: fileCount ?? "…",
            })}
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={action === "zip"}
          onClick={() => onAction("zip")}
          style={s.option(action === "zip")}
        >
          <span style={s.optionHead}>
            <Icon.Copy size={16} style={s.optionIcon} />
            <span style={s.optionTitle}>{t("exportWizard.install.zipTitle")}</span>
            <span style={s.muted}>{t("exportWizard.install.zipHint")}</span>
          </span>
        </button>
      </div>

      <DocsHelpLink />

      {error && (
        <div role="alert" style={s.alert("crit")}>
          {error}
        </div>
      )}

      {outcome && (
        <div role="status" style={s.success}>
          <span>
            {outcome.kind === "zip"
              ? t("exportWizard.install.successZip", { fileName: outcome.fileName })
              : t("exportWizard.install.successPr")}
          </span>
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
              {t("exportWizard.install.viewPr")}
            </a>
          )}
        </div>
      )}
    </>
  );
}
