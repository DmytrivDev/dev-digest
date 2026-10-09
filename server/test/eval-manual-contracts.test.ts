import { describe, it, expect } from 'vitest';
import {
  EVAL_CASE_MAX_BYTES,
  EvalCase,
  EvalCaseCreate,
  EvalCaseInputErrorCode,
  EvalCaseUpdate,
  EvalTrendPoint,
} from '@devdigest/shared';

/**
 * SPEC-05 manual-case contracts — the create/update bodies, the nullable manual-case
 * shape and the optional trend-point fields. Importing the barrel also proves the new
 * schemas are declared in an order that has no TDZ crash.
 */

const expectation = {
  kind: 'must_find' as const,
  file: 'src/a.ts',
  start_line: 1,
  end_line: 2,
};

const validCreate = {
  name: 'sql-injection',
  input_diff: '+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n x\n+y\n',
  expectation,
};

const NUL = String.fromCharCode(0);

describe('EvalCaseCreate', () => {
  it('accepts a minimal valid body (no input_meta, no notes)', () => {
    expect(EvalCaseCreate.safeParse(validCreate).success).toBe(true);
  });

  it('accepts input_meta with only a title, and with a null body', () => {
    expect(EvalCaseCreate.safeParse({ ...validCreate, input_meta: { title: 'T' } }).success).toBe(true);
    expect(
      EvalCaseCreate.safeParse({ ...validCreate, input_meta: { title: 'T', body: null } }).success,
    ).toBe(true);
  });

  it('rejects an unknown key, at the top level and inside input_meta', () => {
    expect(EvalCaseCreate.safeParse({ ...validCreate, extra: 1 }).success).toBe(false);
    expect(
      EvalCaseCreate.safeParse({ ...validCreate, input_meta: { title: 'T', pr_number: 3 } }).success,
    ).toBe(false);
  });

  it('rejects a blank name and a 61-char name, accepts a 60-char one', () => {
    expect(EvalCaseCreate.safeParse({ ...validCreate, name: '   ' }).success).toBe(false);
    expect(EvalCaseCreate.safeParse({ ...validCreate, name: 'a'.repeat(61) }).success).toBe(false);
    expect(EvalCaseCreate.safeParse({ ...validCreate, name: 'a'.repeat(60) }).success).toBe(true);
  });

  it('trims the name before measuring it', () => {
    const r = EvalCaseCreate.safeParse({ ...validCreate, name: `  ${'a'.repeat(60)}  ` });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('a'.repeat(60));
  });

  it.each([
    ['name', { name: `a${NUL}b` }],
    ['notes', { notes: `a${NUL}b` }],
    ['input_diff', { input_diff: `+++ b/a${NUL}\n` }],
    ['input_meta.title', { input_meta: { title: `a${NUL}` } }],
    ['input_meta.body', { input_meta: { body: `a${NUL}` } }],
  ])('rejects a NUL character in %s', (_field, patch) => {
    expect(EvalCaseCreate.safeParse({ ...validCreate, ...patch }).success).toBe(false);
  });

  it('rejects title + body of 200 KB + 1 byte, accepts exactly 200 KB', () => {
    const half = EVAL_CASE_MAX_BYTES / 2;
    const over = EvalCaseCreate.safeParse({
      ...validCreate,
      input_meta: { title: 'a'.repeat(half), body: 'b'.repeat(half + 1) },
    });
    expect(over.success).toBe(false);
    if (!over.success) expect(over.error.issues[0]?.path).toEqual(['input_meta']);
    expect(
      EvalCaseCreate.safeParse({
        ...validCreate,
        input_meta: { title: 'a'.repeat(half), body: 'b'.repeat(half) },
      }).success,
    ).toBe(true);
  });

  it('counts UTF-8 bytes, not characters, for the meta budget', () => {
    // 'é' is 2 bytes: 100 KB of characters is 200 KB of bytes, +1 char tips it over.
    const chars = EVAL_CASE_MAX_BYTES / 2;
    expect(
      EvalCaseCreate.safeParse({ ...validCreate, input_meta: { title: 'é'.repeat(chars) } }).success,
    ).toBe(true);
    expect(
      EvalCaseCreate.safeParse({ ...validCreate, input_meta: { title: 'é'.repeat(chars + 1) } }).success,
    ).toBe(false);
  });

  it('accepts a 300 KB input_diff so the service can answer diff_too_large', () => {
    const big = `+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+${'x'.repeat(300 * 1024)}\n`;
    expect(EvalCaseCreate.safeParse({ ...validCreate, input_diff: big }).success).toBe(true);
  });

  it('rejects a missing expectation or input_diff', () => {
    const { expectation: _e, ...noExp } = validCreate;
    const { input_diff: _d, ...noDiff } = validCreate;
    expect(EvalCaseCreate.safeParse(noExp).success).toBe(false);
    expect(EvalCaseCreate.safeParse(noDiff).success).toBe(false);
  });
});

describe('EvalCaseUpdate', () => {
  it('accepts input_diff and input_meta with an explicit null body', () => {
    expect(EvalCaseUpdate.safeParse({ input_diff: validCreate.input_diff }).success).toBe(true);
    expect(EvalCaseUpdate.safeParse({ input_meta: { title: 'T', body: null } }).success).toBe(true);
  });

  it('rejects input_meta without body, a 61-char name and an unknown key', () => {
    expect(EvalCaseUpdate.safeParse({ input_meta: { title: 'T' } }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ name: 'a'.repeat(61) }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ nope: 1 }).success).toBe(false);
  });

  it('rejects a NUL in name, notes, input_diff and input_meta', () => {
    expect(EvalCaseUpdate.safeParse({ name: `a${NUL}` }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ notes: `a${NUL}` }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ input_diff: `a${NUL}` }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ input_meta: { title: `a${NUL}`, body: null } }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ input_meta: { title: 'T', body: `a${NUL}` } }).success).toBe(false);
  });

  it('rejects title + body over the 200 KB budget', () => {
    const half = EVAL_CASE_MAX_BYTES / 2;
    expect(
      EvalCaseUpdate.safeParse({ input_meta: { title: 'a'.repeat(half), body: 'b'.repeat(half + 1) } })
        .success,
    ).toBe(false);
  });
});

describe('EvalCase', () => {
  const base = {
    id: 'c1',
    agent_id: 'a1',
    name: 'n',
    notes: null,
    input_diff: validCreate.input_diff,
    expectation,
    created_at: '2026-10-08T10:00:00.000Z',
    last_outcome: null,
  };

  it('parses a manual case (origin manual, source/labels/pr_number null)', () => {
    const r = EvalCase.safeParse({
      ...base,
      origin: 'manual',
      labels: null,
      source: null,
      input_meta: { pr_number: null, title: '', body: null },
    });
    expect(r.success).toBe(true);
  });

  it('parses a finding-born case', () => {
    const r = EvalCase.safeParse({
      ...base,
      origin: 'finding',
      labels: { severity: 'critical', category: 'security', title: 'T' },
      source: { finding_id: 'f1', pr_number: 7, repo: 'o/r', available: true },
      input_meta: { pr_number: 7, title: 'T', body: null },
    });
    expect(r.success).toBe(true);
  });

  it('requires origin', () => {
    const r = EvalCase.safeParse({
      ...base,
      labels: null,
      source: null,
      input_meta: { pr_number: null, title: '', body: null },
    });
    expect(r.success).toBe(false);
  });
});

describe('EvalTrendPoint', () => {
  const point = { started_at: '2026-10-08T10:00:00.000Z', recall: 1, precision: 0.5, citation_accuracy: null };

  it('parses without the new fields', () => {
    expect(EvalTrendPoint.safeParse(point).success).toBe(true);
  });

  it('parses with run_id, agent_version and a null or numeric cost_usd', () => {
    expect(
      EvalTrendPoint.safeParse({ ...point, run_id: 'r1', agent_version: 3, cost_usd: null }).success,
    ).toBe(true);
    expect(
      EvalTrendPoint.safeParse({ ...point, run_id: 'r1', agent_version: 3, cost_usd: 0.02 }).success,
    ).toBe(true);
  });
});

describe('EvalCaseInputErrorCode', () => {
  it('lists the four input codes', () => {
    expect(EvalCaseInputErrorCode.options).toEqual([
      'diff_too_large',
      'diff_unparseable',
      'multi_file_diff',
      'diff_frozen',
    ]);
  });
});
