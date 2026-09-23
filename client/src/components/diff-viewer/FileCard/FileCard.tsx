/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  lineKey,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import {
  partitionAnnotations,
  normalizeAnnotationPath,
  type DiffAnnotation,
  type DiffAnnotationApi,
} from "../annotations";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnanchoredAnnotations } from "../UnanchoredAnnotations";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Annotations anchored to a given parsed line (RIGHT=new). */
function annotationsForLine(ln: Line, matched: Map<string, DiffAnnotation[]>): DiffAnnotation[] {
  const key = lineKey("RIGHT", ln.newNo);
  if (matched.size === 0 || !key) return [];
  return matched.get(key) ?? [];
}

export function FileCard({
  file,
  commenting,
  annotations,
  marks,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Generic line annotations (e.g. review findings) — stays finding-agnostic. */
  annotations?: DiffAnnotationApi;
  /** Files to mark with a small dot next to the path (e.g. "has findings"). */
  marks?: { paths: ReadonlySet<string>; label: string };
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same partition shape as comment threads, but for caller-built annotations.
  // Nothing renders when the caller hides them (`annotations.visible`), same
  // as comments' `showComments`. Paths are normalized on both sides before
  // comparing — a finding's raw path and this file's PR path can otherwise
  // differ by a leading `./` or separator style and silently fail to match.
  const filePathNormalized = normalizeAnnotationPath(file.path);
  const items = React.useMemo(
    () =>
      annotations?.visible
        ? annotations.items.filter(
            (a) => normalizeAnnotationPath(a.path) === filePathNormalized,
          )
        : [],
    [annotations, filePathNormalized],
  );
  const { matched: matchedAnnotations, unanchored: unanchoredAnnotations } = React.useMemo(() => {
    if (items.length === 0)
      return { matched: new Map<string, DiffAnnotation[]>(), unanchored: [] as DiffAnnotation[] };
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionAnnotations(items, renderedKeys);
  }, [items, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;
  const hasMark = marks?.paths.has(file.path) ?? false;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {hasMark && marks && (
          <span aria-label={marks.label} title={marks.label} style={s.markDot} />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                annotations={annotationsForLine(ln, matchedAnnotations)}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {annotations?.visible && <UnanchoredAnnotations items={unanchoredAnnotations} />}
        </div>
      )}
    </div>
  );
}
