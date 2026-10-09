/* Pure rules of the Eval Case modal. Imports from @devdigest/shared: types, plus the one
   size constant that governs the contract and this modal alike. */

import { EVAL_CASE_NAME_MAX } from "@devdigest/shared";
import type { EvalCase, EvalCaseCreate, EvalCaseUpdate, EvalExpectation } from "@devdigest/shared";

/** Hard cap on a case name — the contract's `EVAL_CASE_NAME_MAX`, shared with the Save gate (AC-13). */
export const NAME_MAX = EVAL_CASE_NAME_MAX;

/** True for a name Save may send: non-empty once trimmed and within the cap. */
export function nameIsValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed !== "" && trimmed.length <= NAME_MAX;
}

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

/** The editable input of a manual case, as typed (diff text + the two PR fields). */
export interface ManualInput {
  diff: string;
  title: string;
  body: string;
}

/**
 * The PATCH body: only the fields that differ from the stored case. Empty notes
 * are sent as `null` (the column is nullable). Returns `null` when nothing changed.
 *
 * `input` is passed for a MANUAL case only: `input_diff` goes out when the diff
 * text changed, and `input_meta` — title and body together — when either PR
 * field changed (AC-34). A finding-born case never sends either.
 */
export function buildPatch(
  evalCase: EvalCase,
  draft: { name: string; notes: string; expectation: EvalExpectation; input?: ManualInput },
): EvalCaseUpdate | null {
  const patch: EvalCaseUpdate = {};
  const name = draft.name.trim();
  if (name !== evalCase.name) patch.name = name;
  if (draft.notes !== (evalCase.notes ?? "")) patch.notes = draft.notes === "" ? null : draft.notes;
  if (!sameExpectation(draft.expectation, evalCase.expectation)) patch.expectation = draft.expectation;
  const input = draft.input;
  if (input) {
    if (input.diff !== evalCase.input_diff) patch.input_diff = input.diff;
    if (input.title !== evalCase.input_meta.title || input.body !== (evalCase.input_meta.body ?? "")) {
      patch.input_meta = { title: input.title, body: input.body === "" ? null : input.body };
    }
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * The POST body of a new manual case. The name goes out trimmed; empty notes and
 * an empty PR title/body are left out, so the server stores its defaults.
 */
export function buildCreateBody(draft: {
  name: string;
  notes: string;
  expectation: EvalExpectation;
  input: ManualInput;
}): EvalCaseCreate {
  const { input } = draft;
  return {
    name: draft.name.trim(),
    ...(draft.notes === "" ? {} : { notes: draft.notes }),
    input_diff: input.diff,
    ...(input.title === "" && input.body === ""
      ? {}
      : { input_meta: { title: input.title, body: input.body === "" ? null : input.body } }),
    expectation: draft.expectation,
  };
}
