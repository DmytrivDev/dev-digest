/** Pure rules for the agent Context tab — no React. */

import type { ContextAttachment } from "@devdigest/shared";

/**
 * AC-42: the "≈ N tokens" a run of this agent would inject — `approx_tokens`
 * summed over the DISTINCT paths of the attached and inherited documents.
 * A missing document is left out (a run skips it), and so is one whose
 * `approx_tokens` is null (a run could not read it either).
 */
export function agentTokenEstimate(
  attached: readonly ContextAttachment[],
  inherited: readonly ContextAttachment[],
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const doc of [...attached, ...inherited]) {
    if (seen.has(doc.path)) continue;
    seen.add(doc.path);
    if (doc.present && doc.approx_tokens != null) total += doc.approx_tokens;
  }
  return total;
}
