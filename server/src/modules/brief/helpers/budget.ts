import {
  DESCRIPTION_MAX_CHARS,
  DESCRIPTION_PRECAP_BYTES,
  INPUT_SOURCES,
  ISSUE_BODY_MAX_CHARS,
  ISSUE_BODY_PRECAP_BYTES,
  ISSUE_TITLE_MAX_BYTES,
  ITEM_MAX_BYTES,
  MAX_BLAST_CALLERS,
  MAX_FILE_ROWS,
  REASON,
  SPEC_DOC_MAX_BYTES,
  SPEC_TOTAL_MAX_BYTES,
  TEXT_PRECAP_BYTES,
  TITLE_MAX_BYTES,
} from '../constants.js';
import type {
  BriefFacts,
  BudgetCut,
  FileStat,
  InputRecord,
  RenderedPrompt,
  SpecDoc,
  TextLimits,
} from '../types.js';
import { clipBytes, utf8Length } from './bounds.js';
import { churn } from './diff-stats.js';
import { blastText, clip, intentText } from './prompt.js';

/**
 * Token budget for the brief prompt (AC-61 … AC-63) — pure, ring 1.
 *
 * The token counter is INJECTED (precedent `intent/helpers.ts:304`); this file never imports
 * `adapters/tokenizer`. The prompt is cut in six tiers, strictly in order: a later tier is
 * touched only when every earlier one is exhausted and the prompt still does not fit. It never
 * throws for size.
 *
 * Cost (F9): the inputs are attacker-controlled and tokenizing is not cheap on hostile text,
 * so (1) every free text is capped in characters BEFORE the first count (the pre-cap), (2) a
 * row-by-row tier is a binary search, not a count per row, and (3) a text is tokenized once.
 */

export interface FitBudgetInput {
  facts: BriefFacts;
  /** Builds the prompt from the facts (`renderBriefPrompt` bound to the system prompt). */
  render: (facts: BriefFacts) => RenderedPrompt;
  countTokens: (text: string) => number;
  budget: number;
}

export interface FitBudgetResult {
  /** A cut COPY of the input facts. */
  facts: BriefFacts;
  prompt: RenderedPrompt;
  tokens: number;
  /** What was cut, one entry per source, in `inputs` order (AC-63). */
  cuts: BudgetCut[];
}

/**
 * The order rows are cut in: lowest `key` first, a tie → the LATER row first (AC-62 tiers 4
 * and 5). The keys do not change while rows are cut, so repeatedly taking the lowest one is one
 * stable sort — O(n log n), however many rows there are (O2). Returns indexes into `items`.
 * Computed once, without counting a single token.
 */
export function removalOrder<T>(items: readonly T[], key: (item: T) => number): number[] {
  return items
    .map((item, index) => ({ key: key(item), index }))
    .sort((x, y) => x.key - y.key || y.index - x.index)
    .map((x) => x.index);
}

/**
 * The smallest `k` in [1, n] for which `fits()` holds after `apply(k)`; `n` when none does.
 * The caller has checked that `k = 0` does not fit. Removing more never makes the prompt
 * longer, so a binary search finds what a one-by-one loop would — in log n counts instead of
 * n, each a full tokenization (F9). Leaves the state at the answer.
 */
function smallestFitting(n: number, apply: (k: number) => void, fits: () => boolean): number {
  apply(n);
  if (!fits()) return n;
  let lo = 1;
  let hi = n;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    apply(mid);
    if (fits()) hi = mid;
    else lo = mid + 1;
  }
  apply(lo);
  return lo;
}

export function fitBudget({ facts, render, countTokens, budget }: FitBudgetInput): FitBudgetResult {
  const work: BriefFacts = structuredClone(facts);
  const cuts = new Map<BudgetCut['source'], BudgetCut>();
  const cut = (c: Omit<BudgetCut, 'reason'>): void => {
    cuts.set(c.source, { ...c, reason: REASON.overBudget });
  };

  // A text is tokenized once, whoever asks: the system prompt and any prompt seen before.
  const counted = new Map<string, number>();
  const count = (text: string): number => {
    let n = counted.get(text);
    if (n === undefined) {
      n = countTokens(text);
      counted.set(text, n);
    }
    return n;
  };
  const measure = (): number => {
    const p = render(work);
    return count(p.system) + count(p.user);
  };
  const fits = (): boolean => measure() <= budget;

  // ---- Pre-cap (F9): every free text is bounded in BYTES before the first count. ----
  // The title and the intent / blast text are bounded through `textLimits`, which the render
  // already applies (in characters, so the limit is the length of the byte-clipped text). A
  // pre-cap that shortens an input is recorded like any other cut (AC-63).
  const preLimit = (key: keyof TextLimits, text: string, maxBytes: number): boolean => {
    const kept = clipBytes(text, maxBytes);
    if (kept.length === text.length) return false;
    work.textLimits[key] = Math.min(work.textLimits[key] ?? kept.length, kept.length);
    return true;
  };
  if (preLimit('title', work.title, TITLE_MAX_BYTES)) {
    cut({ source: 'description', status: 'truncated' });
  }
  if (work.description) {
    const kept = clipBytes(work.description, DESCRIPTION_PRECAP_BYTES);
    if (kept.length < work.description.length) {
      work.description = kept;
      cut({ source: 'description', status: 'truncated' });
    }
  }
  if (work.linkedIssue) {
    const issue = work.linkedIssue;
    const title = clipBytes(issue.title, ISSUE_TITLE_MAX_BYTES);
    const body = clipBytes(issue.body, ISSUE_BODY_PRECAP_BYTES);
    if (title.length < issue.title.length || body.length < issue.body.length) {
      issue.title = title;
      issue.body = body;
      cut({ source: 'linked_issue', status: 'truncated' });
    }
  }
  if (work.intent && preLimit('intent', intentText(work.intent), TEXT_PRECAP_BYTES)) {
    cut({ source: 'intent', status: 'truncated' });
  }
  if (work.blast) {
    let blastCut = preLimit('blast', blastText(work.blast), TEXT_PRECAP_BYTES);
    const item = (text: string): string => {
      const kept = clipBytes(text, ITEM_MAX_BYTES);
      if (kept.length < text.length) blastCut = true;
      return kept;
    };
    for (const c of work.blast.callers) {
      c.file = item(c.file);
      c.symbol = item(c.symbol);
    }
    // More callers than could ever fit go first, lowest rank first — the order tier 4 uses.
    const callers = work.blast.callers;
    if (callers.length > MAX_BLAST_CALLERS) {
      const gone = new Set(removalOrder(callers, (c) => c.rank).slice(0, callers.length - MAX_BLAST_CALLERS));
      work.blast.callers = callers.filter((_, i) => !gone.has(i));
      blastCut = true;
    }
    if (blastCut) cut({ source: 'blast', status: 'truncated' });
  }
  // File rows: a path is bounded, and rows beyond what could ever fit go first, lowest churn
  // first — the order tier 5 would cut them in.
  let filesCut = false;
  for (const f of work.files) {
    const kept = clipBytes(f.path, ITEM_MAX_BYTES);
    if (kept.length < f.path.length) {
      f.path = kept;
      filesCut = true;
    }
  }
  let preOmitted = 0;
  if (work.files.length > MAX_FILE_ROWS) {
    const all = work.files;
    const gone = new Set(removalOrder(all, churn).slice(0, all.length - MAX_FILE_ROWS));
    work.files = all.filter((_, i) => !gone.has(i));
    preOmitted = gone.size;
    filesCut = true;
  }
  if (filesCut) {
    cut({ source: 'diff_stats', status: 'truncated', ...(preOmitted > 0 ? { omitted: preOmitted } : {}) });
  }
  if (work.specs.length > 0) {
    let specCut = false;
    let total = 0;
    const kept: SpecDoc[] = [];
    for (const doc of work.specs) {
      if (total >= SPEC_TOTAL_MAX_BYTES) {
        specCut = true; // later documents go first — what tier 1 would do
        continue;
      }
      const content = clipBytes(doc.content, SPEC_DOC_MAX_BYTES);
      if (content.length < doc.content.length) specCut = true;
      total += utf8Length(content);
      kept.push({ path: clipBytes(doc.path, ITEM_MAX_BYTES), content });
    }
    work.specs = kept;
    if (specCut) cut({ source: 'specs', status: 'truncated' });
  }

  // Tier 1 — specs: drop whole documents, last first.
  if (work.specs.length > 0 && !fits()) {
    const all = work.specs;
    const n = all.length;
    smallestFitting(
      n,
      (k) => {
        work.specs = all.slice(0, n - k);
        if (k === n) work.unavailable.specs = REASON.overBudget;
        else delete work.unavailable.specs;
      },
      fits,
    );
    cut({ source: 'specs', status: work.specs.length === 0 ? 'missing' : 'truncated' });
  }

  // Tier 2 — linked issue: truncate the body, then drop the issue.
  if (work.linkedIssue && !fits()) {
    let bodyCut = false;
    if (work.linkedIssue.body.length > ISSUE_BODY_MAX_CHARS) {
      work.linkedIssue.body = clip(work.linkedIssue.body, ISSUE_BODY_MAX_CHARS);
      bodyCut = true;
    }
    if (bodyCut && fits()) {
      cut({ source: 'linked_issue', status: 'truncated' });
    } else {
      work.linkedIssue = null;
      work.unavailable.linked_issue = REASON.overBudget;
      cut({ source: 'linked_issue', status: 'missing' });
    }
  }

  // Tier 3 — PR description: truncate.
  if (work.description && work.description.length > DESCRIPTION_MAX_CHARS && !fits()) {
    work.description = clip(work.description, DESCRIPTION_MAX_CHARS);
    cut({ source: 'description', status: 'truncated' });
  }

  // Tier 4 — blast callers: remove, lowest rank first.
  if (work.blast && work.blast.callers.length > 0 && !fits()) {
    const blast = work.blast;
    const all = blast.callers;
    const order = removalOrder(all, (c) => c.rank);
    smallestFitting(
      all.length,
      (k) => {
        const gone = new Set(order.slice(0, k));
        blast.callers = all.filter((_, i) => !gone.has(i));
      },
      fits,
    );
    cut({ source: 'blast', status: 'truncated' });
  }

  // Tier 5 — file rows: remove, lowest churn first, down to zero.
  if (work.files.length > 0 && !fits()) {
    const all = work.files;
    const order = removalOrder(all, churn);
    const removed = smallestFitting(
      all.length,
      (k) => {
        const gone = new Set(order.slice(0, k));
        work.files = all.filter((_, i) => !gone.has(i));
      },
      fits,
    );
    cut({ source: 'diff_stats', status: 'truncated', omitted: preOmitted + removed });
  }

  // Tier 6 — text: the blast block's text, then the intent text, then the PR title.
  const shrink = (key: keyof TextLimits, fullLength: number): void => {
    if (fullLength === 0) return;
    // A pre-cap already bounds the text: the search starts from what is left of it.
    const length = Math.min(fullLength, work.textLimits[key] ?? fullLength);
    work.textLimits[key] = 0;
    if (!fits()) return; // even empty it does not fit — keep 0 and go on to the next text
    // Invariant: `lo` fits. Find the largest limit that still fits.
    let lo = 0;
    let hi = length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      work.textLimits[key] = mid;
      if (fits()) lo = mid;
      else hi = mid - 1;
    }
    work.textLimits[key] = lo;
  };

  if (!fits() && work.blast) {
    shrink('blast', blastText(work.blast).length);
    cut({ source: 'blast', status: 'truncated' });
  }
  if (!fits() && work.intent) {
    shrink('intent', intentText(work.intent).length);
    cut({ source: 'intent', status: 'truncated' });
  }
  if (!fits() && work.title.length > 0) {
    shrink('title', work.title.length);
    // The title is part of the `description` input (AC-63).
    cut({ source: 'description', status: 'truncated' });
  }

  const prompt = render(work);
  const ordered = INPUT_SOURCES.flatMap((s) => (cuts.has(s) ? [cuts.get(s)!] : []));
  return {
    facts: work,
    prompt,
    tokens: count(prompt.system) + count(prompt.user),
    cuts: ordered,
  };
}

/**
 * Lay the budget's cuts over the `inputs` entries (AC-63). A cut replaces the entry whole, so
 * `over_budget` wins over an earlier `file_list_truncated` on `diff_stats` (Spec follow-up 2).
 */
export function applyCuts(
  inputs: ReadonlyArray<InputRecord>,
  cuts: ReadonlyArray<BudgetCut>,
): InputRecord[] {
  const bySource = new Map(cuts.map((c) => [c.source, c]));
  return inputs.map((i) => {
    const c = bySource.get(i.source);
    if (!c) return i;
    return {
      source: c.source,
      status: c.status,
      reason: c.reason,
      ...(c.omitted !== undefined ? { omitted: c.omitted } : {}),
    };
  });
}
