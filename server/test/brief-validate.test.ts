import { describe, expect, it } from 'vitest';
import { toJsonSchema } from '@devdigest/reviewer-core';
import {
  normalizePath,
  parseModelOutput,
  parseRef,
  validateBrief,
} from '../src/modules/brief/helpers/validate.js';
import { BriefModelOutput, type FileStat } from '../src/modules/brief/types.js';

const file = (path: string, ranges: { start: number; end: number }[], hasPatch = true): FileStat => ({
  path,
  role: 'core',
  additions: 1,
  deletions: 0,
  ranges,
  hasPatch,
});

const A = file('src/a.ts', [{ start: 12, end: 18 }]);
const BINARY = file('assets/logo.png', [], false);

type Risk = BriefModelOutput['risks'][number];
const risk = (over: Partial<Risk> = {}): Risk => ({
  kind: 'security',
  title: 'T',
  explanation: 'E',
  severity: 'medium',
  file_refs: ['src/a.ts'],
  ...over,
});

const out = (over: Partial<BriefModelOutput> = {}): BriefModelOutput => ({
  summary: 'S',
  risks: [],
  review_focus: [],
  ...over,
});

const callers = (entries: Record<string, number[]>) =>
  new Map(Object.entries(entries).map(([f, l]) => [f, new Set(l)]));

const run = (
  output: BriefModelOutput,
  prFiles: FileStat[] = [A],
  blastCallers: ReturnType<typeof callers> | null = null,
) => validateBrief({ output, prFiles, blastCallers });

describe('parseModelOutput / output schema (AC-70)', () => {
  it('accepts a well-formed answer and rejects a malformed one', () => {
    expect(parseModelOutput(out()).ok).toBe(true);
    expect(parseModelOutput({ summary: 1 }).ok).toBe(false);
    expect(parseModelOutput(null).ok).toBe(false);
  });

  it('does not constrain lengths: an over-long answer is cut later, not rejected', () => {
    expect(parseModelOutput(out({ summary: 's'.repeat(5000) })).ok).toBe(true);
  });

  it('converts to a JSON schema the structured-output call can send', () => {
    const schema = toJsonSchema(BriefModelOutput, 'pr_brief');
    expect(schema.name).toBe('pr_brief');
    expect(JSON.stringify(schema.schema)).not.toContain('maxLength');
  });
});

describe('normalizePath (AC-71)', () => {
  it('converts backslashes and strips one leading ./ or /', () => {
    expect(normalizePath('./src\\a.ts')).toBe('src/a.ts');
    expect(normalizePath('/src/a.ts')).toBe('src/a.ts');
    expect(normalizePath('src/a.ts')).toBe('src/a.ts');
  });

  it('a normalised model path matches the PR file', () => {
    const res = run(out({ review_focus: [{ file: './src\\a.ts', line: 12, reason: 'r' }] }));
    expect(res.review_focus).toEqual([{ file: 'src/a.ts', line: 12, reason: 'r' }]);
    expect(res.dropped.review_focus).toBe(0);
  });
});

describe('parseRef (AC-74)', () => {
  it('keeps path, path:N and path:N-M', () => {
    expect(parseRef('a.ts')).toEqual({ path: 'a.ts', start: null, end: null });
    expect(parseRef('a.ts:3')).toEqual({ path: 'a.ts', start: 3, end: null });
    expect(parseRef('a.ts:3-9')).toEqual({ path: 'a.ts', start: 3, end: 9 });
    expect(parseRef('./src\\a.ts:5')).toEqual({ path: 'src/a.ts', start: 5, end: null });
  });

  it('rejects a:0, a:9-3, a:x and an empty path', () => {
    expect(parseRef('a.ts:0')).toBeNull();
    expect(parseRef('a.ts:9-3')).toBeNull();
    expect(parseRef('a.ts:x')).toBeNull();
    expect(parseRef('')).toBeNull();
    expect(parseRef(':5')).toBeNull();
  });
});

describe('focus items', () => {
  it('drops an unknown file (AC-72)', () => {
    const res = run(out({ review_focus: [{ file: 'src/invented.ts', line: 12, reason: 'r' }] }));
    expect(res.review_focus).toEqual([]);
    expect(res.dropped.review_focus).toBe(1);
  });

  it('a line outside every changed range is dropped, a line inside kept (AC-76)', () => {
    const res = run(
      out({
        review_focus: [
          { file: 'src/a.ts', line: 19, reason: 'out' },
          { file: 'src/a.ts', line: 12, reason: 'in' },
          { file: 'src/a.ts', line: 18, reason: 'edge' },
        ],
      }),
    );
    expect(res.review_focus.map((f) => f.line)).toEqual([12, 18]);
    expect(res.dropped.review_focus).toBe(1);
  });

  it('a blast-only file keeps only a listed caller line (AC-77)', () => {
    const res = run(
      out({
        review_focus: [
          { file: 'src/server.ts', line: 88, reason: 'caller' },
          { file: 'src/server.ts', line: 87, reason: 'not a caller line' },
        ],
      }),
      [A],
      callers({ 'src/server.ts': [88] }),
    );
    expect(res.review_focus.map((f) => f.line)).toEqual([88]);
    expect(res.dropped.review_focus).toBe(1);
  });

  it('a PR file without a patch is checked by path only (AC-78)', () => {
    const res = run(out({ review_focus: [{ file: 'assets/logo.png', line: 5, reason: 'r' }] }), [BINARY]);
    expect(res.review_focus).toHaveLength(1);
  });

  it('a line below 1 is dropped and counted', () => {
    const res = run(out({ review_focus: [{ file: 'assets/logo.png', line: 0, reason: 'r' }] }), [BINARY]);
    expect(res.review_focus).toEqual([]);
    expect(res.dropped.review_focus).toBe(1);
  });

  it('with blast missing (null) only PR files ground an item (AC-58)', () => {
    const res = run(out({ review_focus: [{ file: 'src/server.ts', line: 88, reason: 'r' }] }), [A], null);
    expect(res.review_focus).toEqual([]);
  });

  it('counts only path/line removals: one invented path and one bad line among 3 -> 2 (AC-82)', () => {
    const res = run(
      out({
        review_focus: [
          { file: 'src/invented.ts', line: 1, reason: 'a' },
          { file: 'src/a.ts', line: 99, reason: 'b' },
          { file: 'src/a.ts', line: 13, reason: 'c' },
        ],
      }),
    );
    expect(res.dropped.review_focus).toBe(2);
    expect(res.review_focus).toHaveLength(1);
  });

  it('keeps at most 6 in model order and removes exact file:line duplicates (AC-80)', () => {
    const wide = file('src/wide.ts', [{ start: 1, end: 100 }]);
    const items = [1, 2, 2, 3, 4, 5, 6, 7].map((line) => ({ file: 'src/wide.ts', line, reason: `r${line}` }));
    const res = run(out({ review_focus: items }), [wide]);
    expect(res.review_focus.map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(res.dropped.review_focus).toBe(0); // caps are not counted
  });
});

describe('risk references', () => {
  it('removes an invented reference and keeps the real one (AC-73)', () => {
    const res = run(out({ risks: [risk({ file_refs: ['src/invented.ts', 'src/a.ts'] })] }));
    expect(res.risks[0]?.file_refs).toEqual(['src/a.ts']);
    expect(res.dropped.risks).toBe(0);
  });

  it('drops a risk whose references are all invented, and counts it (AC-73, AC-82)', () => {
    const res = run(out({ risks: [risk({ file_refs: ['src/invented.ts', 'a.ts:x'] })] }));
    expect(res.risks).toEqual([]);
    expect(res.dropped.risks).toBe(1);
  });

  it('removes a reference that breaks the grammar (AC-74)', () => {
    const res = run(out({ risks: [risk({ file_refs: ['src/a.ts:0', 'src/a.ts:9-3', 'src/a.ts:3'] })] }));
    expect(res.risks[0]?.file_refs).toEqual(['src/a.ts']); // :3 is outside 12-18 -> bare path
  });

  it('a range outside the changed ranges becomes the bare path; an intersecting one is kept (AC-75)', () => {
    const res = run(out({ risks: [risk({ file_refs: ['src/a.ts:40-52', 'src/a.ts:15-30', 'src/a.ts:12'] })] }));
    expect(res.risks[0]?.file_refs).toEqual(['src/a.ts', 'src/a.ts:15-30', 'src/a.ts:12']);
  });

  it('a PR file without a patch keeps its range as given (AC-78)', () => {
    const res = run(out({ risks: [risk({ file_refs: ['assets/logo.png:5-9'] })] }), [BINARY]);
    expect(res.risks[0]?.file_refs).toEqual(['assets/logo.png:5-9']);
  });

  it('a blast-only range is kept only when it contains a caller line (AC-97)', () => {
    const res = run(
      out({ risks: [risk({ file_refs: ['src/server.ts:80-90', 'src/server.ts:10-20', 'src/server.ts'] })] }),
      [A],
      callers({ 'src/server.ts': [88] }),
    );
    expect(res.risks[0]?.file_refs).toEqual(['src/server.ts:80-90', 'src/server.ts', 'src/server.ts']);
  });

  it('a blast-only file is unknown when blast is missing (AC-58)', () => {
    const res = run(out({ risks: [risk({ file_refs: ['src/server.ts'] })] }), [A], null);
    expect(res.risks).toEqual([]);
    expect(res.dropped.risks).toBe(1);
  });

  it('stores normalised paths', () => {
    const res = run(out({ risks: [risk({ file_refs: ['./src\\a.ts:13'] })] }));
    expect(res.risks[0]?.file_refs).toEqual(['src/a.ts:13']);
  });
});

describe('caps and text limits', () => {
  it('keeps at most 5 risks, high then medium then low, ties in model order (AC-79)', () => {
    const sevs: Risk['severity'][] = ['low', 'high', 'medium', 'low', 'high', 'medium', 'low'];
    const res = run(out({ risks: sevs.map((severity, i) => risk({ severity, title: `r${i}` })) }));
    expect(res.risks.map((r) => r.title)).toEqual(['r1', 'r4', 'r2', 'r5', 'r0']);
    expect(res.dropped.risks).toBe(0);
  });

  it('cuts text to 400 / 120 / 600 / 200 (AC-81)', () => {
    const wide = file('src/wide.ts', [{ start: 1, end: 9 }]);
    const res = run(
      out({
        summary: 's'.repeat(450),
        risks: [risk({ title: 't'.repeat(150), explanation: 'e'.repeat(700), file_refs: ['src/wide.ts'] })],
        review_focus: [{ file: 'src/wide.ts', line: 1, reason: 'r'.repeat(250) }],
      }),
      [wide],
    );
    expect(res.summary).toHaveLength(400);
    expect(res.risks[0]?.title).toHaveLength(120);
    expect(res.risks[0]?.explanation).toHaveLength(600);
    expect(res.review_focus[0]?.reason).toHaveLength(200);
  });

  it('keeps an unknown risk kind as is (AC-25)', () => {
    expect(run(out({ risks: [risk({ kind: 'license' })] })).risks[0]?.kind).toBe('license');
  });
});
