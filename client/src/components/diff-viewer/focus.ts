/* Deep-link focus for the DiffViewer: which file (and optionally which new-side
   line) the reader was sent to. Pure helpers — FileCard owns the DOM effects. */
import { normalizeAnnotationPath } from "./annotations";
import type { Line } from "./helpers";

/** A file (and optionally a NEW-side line number) to bring into view. */
export interface DiffFocus {
  path: string;
  line: number | null;
}

/** True when `file` is the focused file. Paths compare normalised, so a `./`
    prefix or backslash separators on either side still match. */
export function isFocusedFile(file: { path: string }, focus: DiffFocus | null | undefined): boolean {
  if (!focus) return false;
  return normalizeAnnotationPath(file.path) === normalizeAnnotationPath(focus.path);
}

/** Index of the parsed line sitting on NEW-side line `line` (added or unchanged
    — a deleted row has no new-side number), or -1 when it is not rendered. */
export function focusRowIndex(lines: Line[], line: number | null | undefined): number {
  if (line == null) return -1;
  return lines.findIndex((ln) => ln.kind !== "del" && ln.kind !== "hunk" && ln.newNo === line);
}
