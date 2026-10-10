/**
 * Pure paste rules for manual eval cases (SPEC-05 W4): `checkPastedDiff`, the expectation
 * checks it feeds, and the two prompt helpers. No database. The verdicts are asserted
 * against `fixtures/eval-case-diff-parity.json`, the SAME list the client's
 * `eval-case-diff.test.ts` reads — that shared list is what keeps the client preview and
 * the server verdict from drifting (AC-12). AC-12, AC-22, AC-23, AC-25, AC-45, AC-46, AC-47.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { EvalExpectation } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  checkPastedDiff,
  diffFilePath,
  rangeIntersectsHunks,
} from '../src/modules/eval/helpers/case-diff.js';
import { evalPrDescription, evalTaskLine } from '../src/modules/eval/helpers/prompt.js';

type FixtureDiff = string | { repeatToBytes: number; header: string };

interface ParityEntry {
  name: string;
  diff: FixtureDiff;
  expectation?: EvalExpectation;
  expect: {
    diff: null | 'diff_too_large' | 'diff_unparseable' | 'multi_file_diff';
    path?: string;
    expectation?: null | 'file_mismatch' | 'range_outside_hunks';
    skeleton?: { start_line: number } | null;
  };
}

const entries = JSON.parse(
  readFileSync(join(process.cwd(), 'test/fixtures/eval-case-diff-parity.json'), 'utf8'),
) as ParityEntry[];

/** Expand `{repeatToBytes, header}` to a string of exactly that many UTF-8 bytes. */
function expand(diff: FixtureDiff): string {
  if (typeof diff === 'string') return diff;
  const filler = diff.repeatToBytes - Buffer.byteLength(diff.header, 'utf8');
  return diff.header + 'x'.repeat(filler);
}

/** The expectation verdict the service gives once the diff has passed (create and update). */
function expectationVerdict(storedDiff: string, e: EvalExpectation) {
  const parsed = parseUnifiedDiff(storedDiff);
  if (e.file !== diffFilePath(parsed)) return 'file_mismatch';
  if (!rangeIntersectsHunks(parsed, e.file, e.start_line, e.end_line)) return 'range_outside_hunks';
  return null;
}

const byName = (name: string): ParityEntry => {
  const found = entries.find((e) => e.name === name);
  if (!found) throw new Error(`missing parity entry ${name}`);
  return found;
};

describe('parity fixture (AC-12, server half)', () => {
  it('has the entries AC-12 lists', () => {
    expect(entries.length).toBeGreaterThanOrEqual(13);
  });

  it.each(entries.map((e) => [e.name, e] as const))('%s', (_name, entry) => {
    const raw = expand(entry.diff);
    const result = checkPastedDiff(raw);

    if (entry.expect.diff !== null) {
      expect(result).toEqual({ ok: false, code: entry.expect.diff });
      return;
    }

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe(entry.expect.path);
    // The stored form always parses to exactly one file with that path.
    const parsed = parseUnifiedDiff(result.diff);
    expect(parsed.files.map((f) => f.path)).toEqual([entry.expect.path]);

    if (entry.expectation) {
      expect(expectationVerdict(result.diff, entry.expectation)).toBe(entry.expect.expectation);
    }
  });
});

describe('stored form (AC-22, AC-23)', () => {
  it('a "+++"-only paste and a full-header paste store the identical diff', () => {
    const bare = checkPastedDiff(expand(byName('range-on-added-line').diff));
    const full = checkPastedDiff(expand(byName('full-git-header').diff));
    expect(bare.ok && full.ok).toBe(true);
    if (!bare.ok || !full.ok) return;

    expect(full.diff).toBe(bare.diff);
    expect(bare.diff).toBe(
      'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n' +
        '@@ -10,3 +10,4 @@\n ctx10\n-old\n+add11\n+add12\n ctx13\n',
    );
    // The pasted `index` line is dropped, not carried into the stored text.
    expect(full.diff).not.toContain('index 111..222');
  });

  it('parses to one file with the pasted path and the pasted new-side numbers', () => {
    const result = checkPastedDiff(expand(byName('full-git-header').diff));
    if (!result.ok) throw new Error('expected a valid paste');
    const parsed = parseUnifiedDiff(result.diff);

    expect(parsed.files).toHaveLength(1);
    const file = parsed.files[0]!;
    expect(file.path).toBe('src/a.ts');
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]).toMatchObject({ newStart: 10, newLines: 4 });
    // ctx10, (removed), add11, add12, ctx13 — the removed line takes no new-side number.
    expect(file.hunks[0]!.newLineNumbers.slice(0, 4)).toEqual([10, 11, 12, 13]);
  });

  it('stores CRLF input as LF, identical to the LF paste', () => {
    const crlf = checkPastedDiff(expand(byName('crlf-line-endings').diff));
    const lf = checkPastedDiff(expand(byName('range-on-added-line').diff));
    if (!crlf.ok || !lf.ok) throw new Error('expected valid pastes');

    expect(crlf.diff).toBe(lf.diff);
    expect(crlf.diff).not.toContain('\r');
  });

  it('keeps a "\\ No newline at end of file" marker in the stored text', () => {
    const result = checkPastedDiff(expand(byName('one-past-last-hunk-with-no-newline-marker').diff));
    if (!result.ok) throw new Error('expected a valid paste');
    expect(result.diff).toContain('\\ No newline at end of file');
  });
});

describe('check order (AC-25)', () => {
  it('a 300 KB two-file diff is diff_too_large, not multi_file_diff', () => {
    const raw = expand(byName('too-large-wins-over-multi-file').diff);
    expect(checkPastedDiff(raw)).toEqual({ ok: false, code: 'diff_too_large' });
  });

  it('measures the size on the text as sent: CRLF counts as two bytes per break', () => {
    // 102_400 lines of "x\r\n" is 307 200 bytes sent, 204 800 once normalised to LF.
    const header = '+++ b/src/a.ts\r\n@@ -1,1 +1,1 @@\r\n+';
    const body = 'x\r\n'.repeat(102_400);
    expect(checkPastedDiff(header + body)).toEqual({ ok: false, code: 'diff_too_large' });
  });

  it('a "+++ /dev/null" first header with a second file is diff_unparseable, not multi_file_diff', () => {
    const raw =
      '--- a/src/a.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x\n' +
      '+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n+y\n';
    expect(checkPastedDiff(raw)).toEqual({ ok: false, code: 'diff_unparseable' });
  });

  it('a missing hunk header is diff_unparseable even when there are two files', () => {
    const raw = '+++ b/src/a.ts\n+x\n+++ b/src/b.ts\n+y\n';
    expect(checkPastedDiff(raw)).toEqual({ ok: false, code: 'diff_unparseable' });
  });

  it('empty text is diff_unparseable', () => {
    expect(checkPastedDiff('')).toEqual({ ok: false, code: 'diff_unparseable' });
  });
});

describe('prompt slots of a manual case (AC-45, AC-47)', () => {
  it('a null pr_number gives a task line in fixed words with no PR number', () => {
    const line = evalTaskLine({ pr_number: null });
    expect(line).not.toMatch(/#\d/);
    expect(line).not.toMatch(/\d/);
    expect(line).toContain('Review this change');
  });

  it('a real pr_number keeps the finding-born wording byte for byte', () => {
    expect(evalTaskLine({ pr_number: 7 })).toContain('Review pull request #7 (its title and description are in the untrusted');
  });

  it('no title and no body gives no PR description', () => {
    expect(evalPrDescription({ title: '', body: null })).toBeUndefined();
  });

  it('a body alone, or a title alone, is still a description (AC-46)', () => {
    expect(evalPrDescription({ title: '', body: 'why' })).toBe('Title: \n\nwhy');
    expect(evalPrDescription({ title: 'T', body: null })).toBe('Title: T');
    expect(evalPrDescription({ title: 'T', body: 'B' })).toBe('Title: T\n\nB');
  });
});
