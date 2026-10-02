/* DocPreviewPane — header (path, "Used by N agents", "Open on GitHub") over the
   rendered document. The text is somebody else's, so it goes through
   <Markdown untrusted>: no raw HTML, no <img> that would call a remote host. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown } from "@devdigest/ui";
import { useContextDoc } from "@/lib/hooks/core";
import { githubBlobUrl } from "../../helpers";
import { s } from "./styles";

export function DocPreviewPane({
  repoId,
  repo,
  branch,
  path,
}: {
  repoId: string;
  /** Owner/name of the repository, for the GitHub link; null until it is known. */
  repo: { owner: string; name: string } | null;
  /** The branch the clone has checked out (from the list response). */
  branch: string;
  /** null when nothing is selected (an empty filter result). */
  path: string | null;
}) {
  const t = useTranslations("context");
  const doc = useContextDoc(repoId, path);

  if (path === null) {
    return <div style={s.body}>{t("preview.placeholder")}</div>;
  }

  return (
    <>
      <div style={s.header}>
        <span className="mono" style={s.path}>
          {path}
        </span>
        <div style={s.meta}>
          {doc.data && (
            <span style={s.usedBy}>
              <Icon.Cpu size={13} />
              {t("usedBy", { count: doc.data.used_by_agents })}
            </span>
          )}
          {repo && (
            <a
              href={githubBlobUrl(repo.owner, repo.name, branch, path)}
              target="_blank"
              rel="noopener noreferrer"
              style={s.link}
            >
              {t("openOnGithub")}
              <Icon.ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
      <div style={s.body}>
        <div style={s.bodyInner}>
          {doc.isLoading ? (
            <span style={s.muted}>{t("preview.loading")}</span>
          ) : doc.isError ? (
            <span role="alert" style={s.error}>
              {doc.error instanceof Error && doc.error.message
                ? doc.error.message
                : t("preview.loadError")}
            </span>
          ) : (
            <Markdown untrusted>{doc.data?.content}</Markdown>
          )}
        </div>
      </div>
    </>
  );
}
