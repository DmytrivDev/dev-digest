import { describe, expect, it } from 'vitest';
import { getEncoding } from 'js-tiktoken';
import { fitBudget } from '../src/modules/brief/helpers/budget.js';
import { renderBriefPrompt } from '../src/modules/brief/helpers/prompt.js';
import {
  breakLongRuns,
  chunkMemoCounter,
  clipBytes,
  hasRunOver,
  utf8Length,
} from '../src/modules/brief/helpers/bounds.js';
import {
  DESCRIPTION_MAX_CHARS,
  DESCRIPTION_PRECAP_BYTES,
  INPUT_TOKEN_BUDGET,
  ISSUE_BODY_MAX_CHARS,
  ISSUE_BODY_PRECAP_BYTES,
  ITEM_MAX_BYTES,
  MAX_FILE_ROWS,
  MAX_RUN_BYTES,
  PATH_RUN_MAX_BYTES,
  SPEC_TOTAL_MAX_BYTES,
  TITLE_MAX_BYTES,
} from '../src/modules/brief/constants.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import type { BriefFacts, FileStat } from '../src/modules/brief/types.js';

/**
 * F9 / F12 / F13 — the brief's token budget must stay cheap on hostile input. A 65,536-char
 * single-word PR body used to stall the process (js-tiktoken's BPE merge is super-linear per
 * piece AND scales with UTF-8 bytes), the callers / file tiers re-tokenized the whole prompt
 * once per removed row, and file names went to the counter unbounded.
 */

const SYSTEM = 'SYS';
const render = (f: BriefFacts) => renderBriefPrompt(SYSTEM, f);

/** A counting double: chars / 4, and every call is recorded. */
function countingCounter() {
  const seen: number[] = [];
  return {
    seen,
    count: (s: string): number => {
      seen.push(s.length);
      return Math.ceil(s.length / 4);
    },
  };
}

const row = (i: number, path = `src/f${i}.ts`): FileStat => ({
  path,
  role: 'core',
  additions: i + 1,
  deletions: 0,
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

const input = (facts: BriefFacts) => {
  const c = countingCounter();
  const out = fitBudget({ facts, render, countTokens: c.count, budget: INPUT_TOKEN_BUDGET });
  return { out, c };
};

/** Deterministic pseudo-random letters / CJK, distinct per call (the cache must not help). */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
const randomLetters = (r: () => number, n: number): string =>
  Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(r() * 26))).join('');
const randomCjk = (r: () => number, n: number): string =>
  Array.from({ length: n }, () => String.fromCharCode(0x4e00 + Math.floor(r() * 2000))).join('');

describe('bounds — bytes, not characters', () => {
  it('utf8Length matches the real encoding', () => {
    for (const s of ['', 'abc', 'é', '日本語', '\u{1D41A}', 'a\u{1D41A}é日', '\ud800', 'x\udc00y']) {
      expect(utf8Length(s)).toBe(new TextEncoder().encode(s).length);
    }
  });

  it('clipBytes cuts on a character boundary and keeps a text that fits', () => {
    expect(clipBytes('abc', 10)).toBe('abc');
    expect(clipBytes('abcdef', 4)).toBe('abcd');
    expect(clipBytes('日本語', 7)).toBe('日本'); // 3 + 3, the third would be 9
    expect(clipBytes('\u{1D41A}\u{1D41A}', 7)).toBe('\u{1D41A}'); // 4, the second would be 8
    expect(utf8Length(clipBytes('\u{1D41A}'.repeat(50_000), 32_000))).toBe(32_000);
  });

  it('hasRunOver counts bytes: 40 ASCII letters pass, 11 astral letters (44 bytes) do not', () => {
    expect(hasRunOver('a'.repeat(PATH_RUN_MAX_BYTES), PATH_RUN_MAX_BYTES)).toBe(false);
    expect(hasRunOver('a'.repeat(PATH_RUN_MAX_BYTES + 1), PATH_RUN_MAX_BYTES)).toBe(true);
    expect(hasRunOver('\u{1D41A}'.repeat(11), PATH_RUN_MAX_BYTES)).toBe(true);
    expect(hasRunOver('src/AbstractSingletonProxyFactoryBean.java', PATH_RUN_MAX_BYTES)).toBe(false);
    expect(hasRunOver('日'.repeat(14), PATH_RUN_MAX_BYTES)).toBe(true); // 42 bytes
  });
});

describe('breakLongRuns', () => {
  it('leaves ordinary text, long paths and URLs alone', () => {
    const text = 'See https://example.com/a/very/long/path/to/some/resource?id=123&x=y and src/modules/brief/helpers/budget.ts';
    expect(breakLongRuns(text)).toBe(text);
  });

  it('breaks a letter run and a punctuation run longer than the limit, never one at the limit', () => {
    const ok = 'a'.repeat(MAX_RUN_BYTES);
    expect(breakLongRuns(ok)).toBe(ok);
    const long = 'a'.repeat(MAX_RUN_BYTES * 2 + 5);
    expect(breakLongRuns(long).split(' ').map((p) => p.length)).toEqual([MAX_RUN_BYTES, MAX_RUN_BYTES, 5]);
    expect(breakLongRuns('!'.repeat(MAX_RUN_BYTES + 1))).toBe(`${'!'.repeat(MAX_RUN_BYTES)} !`);
  });

  it('limits by UTF-8 bytes: 32 astral letters (128 bytes) become pieces of at most 32 bytes', () => {
    const out = breakLongRuns('\u{1D41A}'.repeat(32));
    const pieces = out.split(' ');
    expect(pieces.every((p) => utf8Length(p) <= MAX_RUN_BYTES)).toBe(true);
    expect(pieces.join('')).toBe('\u{1D41A}'.repeat(32));
    expect(breakLongRuns('日'.repeat(30)).split(' ').every((p) => utf8Length(p) <= MAX_RUN_BYTES)).toBe(true);
  });

  it('shortens a long whitespace run and never splits a surrogate pair', () => {
    expect(breakLongRuns(`a${' '.repeat(500)}b`)).toBe(`a${' '.repeat(MAX_RUN_BYTES)}b`);
    const out = breakLongRuns('😀'.repeat(MAX_RUN_BYTES + 3));
    expect(out.split(' ').every((p) => !/[\ud800-\udbff]$/.test(p))).toBe(true);
  });
});

describe('chunkMemoCounter — exactly the cl100k count, from cached pieces (F13)', () => {
  const enc = getEncoding('cl100k_base');
  const direct = (s: string): number => enc.encode(s).length;
  const memo = chunkMemoCounter(direct);

  it('equals the whole-text count on adversarial punctuation / whitespace / newline mixes', () => {
    const r = rng(7);
    const alphabet = ['a', 'b', 'Z', '1', '2', ' ', ' ', '\n', '\n', '\t', '-', '.', '/', '#', '`', "'", 's', '\r', 'é', '日', '\u{1D41A}', '<', '>', '_', '!'];
    for (let i = 0; i < 3_000; i++) {
      const len = 1 + Math.floor(r() * 60);
      let text = '';
      for (let k = 0; k < len; k++) text += alphabet[Math.floor(r() * alphabet.length)];
      expect(memo(text), JSON.stringify(text)).toBe(direct(text));
    }
  });

  it('equals the whole-text count on real rendered prompts', () => {
    const files = Array.from({ length: 40 }, (_, i) => row(i, `src/mod${i}/Some-File_${i}.test.tsx`));
    const facts = base({
      description: '## Why\n\nFixes #12 — the `retry` loop never stopped.\n\n- one\n- two\n\n```ts\nconst x = {a: 1};\n```\n',
      linkedIssue: { number: 12, title: 'Retry bug', body: 'Steps:\n1. open\n2. click   twice  \n\n\nExpected: no loop' },
      intent: { intent: 'Stop the loop', in_scope: ['retry'], out_of_scope: [] },
      files,
      filesTotal: 40,
      specs: [{ path: 'docs/spec.md', content: '# Spec\n\nUse **bold** and  double  spaces.\r\nCRLF line.\n' }],
    });
    const p = render(facts);
    expect(memo(p.user)).toBe(direct(p.user));
    expect(memo(p.system + p.user)).toBe(direct(p.system + p.user));
  });
});

describe('fitBudget — the pre-cap and the cost of a count (F9)', () => {
  it('a 65,536-char single-word description: a bounded number of counts, a final prompt within the budget', () => {
    const { out, c } = input(base({ description: 'a'.repeat(65_536) }));
    expect(out.tokens).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    expect(c.seen.length).toBeLessThanOrEqual(8);
    // nothing longer than the cap (plus the prompt's own headings) ever reached the counter
    expect(Math.max(...c.seen)).toBeLessThan(DESCRIPTION_PRECAP_BYTES * 1.1);
    expect(utf8Length(out.facts.description!)).toBeLessThanOrEqual(DESCRIPTION_PRECAP_BYTES);
    expect(out.cuts).toContainEqual({ source: 'description', status: 'truncated', reason: 'over_budget' });
  });

  it('records a pre-capped input as truncated/over_budget even when the rest then fits', () => {
    const { out } = input(base({ title: 't'.repeat(TITLE_MAX_BYTES + 1) }));
    expect(out.facts.textLimits.title).toBe(TITLE_MAX_BYTES);
    expect(out.cuts).toEqual([{ source: 'description', status: 'truncated', reason: 'over_budget' }]);
  });

  it('keeps an input that could fit on its own: what the tiers would leave survives the pre-cap', () => {
    const facts = base({
      description: 'd '.repeat(DESCRIPTION_MAX_CHARS),
      linkedIssue: { number: 1, title: 'i', body: 'b '.repeat(ISSUE_BODY_MAX_CHARS) },
    });
    const { out } = input(facts);
    expect(out.facts.description).toBe(facts.description);
    expect(out.facts.linkedIssue).toEqual(facts.linkedIssue);
    expect(out.cuts).toEqual([]);
  });

  it('caps the issue body, a spec document, the spec total and an over-long path — all in bytes', () => {
    const doc = (i: number) => ({ path: `docs/${i}.md`, content: 'x '.repeat(30_000) });
    const facts = base({
      linkedIssue: { number: 1, title: 'i', body: 'b '.repeat(ISSUE_BODY_PRECAP_BYTES) },
      specs: [doc(1), doc(2), doc(3), doc(4)],
      files: [{ ...row(1), path: `${'p/'.repeat(ITEM_MAX_BYTES)}x.ts` }],
      filesTotal: 1,
    });
    const { out } = input(facts);
    expect(out.facts.linkedIssue === null || utf8Length(out.facts.linkedIssue.body) <= ISSUE_BODY_PRECAP_BYTES).toBe(true);
    expect(out.facts.specs.reduce((n, d) => n + utf8Length(d.content), 0)).toBeLessThanOrEqual(SPEC_TOTAL_MAX_BYTES);
    expect(out.facts.files.every((f) => utf8Length(f.path) <= ITEM_MAX_BYTES)).toBe(true);
    expect(out.tokens).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    const bySource = Object.fromEntries(out.cuts.map((x) => [x.source, x]));
    expect(bySource.specs?.reason).toBe('over_budget');
    expect(bySource.linked_issue?.reason).toBe('over_budget');
  });

  it('drops the rows beyond MAX_FILE_ROWS first, lowest churn first, and counts them as omitted', () => {
    const files = Array.from({ length: MAX_FILE_ROWS + 50 }, (_, i) => row(i));
    const { out } = input(base({ files, filesTotal: files.length }));
    expect(out.facts.files.length).toBeLessThanOrEqual(MAX_FILE_ROWS);
    // the lowest-churn rows (the smallest `additions`) went first
    expect(out.facts.files.some((f) => f.path === 'src/f0.ts')).toBe(false);
    expect(out.facts.files.some((f) => f.path === `src/f${files.length - 1}.ts`)).toBe(true);
    const diff = out.cuts.find((x) => x.source === 'diff_stats')!;
    expect(diff.omitted).toBe(files.length - out.facts.files.length);
  });

  it('tiers 4, 5 and 7 are a search, not a count per removed row', () => {
    const files = Array.from({ length: 100 }, (_, i) => row(i));
    const callers = Array.from({ length: 100 }, (_, i) => ({
      file: `src/c${i}.ts`,
      symbol: `s${i}`,
      line: i + 1,
      rank: i,
    }));
    const c = countingCounter();
    const out = fitBudget({
      facts: base({ files, filesTotal: 100, blast: { summary: 's', changedSymbols: [], callers } }),
      render,
      countTokens: c.count,
      budget: 300,
    });
    expect(out.tokens).toBeLessThanOrEqual(300);
    // up to ~100 whole-prompt counts each before; now three searches (callers, rows down to the
    // floor, the rows below it: each ~2 x (log2 100 + 2)) plus the text shrink, still a handful
    expect(c.seen.length).toBeLessThanOrEqual(80);
    // 300 tokens is below 40 rows: the texts (the title included) went to zero first
    expect(out.cuts.map((x) => x.source)).toEqual(['blast', 'diff_stats', 'description']);
  });
});

describe('file names in the prompt (F12)', () => {
  it('renders a normal path — even a long CamelCase one — verbatim', () => {
    const path = 'src/main/java/org/AbstractSingletonProxyFactoryBean.java';
    const out = render(base({ files: [row(1, path)], filesTotal: 1 }));
    expect(out.user).toContain(`${path} | core`);
  });

  it('elides a name whose letter run is over the limit, and keeps the rest of the row', () => {
    const path = `src/${'q'.repeat(PATH_RUN_MAX_BYTES + 1)}.ts`;
    const out = render(base({ files: [row(1, path)], filesTotal: 1 }));
    expect(out.user).not.toContain('qqqq');
    expect(out.user).toMatch(/\[name elided: \d+ bytes\] \| core \| \+2 \| -0 \| 1-3/);
  });

  it('elides a caller file and a caller symbol the same way', () => {
    const long = 'z'.repeat(PATH_RUN_MAX_BYTES + 1);
    const out = render(
      base({ blast: { summary: 's', changedSymbols: [], callers: [{ file: `a/${long}.ts`, symbol: long, line: 3, rank: 1 }] } }),
    );
    expect(out.user).not.toContain('zzzz');
    expect(out.user).toContain('[name elided:');
  });

  it('100 random 300-char paths and a counting fake: a bounded number of counts, nothing longer than the row block', () => {
    const r = rng(11);
    const files = Array.from({ length: 100 }, (_, i) => row(i, randomLetters(r, ITEM_MAX_BYTES)));
    const { out, c } = input(base({ files, filesTotal: 100 }));
    expect(out.tokens).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    expect(c.seen.length).toBeLessThanOrEqual(8);
    expect(out.prompt.user).not.toMatch(/[a-z]{41}/);
  });
});

describe('with the real cl100k counter, as the route composes it', () => {
  const tokenizer = new TiktokenTokenizer();
  const counter = (): ((s: string) => number) => chunkMemoCounter((s) => tokenizer.count(s));
  const warm = () => tokenizer.count('warm'); // the BPE ranks load once, outside what is timed

  const run = (facts: BriefFacts, budget = INPUT_TOKEN_BUDGET) => {
    warm();
    const count = counter();
    const started = Date.now();
    const out = fitBudget({ facts, render, countTokens: count, budget });
    const ms = Date.now() - started;
    // the assertion of AC-61 is made with the plain, unmemoised counter
    expect(tokenizer.count(out.prompt.system) + tokenizer.count(out.prompt.user)).toBeLessThanOrEqual(budget);
    return { out, ms };
  };

  it('a 65,536-char single-word description finishes quickly and the prompt fits', () => {
    const { ms } = run(base({ description: 'a'.repeat(65_536) }));
    expect(ms).toBeLessThan(1_000);
  });

  it('100 random-letter 300-char file names finish well under a second', () => {
    const r = rng(21);
    const files = Array.from({ length: 100 }, (_, i) => row(i, randomLetters(r, ITEM_MAX_BYTES)));
    const { ms } = run(base({ files, filesTotal: 100 }));
    expect(ms).toBeLessThan(1_000);
  });

  it('100 random CJK 100-char file names (300 bytes) finish well under a second', () => {
    const r = rng(22);
    const files = Array.from({ length: 100 }, (_, i) => row(i, randomCjk(r, 100)));
    const { ms } = run(base({ files, filesTotal: 100 }));
    expect(ms).toBeLessThan(1_000);
  });

  it('the file names and caller names at the byte limit (the slowest names that stay verbatim) finish quickly', () => {
    const r = rng(23);
    const name = () => `${randomLetters(r, PATH_RUN_MAX_BYTES)}/${randomLetters(r, PATH_RUN_MAX_BYTES)}/${randomLetters(r, PATH_RUN_MAX_BYTES)}.ts`;
    const files = Array.from({ length: MAX_FILE_ROWS }, (_, i) => row(i, name()));
    const callers = Array.from({ length: 150 }, (_, i) => ({ file: name(), symbol: randomLetters(r, 40), line: i + 1, rank: i }));
    const { ms } = run(base({ files, filesTotal: files.length, blast: { summary: 's', changedSymbols: [], callers } }));
    expect(ms).toBeLessThan(1_500);
  });

  it("'\\u{1D41A}'.repeat(16000) in the description AND the issue body finishes quickly (astral letters: 4 bytes each)", () => {
    const astral = '\u{1D41A}'.repeat(16_000);
    const { out, ms } = run(
      base({
        description: astral,
        linkedIssue: { number: 1, title: 'i', body: astral },
        blast: { summary: astral, changedSymbols: [], callers: [] },
      }),
    );
    expect(ms).toBeLessThan(1_500);
    expect(out.cuts.some((c) => c.source === 'blast')).toBe(true);
  });

  it('a hostile mix — a long word, a long punctuation run, a huge whitespace run — also finishes quickly', () => {
    const hostile = `${'z'.repeat(40_000)}${'!'.repeat(40_000)}${' '.repeat(40_000)}tail`;
    const { ms } = run(
      base({
        description: hostile,
        linkedIssue: { number: 1, title: hostile, body: hostile },
        specs: [{ path: 'a.md', content: hostile }],
      }),
    );
    expect(ms).toBeLessThan(2_000);
  });
});
