import { describe, expect, it } from 'vitest';
import { applyCuts, fitBudget } from '../src/modules/brief/helpers/budget.js';
import { renderBriefPrompt } from '../src/modules/brief/helpers/prompt.js';
import {
  DESCRIPTION_MAX_CHARS,
  INPUT_TOKEN_BUDGET,
  ISSUE_BODY_MAX_CHARS,
  MAX_FILE_ROWS,
  MIN_FILE_ROWS,
} from '../src/modules/brief/constants.js';
import type { BriefFacts, FileStat } from '../src/modules/brief/types.js';

/** A deterministic counter: chars / 4 (rounded up). */
const countTokens = (s: string): number => Math.ceil(s.length / 4);
const render = (f: BriefFacts) => renderBriefPrompt('SYS', f);
const tokens = (f: BriefFacts): number => {
  const p = render(f);
  return countTokens(p.system) + countTokens(p.user);
};
const run = (facts: BriefFacts, budget: number) => fitBudget({ facts, render, countTokens, budget });

const row = (i: number, additions: number, deletions = 0): FileStat => ({
  path: `src/f${i}.ts`,
  role: 'core',
  additions,
  deletions,
  ranges: [{ start: 1, end: 3 }],
  hasPatch: true,
});

const base = (over: Partial<BriefFacts> = {}): BriefFacts => ({
  title: 'T',
  description: null,
  linkedIssue: null,
  intent: null,
  blast: null,
  files: [],
  filesTotal: 0,
  specs: [],
  unavailable: {},
  textLimits: {},
  ...over,
});

const callers = (ranks: number[]) =>
  ranks.map((rank, i) => ({ file: `src/c${i}.ts`, symbol: `s${i}`, line: 10 + i, rank }));

describe('fitBudget — nothing to cut', () => {
  it('returns the facts unchanged and no cuts when the prompt fits', () => {
    const facts = base({ description: 'hello', files: [row(1, 2)], filesTotal: 1 });
    const out = run(facts, INPUT_TOKEN_BUDGET);
    expect(out.cuts).toEqual([]);
    expect(out.facts).toEqual(facts);
    expect(out.tokens).toBe(tokens(facts));
  });

  it('does not mutate the facts it was given', () => {
    const facts = base({ files: [row(1, 1), row(2, 9)], filesTotal: 2 });
    const snapshot = structuredClone(facts);
    run(facts, 5);
    expect(facts).toEqual(snapshot);
  });
});

describe('fitBudget — tier 1: specs (AC-62, AC-63)', () => {
  const docs = [1, 2, 3].map((i) => ({ path: `docs/${i}.md`, content: 'x'.repeat(4000) }));

  it('drops documents last-first and stops as soon as the prompt fits', () => {
    const facts = base({
      description: 'd'.repeat(3000),
      blast: { summary: 's', changedSymbols: [], callers: callers([1, 2, 3]) },
      files: [row(1, 5), row(2, 6)],
      filesTotal: 2,
      specs: docs,
    });
    const budget = tokens({ ...facts, specs: docs.slice(0, 1) });
    const out = run(facts, budget);
    expect(out.facts.specs.map((d) => d.path)).toEqual(['docs/1.md']);
    expect(out.cuts).toEqual([{ source: 'specs', status: 'truncated', reason: 'over_budget' }]);
    // a lower tier is untouched while a higher tier suffices
    expect(out.facts.description).toBe(facts.description);
    expect(out.facts.blast).toEqual(facts.blast);
    expect(out.facts.files).toEqual(facts.files);
  });

  it('records missing/over_budget when every document goes', () => {
    const facts = base({ specs: docs });
    const out = run(facts, 50);
    expect(out.facts.specs).toEqual([]);
    expect(out.cuts).toContainEqual({ source: 'specs', status: 'missing', reason: 'over_budget' });
    expect(out.facts.unavailable.specs).toBe('over_budget');
    expect(out.prompt.user).toContain('specs (over_budget)');
  });
});

describe('fitBudget — tier 2: linked issue', () => {
  const issue = { number: 5, title: 'Issue', body: 'b'.repeat(6000) };

  it('truncates the body to the cap first', () => {
    const facts = base({ linkedIssue: issue });
    const budget = tokens({
      ...facts,
      linkedIssue: { ...issue, body: 'b'.repeat(ISSUE_BODY_MAX_CHARS) },
    });
    const out = run(facts, budget);
    expect(out.facts.linkedIssue?.body.length).toBe(ISSUE_BODY_MAX_CHARS);
    expect(out.cuts).toEqual([{ source: 'linked_issue', status: 'truncated', reason: 'over_budget' }]);
  });

  it('then drops the issue when the truncated body is still too big', () => {
    const facts = base({ linkedIssue: issue });
    const out = run(facts, tokens(base({ unavailable: { linked_issue: 'over_budget' } })));
    expect(out.facts.linkedIssue).toBeNull();
    expect(out.cuts).toEqual([{ source: 'linked_issue', status: 'missing', reason: 'over_budget' }]);
  });
});

describe('fitBudget — tier 3: description', () => {
  it('truncates to the cap: truncated/over_budget', () => {
    const facts = base({ description: 'd'.repeat(6000) });
    const budget = tokens({ ...facts, description: 'd'.repeat(DESCRIPTION_MAX_CHARS) });
    const out = run(facts, budget);
    expect(out.facts.description?.length).toBe(DESCRIPTION_MAX_CHARS);
    expect(out.cuts).toEqual([{ source: 'description', status: 'truncated', reason: 'over_budget' }]);
  });

  it('is not touched while tiers 1 and 2 are enough', () => {
    const facts = base({
      description: 'd'.repeat(6000),
      specs: [{ path: 'a.md', content: 'x'.repeat(8000) }],
    });
    const out = run(facts, tokens({ ...facts, specs: [], unavailable: { specs: 'over_budget' } }));
    expect(out.facts.description).toBe(facts.description);
    expect(out.cuts.map((c) => c.source)).toEqual(['specs']);
  });
});

describe('fitBudget — tier 4: blast callers', () => {
  it('removes callers lowest rank first and records blast truncated', () => {
    const facts = base({
      blast: { summary: 's', changedSymbols: [], callers: callers([5, 1, 9, 3, 7]) },
    });
    const keep = facts.blast!.callers.filter((c) => c.rank >= 5);
    const budget = tokens({ ...facts, blast: { ...facts.blast!, callers: keep } });
    const out = run(facts, budget);
    expect(out.facts.blast!.callers.map((c) => c.rank)).toEqual([5, 9, 7]);
    expect(out.cuts).toEqual([{ source: 'blast', status: 'truncated', reason: 'over_budget' }]);
  });

  it('breaks a rank tie by cutting the later caller first', () => {
    const facts = base({
      blast: { summary: 's', changedSymbols: [], callers: callers([2, 2, 2]) },
    });
    const one = { ...facts.blast!, callers: facts.blast!.callers.slice(0, 2) };
    const out = run(facts, tokens({ ...facts, blast: one }));
    expect(out.facts.blast!.callers.map((c) => c.symbol)).toEqual(['s0', 's1']);
  });
});

describe('fitBudget — tier 5: file rows (down to the MIN_FILE_ROWS floor)', () => {
  // 60 rows with distinct churn (37 is coprime with 60), in a scrambled order.
  const rows = Array.from({ length: 60 }, (_, i) => row(i, ((i * 37) % 60) + 1));

  it('cuts the lowest-churn rows first, keeps the original order and records omitted', () => {
    const facts = base({ files: rows, filesTotal: 60 });
    const keep = MIN_FILE_ROWS + 5; // above the floor, so tier 5 itself does the cutting
    const byChurn = [...rows].sort((a, b) => a.additions - b.additions);
    const kept = new Set(byChurn.slice(rows.length - keep).map((r) => r.path)); // the highest churn
    const keptRows = rows.filter((r) => kept.has(r.path));
    const out = run(facts, tokens({ ...facts, files: keptRows }));
    expect(out.facts.files).toEqual(keptRows);
    expect(out.cuts).toEqual([
      { source: 'diff_stats', status: 'truncated', reason: 'over_budget', omitted: rows.length - keep },
    ]);
    expect(out.facts.filesTotal).toBe(60);
    expect(out.prompt.user).toContain(`60 files (${keep} shown)`);
  });

  it('does nothing for a PR with no more rows than the floor — the rows wait for tier 7', () => {
    const few = rows.slice(0, MIN_FILE_ROWS);
    const facts = base({
      files: few,
      filesTotal: few.length,
      blast: { summary: 'z'.repeat(20_000), changedSymbols: [], callers: [] },
    });
    // fits once the blast text is cut: the rows must all survive
    const out = run(facts, 2_500);
    expect(out.facts.files).toEqual(few);
    expect(out.cuts.map((c) => c.source)).toEqual(['blast']);
  });

  // Rows with a churn far above the rest, so the cut under test happens above the floor.
  const heavy = Array.from({ length: MIN_FILE_ROWS }, (_, i) => row(100 + i, 1_000 + i));

  it('breaks a churn tie by cutting the later row first', () => {
    const tied = [row(1, 4), row(2, 4), row(3, 4)];
    const files = [...tied, ...heavy];
    const facts = base({ files, filesTotal: files.length });
    const out = run(facts, tokens({ ...facts, files: [...tied.slice(0, 2), ...heavy] }));
    expect(out.facts.files.map((r) => r.path)).toEqual(['src/f1.ts', 'src/f2.ts', ...heavy.map((r) => r.path)]);
  });

  it('counts additions + deletions as churn', () => {
    const light = [row(1, 1, 50), row(2, 30, 0)];
    const files = [...light, ...heavy];
    const facts = base({ files, filesTotal: files.length });
    const out = run(facts, tokens({ ...facts, files: [light[0]!, ...heavy] }));
    expect(out.facts.files.map((r) => r.path)).toEqual(['src/f1.ts', ...heavy.map((r) => r.path)]);
  });

  it('is not touched while tiers 1-4 are enough', () => {
    const facts = base({
      files: rows,
      filesTotal: 60,
      blast: { summary: 's', changedSymbols: [], callers: callers([1, 2, 3, 4]) },
    });
    const out = run(facts, tokens({ ...facts, blast: { ...facts.blast!, callers: [] } }));
    expect(out.facts.files).toEqual(rows);
    expect(out.cuts.map((c) => c.source)).toEqual(['blast']);
  });
});

describe('fitBudget — tier 6: text (AC-61)', () => {
  it('an intent over the budget with few rows: the text is cut, the rows survive, count within budget', () => {
    const facts = base({
      intent: { intent: 'i'.repeat(40_000), in_scope: ['a'], out_of_scope: ['b'] },
      files: Array.from({ length: 5 }, (_, i) => row(i, i + 1)),
      filesTotal: 5,
    });
    const out = run(facts, INPUT_TOKEN_BUDGET);
    expect(out.tokens).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    expect(out.facts.textLimits.intent).toBeGreaterThan(0);
    // tier 5 has nothing to cut at or below the floor, and tier 6 was enough: no row went
    expect(out.facts.files).toEqual(facts.files);
    expect(out.cuts).toEqual([{ source: 'intent', status: 'truncated', reason: 'over_budget' }]);
    expect(out.prompt.user).toContain('5 files (5 shown)');
  });

  it('an intent that cannot fit even empty: the text goes to zero (tier 6), then the rows below the floor (tier 7)', () => {
    const rows50 = Array.from({ length: 50 }, (_, i) => row(i, ((i * 7) % 50) + 1));
    const facts = base({
      intent: { intent: 'i'.repeat(40_000), in_scope: ['a'], out_of_scope: ['b'] },
      files: rows50,
      filesTotal: 50,
    });
    const budget = 300; // fewer than MIN_FILE_ROWS rows fit, whatever the text
    const out = run(facts, budget);
    expect(out.tokens).toBeLessThanOrEqual(budget);
    expect(out.facts.textLimits.intent).toBe(0);
    expect(out.facts.files.length).toBeGreaterThan(0);
    expect(out.facts.files.length).toBeLessThan(MIN_FILE_ROWS);
    // what is left are the highest-churn rows, in the original order
    const worstKept = Math.min(...out.facts.files.map((r) => r.additions));
    const kept = new Set(out.facts.files.map((r) => r.path));
    expect(rows50.filter((r) => r.additions > worstKept).every((r) => kept.has(r.path))).toBe(true);
    expect(out.facts.files).toEqual(rows50.filter((r) => kept.has(r.path)));
    // cuts come in `inputs` order; omitted accumulates tier 5 (down to the floor) and tier 7
    expect(out.cuts).toEqual([
      { source: 'intent', status: 'truncated', reason: 'over_budget' },
      {
        source: 'diff_stats',
        status: 'truncated',
        reason: 'over_budget',
        omitted: 50 - out.facts.files.length,
      },
      // even the title (reported as the description input) went to zero before the rows did
      { source: 'description', status: 'truncated', reason: 'over_budget' },
    ]);
    expect(out.facts.textLimits.title).toBe(0);
  });

  it('a large PR keeps at least MIN_FILE_ROWS file rows while a blast text over the budget is truncated', () => {
    const files = Array.from({ length: 372 }, (_, i) => row(i, ((i * 101) % 372) + 1));
    const facts = base({
      files,
      filesTotal: 372,
      blast: { summary: 'z'.repeat(60_000), changedSymbols: [], callers: [] },
    });
    const out = run(facts, INPUT_TOKEN_BUDGET);
    expect(out.tokens).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    // the model still has files to ground risks and focus in
    expect(out.facts.files.length).toBeGreaterThanOrEqual(MIN_FILE_ROWS);
    // and they are the highest-churn ones, in the original order
    const kept = new Set(out.facts.files.map((r) => r.path));
    const worstKept = Math.min(...out.facts.files.map((r) => r.additions));
    expect(files.filter((r) => r.additions > worstKept).every((r) => kept.has(r.path))).toBe(true);
    expect(out.facts.files).toEqual(files.filter((r) => kept.has(r.path)));
    // the blast text was cut, not zeroed away with the rows
    expect(out.facts.textLimits.blast).toBeGreaterThan(0);
    expect(out.facts.textLimits.blast).toBeLessThan(60_000);
    // the pre-cap (372 -> MAX_FILE_ROWS) and tier 5 (down to the floor) are both in `omitted`
    const diff = out.cuts.find((c) => c.source === 'diff_stats')!;
    expect(diff.omitted).toBe(372 - out.facts.files.length);
    expect(out.facts.files.length).toBeLessThan(MAX_FILE_ROWS);
    expect(out.cuts.map((c) => c.source)).toEqual(['blast', 'diff_stats']);
    expect(out.prompt.user).toContain(`372 files (${out.facts.files.length} shown)`);
  });

  it('cuts the blast text before the intent text', () => {
    const facts = base({
      intent: { intent: 'short intent', in_scope: [], out_of_scope: [] },
      blast: { summary: 'z'.repeat(20_000), changedSymbols: [], callers: [] },
    });
    const out = run(facts, 2_000);
    expect(out.tokens).toBeLessThanOrEqual(2_000);
    expect(out.facts.textLimits.blast).toBeDefined();
    expect(out.facts.textLimits.intent).toBeUndefined();
    expect(out.cuts.map((c) => c.source)).toEqual(['blast']);
    expect(out.prompt.user).toContain('short intent');
  });

  it('cuts the title last and reports it as the description input', () => {
    const facts = base({ title: 't'.repeat(40_000) });
    const out = run(facts, 1_000);
    expect(out.tokens).toBeLessThanOrEqual(1_000);
    expect(out.facts.textLimits.title).toBeGreaterThan(0);
    expect(out.cuts).toEqual([{ source: 'description', status: 'truncated', reason: 'over_budget' }]);
  });

  it('never throws, even when the system prompt alone is over the budget', () => {
    const facts = base({ title: 'x'.repeat(100) });
    const big = fitBudget({
      facts,
      render: (f) => renderBriefPrompt('S'.repeat(10_000), f),
      countTokens,
      budget: 100,
    });
    expect(big.prompt.system).toHaveLength(10_000);
  });

  it('applies the tiers in order across a mixed prompt: 1, 2, 3, 4, 5 (to the floor), 6, 7', () => {
    const rows60 = Array.from({ length: 60 }, (_, i) => row(i, ((i * 37) % 60) + 1));
    const facts = base({
      description: 'd'.repeat(6000),
      linkedIssue: { number: 1, title: 'i', body: 'b'.repeat(6000) },
      specs: [{ path: 'a.md', content: 'x'.repeat(6000) }],
      blast: { summary: 'b'.repeat(500), changedSymbols: [], callers: callers([1, 2, 3, 4, 5, 6]) },
      files: rows60,
      filesTotal: 60,
      intent: { intent: 'keep me '.repeat(50), in_scope: [], out_of_scope: [] },
    });
    // Budget that needs everything: specs / issue gone, description and callers cut, every text
    // at zero, and still fewer than the floor of rows left.
    const target = rows60.slice(0, 30);
    const emptied = {
      ...facts,
      specs: [],
      linkedIssue: null,
      files: target,
      blast: { ...facts.blast!, callers: [] },
      description: 'd'.repeat(DESCRIPTION_MAX_CHARS),
      unavailable: { specs: 'over_budget', linked_issue: 'over_budget' },
      textLimits: { blast: 0, intent: 0, title: 0 },
    };
    const out = run(facts, tokens(emptied));
    expect(out.facts.specs).toEqual([]);
    expect(out.facts.linkedIssue).toBeNull();
    expect(out.facts.description?.length).toBe(DESCRIPTION_MAX_CHARS);
    expect(out.facts.blast!.callers).toEqual([]);
    // tier 5 stopped at the floor, tier 7 went below it (and no further than needed)
    expect(out.facts.files.length).toBeGreaterThan(0);
    expect(out.facts.files.length).toBeLessThan(MIN_FILE_ROWS);
    expect(out.facts.textLimits).toEqual({ blast: 0, intent: 0, title: 0 });
    expect(out.tokens).toBeLessThanOrEqual(tokens(emptied));
    expect(out.cuts.map((c) => `${c.source}:${c.status}`)).toEqual([
      'intent:truncated',
      'blast:truncated',
      'diff_stats:truncated',
      'description:truncated',
      'linked_issue:missing',
      'specs:missing',
    ]);
    const diff = out.cuts.find((c) => c.source === 'diff_stats')!;
    expect(diff.omitted).toBe(60 - out.facts.files.length);
  });
});

describe('applyCuts (AC-63)', () => {
  it('replaces the entry whole, so over_budget wins over file_list_truncated', () => {
    const inputs = [
      { source: 'diff_stats' as const, status: 'truncated' as const, reason: 'file_list_truncated' },
      { source: 'specs' as const, status: 'used' as const },
    ];
    const out = applyCuts(inputs, [
      { source: 'diff_stats', status: 'truncated', reason: 'over_budget', omitted: 12 },
      { source: 'specs', status: 'missing', reason: 'over_budget' },
    ]);
    expect(out).toEqual([
      { source: 'diff_stats', status: 'truncated', reason: 'over_budget', omitted: 12 },
      { source: 'specs', status: 'missing', reason: 'over_budget' },
    ]);
  });

  it('leaves untouched entries alone', () => {
    const inputs = [{ source: 'intent' as const, status: 'used' as const }];
    expect(applyCuts(inputs, [])).toEqual(inputs);
  });
});
