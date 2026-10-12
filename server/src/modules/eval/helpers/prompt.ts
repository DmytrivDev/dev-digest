import type { EvalCaseInputMeta } from '@devdigest/shared';
import { reviewPrDescription, reviewTaskLine } from '@devdigest/reviewer-core';

/**
 * The trusted task line of an eval-case review (SPEC-04, AC-48; SPEC-05, AC-45).
 *
 * The wording is reviewer-core's `reviewTaskLine` — the same one a studio review and a
 * CI run use — so a case reviews exactly like a PR. The title is deliberately NOT in this
 * line: the line is trusted text the engine does not wrap, and a PR title is
 * author-controlled (NFR-5). It travels in {@link evalPrDescription}. A manual case has no
 * PR number, so its line says "Review this change" in fixed words: nothing a user typed —
 * not the name, notes, title or diff — can reach this slot (AC-45).
 */
export function evalTaskLine(meta: Pick<EvalCaseInputMeta, 'pr_number'>): string {
  return reviewTaskLine(meta.pr_number);
}

/**
 * The PR description handed to the engine, which wraps it as untrusted. The frozen title
 * leads it, so the model still sees what the PR claims to be without that text ever
 * reaching the trusted task line. `undefined` when there is neither a title nor a body —
 * a manual case may have none (AC-47) — so the engine omits the section; a finding-born
 * case always has a title, so its description is unchanged.
 */
export function evalPrDescription(
  meta: Pick<EvalCaseInputMeta, 'title' | 'body'>,
): string | undefined {
  return reviewPrDescription(meta.title, meta.body);
}
