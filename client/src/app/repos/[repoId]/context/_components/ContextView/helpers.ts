/** Pure helpers for ContextView — no React, so they test without a renderer. */

import type { ContextDoc } from "@devdigest/shared";

/** AC-11: documents whose path contains the typed text, case-insensitive. */
export function filterDocsByPath(docs: ContextDoc[], query: string): ContextDoc[] {
  if (query === "") return docs;
  const needle = query.toLowerCase();
  return docs.filter((d) => d.path.toLowerCase().includes(needle));
}

/**
 * AC-12: which document the preview shows. The user's pick stands for as long as
 * that document is still in the list (it may be filtered out of view and stay
 * selected); otherwise — first load, or a Refresh that dropped it — the first
 * VISIBLE document, so selection is derived and never needs an effect.
 */
export function resolveSelection(
  docs: ContextDoc[],
  visible: ContextDoc[],
  picked: string | null,
): string | null {
  if (picked !== null && docs.some((d) => d.path === picked)) return picked;
  return visible[0]?.path ?? null;
}

/** `a/b c` → `a/b%20c`: every `/`-separated segment percent-encoded on its own. */
function encodeSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

/**
 * AC-15: the document on GitHub. Built only from the stored owner/name, the
 * clone's branch and the listed path — each segment encoded, so a path cannot
 * smuggle `?`, `#` or `..` into the URL.
 */
export function githubBlobUrl(owner: string, name: string, branch: string, path: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${encodeSegments(branch)}/${encodeSegments(path)}`;
}
