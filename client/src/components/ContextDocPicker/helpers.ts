/** Pure row building and list operations for ContextDocPicker — no React. */

import type {
  ContextAttachment,
  ContextDoc,
  ContextDocCategory,
  InheritedContextAttachment,
} from "@devdigest/shared";
import { reorderIds } from "@/lib/reorder";

/** `kind` decides what a row can do: attached rows reorder, inherited ones are read-only. */
export type RowKind = "attached" | "inherited" | "available";

export interface PickerRow {
  path: string;
  name: string;
  /** Directory part with a trailing `/`, or `""` at the repository root (AC-27). */
  folder: string;
  category: ContextDocCategory;
  kind: RowKind;
  /** False only for an attached/inherited document the clone no longer holds (AC-35). */
  present: boolean;
  /** The skill an inherited row comes from. */
  skillName?: string;
}

/** `specs/public-api.md` → `{ name: "public-api.md", folder: "specs/" }`. */
export function rowLabel(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i === -1 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i + 1) };
}

/**
 * Client twin of the server's AC-4 rule, for rows that are not in the listed
 * documents (an attachment beyond the first 500, or a missing file) and so carry
 * no `category` from the list. Keep it in step with `categoryOf` in
 * `server/src/modules/project-context/helpers.ts`.
 */
export function categoryForPath(path: string): ContextDocCategory {
  const segments = path.split("/");
  const file = segments[segments.length - 1] ?? "";
  const dirs = segments.slice(0, -1);
  if (dirs.includes("specs")) return "specs";
  if (file.toLowerCase() === "insights.md" || dirs.includes("insights")) return "insights";
  return "docs";
}

/**
 * AC-25 (+ A-8): attached rows first, in attachment order — including paths the
 * list does not hold (EC-19) and ones marked missing — then the read-only
 * inherited rows, then every other listed document in the list's order.
 * A path appears once: attached wins over inherited, and neither is repeated
 * among the unattached.
 */
export function buildRows(
  docs: readonly ContextDoc[],
  attached: readonly ContextAttachment[],
  inherited: readonly InheritedContextAttachment[] = [],
): PickerRow[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const categoryOf = (path: string) => byPath.get(path)?.category ?? categoryForPath(path);

  const rows: PickerRow[] = [];
  const seen = new Set<string>();

  for (const a of attached) {
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    rows.push({ path: a.path, ...rowLabel(a.path), category: categoryOf(a.path), kind: "attached", present: a.present });
  }
  for (const i of inherited) {
    if (seen.has(i.path)) continue;
    seen.add(i.path);
    rows.push({
      path: i.path,
      ...rowLabel(i.path),
      category: categoryOf(i.path),
      kind: "inherited",
      present: i.present,
      skillName: i.skill_name,
    });
  }
  for (const d of docs) {
    if (seen.has(d.path)) continue;
    seen.add(d.path);
    rows.push({ path: d.path, ...rowLabel(d.path), category: d.category, kind: "available", present: true });
  }
  return rows;
}

/** AC-34: rows whose path contains the typed text, case-insensitive. */
export function filterRows(rows: readonly PickerRow[], query: string): PickerRow[] {
  if (query === "") return [...rows];
  const needle = query.toLowerCase();
  return rows.filter((r) => r.path.toLowerCase().includes(needle));
}

/** AC-28 / AC-29: tick appends to the end, untick removes (a missing row too). */
export function toggleAttachment(paths: readonly string[], path: string): string[] {
  return paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path];
}

/**
 * Move an attached path one place towards the front (-1) or the back (+1).
 * Returns the same contents when the move would fall off either end, so the
 * caller can compare and skip a pointless save.
 */
export function moveAttachment(paths: readonly string[], path: string, delta: -1 | 1): string[] {
  const from = paths.indexOf(path);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= paths.length) return [...paths];
  const next = [...paths];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Drag-onto-row reorder; a drop on an unattached row or on itself is a no-op. */
export function dropAttachment(paths: readonly string[], fromPath: string, toPath: string): string[] {
  return reorderIds(paths, fromPath, toPath);
}
