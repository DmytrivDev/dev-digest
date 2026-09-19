/* Finding presentation rules shared across routes.
 *
 * `lineLabel` lived in two places — the PR-detail FindingCard and the PR-list
 * FindingsTooltip — as byte-identical copies. A second consumer is the point at
 * which a helper earns a shared home, so it moved here rather than being copied
 * a third time.
 */
import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
