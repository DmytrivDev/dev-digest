import { describe, it, expect } from 'vitest';
import {
  approxTokens,
  categoryOf,
  decodeDoc,
  hasControlChar,
  hasExcludedSegment,
  isDocPath,
  orderRunDocs,
  pcBaseMismatchLine,
  pcCheckoutLine,
  pcNotClonedLine,
  pcSkipLine,
  pcSummaryLine,
  selectDocs,
  selectInherited,
  splitPath,
  validateDocPath,
} from '../src/modules/project-context/helpers.js';

describe('selectDocs — listing rule (AC-2, AC-3, AC-5, AC-7)', () => {
  it('keeps .md and .markdown case-insensitively (AC-2)', () => {
    const { docs } = selectDocs(['a.md', 'b.MARKDOWN', 'c.Md', 'd.txt', 'e.mdx', 'md']);
    expect(docs).toEqual(['a.md', 'b.MARKDOWN', 'c.Md']);
    expect(isDocPath('x.MARKDOWN')).toBe(true);
  });

  it('drops a file under each excluded directory (AC-2)', () => {
    const paths = [
      'keep.md',
      'node_modules/x/README.md',
      'dist/a.md',
      'web/.next/b.md',
      'vendor/c.md',
      '.git/d.md',
      'sub/vendor/e.md',
      '.claude/agents/reviewer.md',
      'pkg/.claude/skills/x/SKILL.md',
      'docs/vendored.md',
      'docs/claude.md',
    ];
    expect(selectDocs(paths).docs).toEqual(['docs/claude.md', 'docs/vendored.md', 'keep.md']);
    expect(hasExcludedSegment('a/node_modules/b.md')).toBe(true);
    expect(hasExcludedSegment('a/node_modules.md')).toBe(false);
  });

  it('orders by code point, not locale (AC-3)', () => {
    const shuffled = ['b.md', 'a.md', 'B.md', 'docs/z.md', 'Docs/a.md', '_x.md'];
    expect(selectDocs(shuffled).docs).toEqual([
      'B.md',
      'Docs/a.md',
      '_x.md',
      'a.md',
      'b.md',
      'docs/z.md',
    ]);
  });

  it('caps at 500 and reports the total (AC-5)', () => {
    const paths = Array.from({ length: 501 }, (_, i) => `docs/${String(i).padStart(4, '0')}.md`);
    const r = selectDocs(paths);
    expect(r.docs).toHaveLength(500);
    expect(r.total).toBe(501);
    expect(r.truncated).toBe(true);
    expect(r.docs[0]).toBe('docs/0000.md');
  });

  it('does not flag exactly 500 as truncated', () => {
    const paths = Array.from({ length: 500 }, (_, i) => `d/${i}.md`);
    const r = selectDocs(paths);
    expect(r).toMatchObject({ total: 500, truncated: false });
  });

  it('leaves out a path with a control character (AC-7)', () => {
    expect(selectDocs(['ok.md', 'bad\nname.md', 'tab\there.md', 'del\u007f.md']).docs).toEqual([
      'ok.md',
    ]);
    expect(hasControlChar('a\u0000b')).toBe(true);
    expect(hasControlChar('a b')).toBe(false);
  });
});

describe('categoryOf (AC-4)', () => {
  it.each([
    ['specs/a.md', 'specs'],
    ['server/INSIGHTS.md', 'insights'],
    ['insights/x.md', 'insights'],
    ['docs/a.md', 'docs'],
    ['README.md', 'docs'],
    ['server/specs/INSIGHTS.md', 'specs'],
    ['server/insights.md', 'insights'],
  ])('%s -> %s', (path, expected) => {
    expect(categoryOf(path)).toBe(expected);
  });
});

describe('splitPath / approxTokens (AC-10, AC-41)', () => {
  it('splits name and folder', () => {
    expect(splitPath('a/b/c.md')).toEqual({ name: 'c.md', folder: 'a/b' });
    expect(splitPath('README.md')).toEqual({ name: 'README.md', folder: '' });
  });

  it('is ceil(chars / 4)', () => {
    expect(approxTokens('0123456789')).toBe(3);
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('abcd')).toBe(1);
  });
});

describe('decodeDoc (AC-57, AC-73)', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('decodes valid UTF-8, keeping a BOM', () => {
    expect(decodeDoc(enc('héllo'))).toEqual({ ok: true, text: 'héllo' });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61]);
    expect(decodeDoc(withBom)).toEqual({ ok: true, text: '\ufeffa' });
  });

  it('rejects a NUL byte', () => {
    expect(decodeDoc(new Uint8Array([0x61, 0x00, 0x62]))).toEqual({ ok: false });
  });

  it('rejects invalid UTF-8', () => {
    expect(decodeDoc(new Uint8Array([0xff, 0xfe, 0x41]))).toEqual({ ok: false });
    expect(decodeDoc(new Uint8Array([0xc3, 0x28]))).toEqual({ ok: false });
  });

  it('accepts an empty file', () => {
    expect(decodeDoc(new Uint8Array())).toEqual({ ok: true, text: '' });
  });
});

describe('validateDocPath (AC-70)', () => {
  it('accepts a plain relative markdown path', () => {
    expect(validateDocPath('specs/a.md')).toBe(true);
    expect(validateDocPath('docs/Guide.MARKDOWN')).toBe(true);
    expect(validateDocPath('a..b/c.md')).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['absolute POSIX', '/etc/a.md'],
    ['backslash-rooted', '\\a.md'],
    ['drive letter', 'C:\\docs\\a.md'],
    ['drive letter with slash', 'C:/a.md'],
    ['.. segment', '../a.md'],
    ['.. in the middle', 'docs/../../a.md'],
    ['.. with backslash', 'docs\\..\\a.md'],
    ['url scheme', 'https://example.com/a.md'],
    ['file scheme', 'file:///etc/a.md'],
    ['protocol-relative', '//host/a.md'],
    ['control char', 'a\nb.md'],
    ['NUL', 'a\u0000.md'],
    ['wrong extension', 'a.txt'],
    ['no extension', 'README'],
  ])('rejects %s', (_label, path) => {
    expect(validateDocPath(path)).toBe(false);
  });
});

describe('orderRunDocs (AC-47..AC-49)', () => {
  it('agent first, then each enabled skill in link order', () => {
    expect(
      orderRunDocs(['a'], [
        { enabled: true, paths: ['b'] },
        { enabled: true, paths: ['c'] },
      ]),
    ).toEqual(['a', 'b', 'c']);
  });

  it('a duplicate keeps its first position', () => {
    expect(orderRunDocs(['a', 'b'], [{ enabled: true, paths: ['b', 'c'] }])).toEqual(['a', 'b', 'c']);
    expect(
      orderRunDocs([], [
        { enabled: true, paths: ['x', 'y'] },
        { enabled: true, paths: ['y', 'x', 'z'] },
      ]),
    ).toEqual(['x', 'y', 'z']);
  });

  it('a disabled skill contributes nothing', () => {
    expect(
      orderRunDocs(['a'], [
        { enabled: false, paths: ['b'] },
        { enabled: true, paths: ['c'] },
      ]),
    ).toEqual(['a', 'c']);
  });

  it('no attachments at all -> empty', () => {
    expect(orderRunDocs([], [])).toEqual([]);
  });
});

describe('selectInherited (AC-40)', () => {
  const skills = [
    { id: 's1', name: 'One', enabled: true, paths: ['b', 'c'] },
    { id: 's2', name: 'Two', enabled: true, paths: ['c', 'd'] },
    { id: 's3', name: 'Three', enabled: false, paths: ['e'] },
  ];

  it('enabled skills only, minus direct paths, first skill wins', () => {
    expect(selectInherited(['b'], skills)).toEqual([
      { path: 'c', skill_id: 's1', skill_name: 'One' },
      { path: 'd', skill_id: 's2', skill_name: 'Two' },
    ]);
  });

  it('is empty without linked skills', () => {
    expect(selectInherited(['a'], [])).toEqual([]);
  });
});

describe('Run Log line builders', () => {
  it('produce the exact strings', () => {
    expect(pcCheckoutLine('main', 'abc123')).toBe('project context: read from clone checkout main @ abc123');
    expect(pcBaseMismatchLine('release/1.x', 'main')).toBe(
      'project context: base branch release/1.x differs from clone branch main — documents read from main',
    );
    expect(pcSkipLine('docs/a.md', 'missing')).toBe('project context: skipped docs/a.md — missing');
    expect(pcSkipLine('docs/a.md', 'unreadable')).toBe('project context: skipped docs/a.md — unreadable');
    expect(pcSkipLine('docs/a.md', 'outside_clone')).toBe(
      'project context: skipped docs/a.md — outside_clone',
    );
    expect(pcNotClonedLine()).toBe('project context: skipped — repository not cloned');
    expect(pcSummaryLine(2, 1)).toBe('project context: 2 document(s) attached, 1 skipped');
  });
});
