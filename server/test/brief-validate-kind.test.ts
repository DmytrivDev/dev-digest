import { describe, expect, it } from 'vitest';
import { normalizeKind, validateBrief } from '../src/modules/brief/helpers/validate.js';
import type { BriefModelOutput, FileStat } from '../src/modules/brief/types.js';

/** F10 — a risk `kind` is the model's free text: kept only as a short lowercase token. */

const A: FileStat = {
  path: 'src/a.ts',
  role: 'core',
  additions: 1,
  deletions: 0,
  ranges: [{ start: 1, end: 9 }],
  hasPatch: true,
};

const kindOf = (kind: string): string => {
  const output: BriefModelOutput = {
    summary: 's',
    risks: [{ kind, title: 't', explanation: 'e', severity: 'low', file_refs: ['src/a.ts'] }],
    review_focus: [],
  };
  return validateBrief({ output, prFiles: [A], blastCallers: null }).risks[0]!.kind;
};

describe('risk kind normalisation (F10)', () => {
  it('keeps the prompt vocabulary and other short lowercase tokens (AC-25: not a closed enum)', () => {
    for (const kind of ['security', 'db_migration', 'breaking_api', 'perf', 'deps', 'license']) {
      expect(kindOf(kind)).toBe(kind);
    }
  });

  it('lowercases and trims', () => {
    expect(kindOf('  Security ')).toBe('security');
  });

  it('replaces a prototype key with the neutral value', () => {
    for (const kind of ['constructor', '__proto__', 'Constructor', ' __PROTO__ ']) {
      expect(kindOf(kind)).toBe('other');
    }
  });

  it('replaces anything that is not a short [a-z_] token', () => {
    const bad = ['', 'a-b', 'a b', 'x'.repeat(33), 'db2', '<script>', 'sécurité', 'a\nb'];
    for (const kind of bad) expect(normalizeKind(kind)).toBe('other');
    expect(normalizeKind('x'.repeat(32))).toBe('x'.repeat(32));
  });
});
