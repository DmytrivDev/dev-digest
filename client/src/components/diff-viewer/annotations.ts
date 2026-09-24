/* Generic line-annotation support for the DiffViewer. Pure helpers only —
   this file stays finding-agnostic; the caller (DiffTab) decides what an
   annotation MEANS and builds its `content`. */
import type { ReactNode } from "react";
import type { IconName } from "@devdigest/ui";
import { lineKey } from "./comments";

/** One caller-built annotation on a RIGHT-side (new-file) diff line. */
export interface DiffAnnotation {
  id: string;
  path: string;
  /** RIGHT side / new-file line number. */
  line: number;
  color: string;
  icon: IconName;
  label: string;
  content: ReactNode;
}

export interface DiffAnnotationApi {
  items: DiffAnnotation[];
  visible: boolean;
}

/**
 * Split annotations into those that anchor to a rendered line (keyed the same
 * way `FileCard` keys comment threads, via `keysForLine`/`lineKey`) and those
 * that don't — a LEFT-only (deleted) line never matches, because an
 * annotation only ever carries a RIGHT-side line number. Preserves input
 * order in both buckets.
 */
export function partitionAnnotations(
  items: DiffAnnotation[],
  renderedKeys: Set<string>,
): { matched: Map<string, DiffAnnotation[]>; unanchored: DiffAnnotation[] } {
  const matched = new Map<string, DiffAnnotation[]>();
  const unanchored: DiffAnnotation[] = [];
  for (const item of items) {
    const key = lineKey("RIGHT", item.line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(item);
      matched.set(key, list);
    } else {
      unanchored.push(item);
    }
  }
  return { matched, unanchored };
}

/**
 * Mirrors the server's path normalisation (`smart-diff/helpers.ts:normalizePath`
 * on the API side) so a finding's raw path always matches the PR file path
 * it's meant to annotate — even when one carries a leading `./` or backslash
 * separators the other doesn't. Without this, the dot/counter (server-side,
 * already normalized for `finding_lines`) and the inline card (client-side,
 * plain string equality) can silently disagree about which file a finding
 * belongs to.
 */
export function normalizeAnnotationPath(path: string): string {
  let p = path.replace(/\\/g, "/");
  while (p.startsWith("./") || p.startsWith("/")) {
    p = p.startsWith("./") ? p.slice(2) : p.slice(1);
  }
  return p;
}
