/* ContextDocPicker — attach, detach, reorder and preview a repository's markdown
   documents. Shared by the agent and skill Context tabs.

   Order is the order the documents appear in the prompt, so attached rows come
   first in attachment order and move by dragging the handle. The handle is also
   a button: HTML5 drag-and-drop is pointer-only, so ↑/↓ on a focused handle does
   the same move (the pattern of the agent's SkillsTab).

   The list is DERIVED from the props — the saved attachments — never copied
   into state, so a failed save leaves the last saved set on screen. Only the
   drag in flight is state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type {
  ContextAttachment,
  ContextDoc,
  InheritedContextAttachment,
} from "@devdigest/shared";
import { DocPreviewModal } from "./_components/DocPreviewModal";
import { buildRows, dropAttachment, filterRows, moveAttachment, toggleAttachment } from "./helpers";
import { s } from "./styles";

/** The drag in flight: what is being moved, and what it is hovering over. */
interface Drag {
  path: string;
  overPath: string | null;
}

export function ContextDocPicker({
  repoId,
  docs,
  attached,
  inherited = [],
  onSave,
  saveError,
  header,
}: {
  /** The active repository; null shows the "select a repository" message (AC-26). */
  repoId: string | null;
  docs: readonly ContextDoc[];
  /** Saved attachments, in attachment order. */
  attached: readonly ContextAttachment[];
  /** Documents reached through enabled linked skills; shown read-only. */
  inherited?: readonly InheritedContextAttachment[];
  /** Called once per change with the COMPLETE ordered list of attached paths (AC-31). */
  onSave: (paths: string[]) => void;
  saveError?: string | null;
  /** Tab-specific heading, counts and notes, rendered above the filter. */
  header?: React.ReactNode;
}) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (repoId === null) {
    return <p style={s.message}>{t("picker.noRepo")}</p>;
  }

  const saved = attached.map((a) => a.path);
  // What the list looks like if the drag were dropped right now. Derived during
  // render, never stored — storing it would be a second source of truth.
  const live =
    drag?.overPath != null && drag.overPath !== drag.path
      ? dropAttachment(saved, drag.path, drag.overPath)
      : saved;
  const byPath = new Map(attached.map((a) => [a.path, a]));
  const liveAttached = live.map((p) => byPath.get(p)!);

  const rows = buildRows(docs, liveAttached, inherited);
  const visible = filterRows(rows, filter);

  const drop = () => {
    if (drag?.overPath != null) onSave(live);
    setDrag(null);
  };

  return (
    <div style={s.wrap}>
      {header}
      {saveError && (
        <div role="alert" style={s.error}>
          {saveError}
        </div>
      )}
      <div style={s.filter}>
        <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={t("picker.filterLabel")}
          placeholder={t("picker.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>

      {rows.length === 0 ? (
        <p style={s.message}>{t("picker.noDocs")}</p>
      ) : visible.length === 0 ? (
        <p style={s.message}>{t("picker.noMatches", { query: filter })}</p>
      ) : (
        <div style={s.list}>
          {visible.map((row) => {
            const isAttached = row.kind === "attached";
            return (
              <div
                key={row.path}
                // Only an attached row has a position to move; dropping onto
                // any other row is a no-op (`dropAttachment` ignores it).
                draggable={isAttached}
                onDragStart={(e) => {
                  if (!isAttached) return;
                  // Firefox refuses to start a drag unless some data is set,
                  // and jsdom has no dataTransfer at all — hence the guard.
                  e.dataTransfer?.setData("text/plain", row.path);
                  setDrag({ path: row.path, overPath: null });
                }}
                onDragOver={(e) => {
                  if (!drag || !isAttached || drag.path === row.path) return;
                  // Without preventDefault the browser treats the row as an
                  // invalid drop target and never fires onDrop.
                  e.preventDefault();
                  setDrag((d) => (d && d.overPath !== row.path ? { ...d, overPath: row.path } : d));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop();
                }}
                onDragEnd={() => setDrag(null)}
                style={s.row(isAttached, drag?.path === row.path)}
              >
                {isAttached ? (
                  <button
                    type="button"
                    aria-label={t("picker.dragHandle", { name: row.name })}
                    title={t("picker.dragHandle", { name: row.name })}
                    onKeyDown={(e) => {
                      const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                      if (delta === 0) return;
                      // The arrows would otherwise scroll the panel out from
                      // under the handle the user is holding focus on.
                      e.preventDefault();
                      const next = moveAttachment(live, row.path, delta as -1 | 1);
                      if (next.join("\n") !== live.join("\n")) onSave(next);
                    }}
                    style={s.grip}
                  >
                    <Icon.Menu size={14} />
                  </button>
                ) : (
                  <span style={s.gripSpacer} />
                )}
                {row.kind === "inherited" ? (
                  <span className="mono" style={s.name}>
                    {row.name}
                  </span>
                ) : (
                  <Checkbox
                    checked={isAttached}
                    onChange={() => onSave(toggleAttachment(live, row.path))}
                    label={
                      <span className="mono" style={s.name}>
                        {row.name}
                      </span>
                    }
                  />
                )}
                <span className="mono" style={s.folder} title={row.path}>
                  {row.folder}
                </span>
                {row.kind === "inherited" && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                    {t("picker.via", { skill: row.skillName ?? "" })}
                  </Badge>
                )}
                {!row.present && <Badge color="var(--warn)" bg="var(--warn-bg)">{t("picker.missing")}</Badge>}
                <span style={s.categoryChip}>{t(`picker.category.${row.category}`)}</span>
                <button
                  type="button"
                  aria-label={t("picker.previewTitle", { path: row.path })}
                  onClick={() => setPreviewPath(row.path)}
                  style={s.previewBtn}
                >
                  {t("picker.preview")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {previewPath !== null && (
        <DocPreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
