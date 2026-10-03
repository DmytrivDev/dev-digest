import { describe, expect, it } from 'vitest';
import { getEncoding } from 'js-tiktoken';
import { approxTokens, TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import { chunkMemoCounter } from '../src/modules/brief/helpers/bounds.js';
import { fitBudget, removalOrder } from '../src/modules/brief/helpers/budget.js';
import { renderBriefPrompt } from '../src/modules/brief/helpers/prompt.js';
import { validateBrief } from '../src/modules/brief/helpers/validate.js';
import { INPUT_TOKEN_BUDGET, MAX_BLAST_CALLERS } from '../src/modules/brief/constants.js';
import type { BriefFacts, FileStat } from '../src/modules/brief/types.js';

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

const render = (f: BriefFacts) => renderBriefPrompt('SYS', f);

describe('the cl100k counter and special-token strings (O1)', () => {
  const enc = getEncoding('cl100k_base');
  const exact = (s: string): number => enc.encode(s, [], []).length;
  const SPECIALS = ['<|endoftext|>', '<|fim_prefix|>', '<|fim_middle|>', '<|fim_suffix|>', '<|endofprompt|>'];

  it('counts a text holding a special-token string as ordinary text, and the NEXT count is still exact', () => {
    const tk = new TiktokenTokenizer();
    for (const special of SPECIALS) {
      const text = `Title ${special} and more words after it, so a ceil(len/4) guess differs`;
      expect(tk.count(text)).toBe(exact(text));
    }
    // the instance was not flipped to the heuristic: a later, unrelated count is exact
    const later = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    expect(tk.count(later)).toBe(exact(later));
    expect(tk.count(later)).not.toBe(approxTokens(later));
  });

  it('the chunk memo stays exact on texts with special-token strings', () => {
    const memo = chunkMemoCounter(new TiktokenTokenizer().count.bind(new TiktokenTokenizer()));
    for (const special of SPECIALS) {
      const text = `a ${special}\n\n${special} b<|endoftext|>c\n${special}`;
      expect(memo(text)).toBe(exact(text));
    }
  });
});

describe('the removal order is a stable sort (O2)', () => {
  /** The algorithm it replaces: repeatedly take the lowest key, a tie → the later row. */
  function oldOrder(keys: number[]): number[] {
    const left = keys.map((key, index) => ({ key, index }));
    const out: number[] = [];
    while (left.length > 0) {
      let at = 0;
      for (let i = 1; i < left.length; i++) if (left[i]!.key <= left[at]!.key) at = i;
      out.push(left[at]!.index);
      left.splice(at, 1);
    }
    return out;
  }

  it('gives the same order as the one-at-a-time algorithm, ties included', () => {
    let x = 5;
    const next = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
    for (let round = 0; round < 200; round++) {
      const keys = Array.from({ length: 1 + (next() % 40) }, () => next() % 6); // many ties
      expect(removalOrder(keys, (k) => k)).toEqual(oldOrder(keys));
    }
    expect(removalOrder([2, 2, 2], (k) => k)).toEqual([2, 1, 0]);
  });

  it('10,000 callers: capped before anything is counted, in a bounded number of counts, quickly', () => {
    const callers = Array.from({ length: 10_000 }, (_, i) => ({ file: `src/c${i}.ts`, symbol: `s${i}`, line: i + 1, rank: i % 97 }));
    const seen: number[] = [];
    const started = Date.now();
    const out = fitBudget({
      facts: base({ blast: { summary: 's', changedSymbols: [], callers } }),
      render,
      countTokens: (s) => {
        seen.push(s.length);
        return Math.ceil(s.length / 4);
      },
      budget: INPUT_TOKEN_BUDGET,
    });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(out.tokens).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    expect(out.facts.blast!.callers.length).toBeLessThanOrEqual(MAX_BLAST_CALLERS);
    expect(seen.length).toBeLessThanOrEqual(40);
    expect(out.cuts).toContainEqual({ source: 'blast', status: 'truncated', reason: 'over_budget' });
    // the lowest ranks went first
    expect(Math.min(...out.facts.blast!.callers.map((c) => c.rank))).toBeGreaterThanOrEqual(0);
    expect(out.facts.blast!.callers.filter((c) => c.rank === 0).length).toBeLessThan(
      callers.filter((c) => c.rank === 0).length,
    );
  });

  it('a blast that stays within the cap is not touched by it', () => {
    const callers = Array.from({ length: 50 }, (_, i) => ({ file: `src/c${i}.ts`, symbol: `s${i}`, line: i + 1, rank: i }));
    const out = fitBudget({
      facts: base({ blast: { summary: 's', changedSymbols: [], callers } }),
      render,
      countTokens: (s) => Math.ceil(s.length / 4),
      budget: INPUT_TOKEN_BUDGET,
    });
    expect(out.facts.blast!.callers).toEqual(callers);
    expect(out.cuts).toEqual([]);
  });
});

describe('a verbatim name is never re-split (O3)', () => {
  const run36 = 'a'.repeat(36); // over the 32-byte free-text run limit, within the 40-byte name limit
  const callerPath = `src/${run36}/handler.ts`;
  const row: FileStat = {
    path: `src/${run36}/main.ts`,
    role: 'core',
    additions: 1,
    deletions: 0,
    ranges: [{ start: 1, end: 9 }],
    hasPatch: true,
  };

  it('a caller path and a caller symbol with a 36-byte run appear whole in the prompt', () => {
    const facts = base({
      blast: { summary: 'summary', changedSymbols: [], callers: [{ file: callerPath, symbol: run36, line: 7, rank: 1 }] },
      files: [row],
      filesTotal: 1,
    });
    const { user } = render(facts);
    expect(user).toContain(`${callerPath}:7 ${run36}`);
    expect(user).toContain(`${row.path} | core`);
  });

  it('free text beside it is still run-broken', () => {
    const user = render(
      base({ blast: { summary: 'z'.repeat(100), changedSymbols: [], callers: [{ file: 'a.ts', symbol: 's', line: 1, rank: 1 }] } }),
    ).user;
    expect(user).not.toMatch(/z{33}/);
  });

  it('a focus item citing that caller path survives validation', () => {
    const out = validateBrief({
      output: { summary: 's', risks: [], review_focus: [{ file: callerPath, line: 7, reason: 'r' }] },
      prFiles: [row],
      blastCallers: new Map([[callerPath, new Set([7])]]),
    });
    expect(out.review_focus).toEqual([{ file: callerPath, line: 7, reason: 'r' }]);
    expect(out.dropped.review_focus).toBe(0);
  });
});
