/** Pure rules for the skill Context tab — no React. */

import type { ContextAttachment } from "@devdigest/shared";

/**
 * AC-43: the "≈ N tokens" of a skill's attached documents. A missing document
 * is left out (a run skips it), and so is one whose `approx_tokens` is null
 * (a run could not read it either).
 */
export function skillTokenEstimate(attached: readonly ContextAttachment[]): number {
  return attached.reduce(
    (sum, doc) => (doc.present && doc.approx_tokens != null ? sum + doc.approx_tokens : sum),
    0,
  );
}

/**
 * AC-45: how the attached documents are laid into the prompt — the
 * `## Project context` heading, then per document its `### <path>` line and an
 * elided untrusted block for the body. The real delimiter carries a label and
 * the document's full text; the placeholder only shows the shape. Returns ""
 * when nothing is attached, because a run injects no section then.
 */
export function serializePreview(paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const blocks = paths.map((path) => `### ${path}\n<untrusted …>…</untrusted>`);
  return `## Project context\n${blocks.join("\n\n")}`;
}
