/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffAnnotationApi } from "../annotations";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  annotations,
  marks,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Generic line annotations (e.g. review findings). DiffViewer never learns
      what an annotation MEANS or sorts them — the caller does both. */
  annotations?: DiffAnnotationApi;
  /** Files to mark with a small dot next to the path. */
  marks?: { paths: ReadonlySet<string>; label: string };
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard key={i} file={f} commenting={commenting} annotations={annotations} marks={marks} />
      ))}
    </div>
  );
}
