import { describe, expect, it } from 'vitest';
import { linkedIssueNumber } from '../src/modules/brief/helpers/inputs.js';
import { parseIssueRefs } from '../src/modules/intent/helpers.js';

/**
 * F14 — `ISSUE_REF_RE` backtracked quadratically on a long `[\w.-]` run (no `/` or `#`) and on a
 * keyword followed by a long whitespace run: a 65,536-char PR body took 6 s to 29 s.
 */

const REPO = { owner: 'o', name: 'n' };

const timed = (fn: () => unknown): number => {
  const started = Date.now();
  fn();
  return Date.now() - started;
};

describe('issue reference parsing stays linear on a hostile PR body (F14)', () => {
  const bodies: Record<string, string> = {
    'one 65k word': 'a'.repeat(65_536),
    'a keyword and 65k spaces': `fix${' '.repeat(65_000)}`,
    'a keyword, a colon and 65k spaces': `fix:${' '.repeat(65_000)}`,
    '65k dots': '.'.repeat(65_000),
    'name chars, then a slash, no #': `${'a-'.repeat(32_000)}/${'b'.repeat(500)}`,
    'many keywords each with spaces': 'fixes  '.repeat(9_000),
  };

  for (const [name, body] of Object.entries(bodies)) {
    it(`${name}: under 100 ms`, () => {
      expect(timed(() => parseIssueRefs(body))).toBeLessThan(100);
      expect(timed(() => linkedIssueNumber(body, REPO))).toBeLessThan(100);
    });
  }

  it('still finds a reference after a hostile prefix', () => {
    const body = `${'a'.repeat(65_000)} Fixes #42`;
    expect(parseIssueRefs(body)).toEqual([{ number: 42, linked: true }]);
    expect(linkedIssueNumber(body, REPO)).toBe(42);
  });

  it('keeps the forms: owner/repo#N, a bare #N, a URL, a keyword with a colon and with spaces', () => {
    expect(parseIssueRefs('closes: o/n#7')).toEqual([{ number: 7, linked: true, owner: 'o', repo: 'n' }]);
    expect(parseIssueRefs('fix : #8')).toEqual([{ number: 8, linked: true }]);
    expect(parseIssueRefs('fix:#8')).toEqual([{ number: 8, linked: false }]);
    expect(parseIssueRefs('see my-org.x/re_po#9')).toEqual([{ number: 9, linked: false, owner: 'my-org.x', repo: 're_po' }]);
    expect(parseIssueRefs('Resolved https://github.com/o/n/issues/10')).toEqual([
      { number: 10, linked: true, owner: 'o', repo: 'n' },
    ]);
    // a `#N` glued to a name that is not an owner/repo pair is a bare reference to N
    expect(parseIssueRefs('abc#5')).toEqual([{ number: 5, linked: false }]);
  });
});
