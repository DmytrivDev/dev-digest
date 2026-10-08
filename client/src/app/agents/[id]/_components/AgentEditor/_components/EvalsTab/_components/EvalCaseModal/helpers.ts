/* Pure rules of the Eval Case modal. Type-only imports from @devdigest/shared. */

import type { EvalCase, EvalCaseUpdate, EvalExpectation } from "@devdigest/shared";

export type DiffLineKind = "added" | "removed" | "hunk" | "context";

/**
 * How a unified-diff line is coloured (AC-38). `+++` / `---` file headers are
 * not additions or removals, as in the mock (screen_cizruns.jsx:75).
 */
export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "added";
  if (line.startsWith("-") && !line.startsWith("---")) return "removed";
  return "context";
}

export function sameExpectation(a: EvalExpectation, b: EvalExpectation): boolean {
  return (
    a.kind === b.kind &&
    a.file === b.file &&
    a.start_line === b.start_line &&
    a.end_line === b.end_line
  );
}

/**
 * The PATCH body: only the fields that differ from the stored case. Empty notes
 * are sent as `null` (the column is nullable). Returns `null` when nothing changed.
 */
export function buildPatch(
  evalCase: EvalCase,
  draft: { name: string; notes: string; expectation: EvalExpectation },
): EvalCaseUpdate | null {
  const patch: EvalCaseUpdate = {};
  const name = draft.name.trim();
  if (name !== evalCase.name) patch.name = name;
  if (draft.notes !== (evalCase.notes ?? "")) patch.notes = draft.notes === "" ? null : draft.notes;
  if (!sameExpectation(draft.expectation, evalCase.expectation)) patch.expectation = draft.expectation;
  return Object.keys(patch).length === 0 ? null : patch;
}
