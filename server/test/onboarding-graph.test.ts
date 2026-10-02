import { describe, it, expect } from 'vitest';
import {
  criticalPaths,
  dependencyChains,
  packageDiagram,
  packageDirOf,
  pathSections,
  readingPath,
} from '../src/modules/onboarding/helpers/graph.js';
import type { RankedFile } from '../src/modules/onboarding/types.js';

function ranked(paths: string[]): RankedFile[] {
  // Descending rank in the given order.
  return paths.map((path, i) => {
    const rank = 1 - i / 100;
    return { path, pagerank: rank, hotness: 0, rank };
  });
}

describe('readingPath (AC-61)', () => {
  it('takes the 8 highest-ranked non-excluded files in rank order', () => {
    const paths = [
      'src/a.ts',
      'src/a.test.ts',
      'src/b.ts',
      'src/c.ts',
      'src/c.spec.ts',
      'src/d.ts',
      'src/e.ts',
      'src/f.ts',
      'src/g.ts',
      'src/h.ts',
      'src/i.ts',
      'src/j.ts',
    ];
    expect(readingPath(ranked(paths)).map((r) => r.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
      'src/f.ts',
      'src/g.ts',
      'src/h.ts',
    ]);
  });

  it('skips a path with a control character', () => {
    expect(readingPath(ranked(['a\n.ts', 'b.ts'])).map((r) => r.path)).toEqual(['b.ts']);
  });
});

describe('dependencyChains / criticalPaths (AC-62, AC-63)', () => {
  it('walks chains in root-rank order, chain order inside a chain, first appearance wins', () => {
    // Roots a > d. a -> b -> c ; d -> b -> c (b and c are already placed by a's chain).
    const files = ranked(['src/a.ts', 'src/d.ts', 'src/b.ts', 'src/c.ts', 'src/e.ts']);
    const edges = [
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'src/b.ts', to: 'src/c.ts' },
      { from: 'src/d.ts', to: 'src/b.ts' },
    ];
    // Every ranked file is a root (5 of them): b itself roots a short chain [b, c].
    const chains = dependencyChains(files, edges);
    expect(chains).toEqual([
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      ['src/d.ts', 'src/b.ts', 'src/c.ts'],
      ['src/b.ts', 'src/c.ts'],
    ]);
    expect(criticalPaths(chains, edges).map((r) => r.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
    ]);
  });

  it('yields a, b, c, d, e for chains [a,b,c] and [d,b,e] with root a ranked above d', () => {
    const edges = [{ from: 'src/a.ts', to: 'src/b.ts' }];
    const rows = criticalPaths(
      [
        ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        ['src/d.ts', 'src/b.ts', 'src/e.ts'],
      ],
      edges,
    );
    expect(rows.map((r) => r.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
    ]);
  });

  it('follows the highest tour-ranked import target and never revisits a file', () => {
    const files = ranked(['src/a.ts', 'src/hi.ts', 'src/lo.ts']);
    const edges = [
      { from: 'src/a.ts', to: 'src/lo.ts' },
      { from: 'src/a.ts', to: 'src/hi.ts' },
      { from: 'src/hi.ts', to: 'src/a.ts' },
    ];
    // a -> hi (higher rank), hi -> a is a cycle back to the root, so the chain stops.
    expect(dependencyChains(files, edges)[0]).toEqual(['src/a.ts', 'src/hi.ts']);
  });

  it('resolves equal-ranked targets by path', () => {
    const files: RankedFile[] = [
      { path: 'src/a.ts', pagerank: 1, hotness: 0, rank: 1 },
      { path: 'src/z.ts', pagerank: 0.5, hotness: 0, rank: 0.5 },
      { path: 'src/m.ts', pagerank: 0.5, hotness: 0, rank: 0.5 },
    ];
    const edges = [
      { from: 'src/a.ts', to: 'src/z.ts' },
      { from: 'src/a.ts', to: 'src/m.ts' },
    ];
    expect(dependencyChains(files, edges)[0]).toEqual(['src/a.ts', 'src/m.ts']);
  });

  it('keeps at most 6 distinct files and skips excluded ones', () => {
    const chains = [
      ['src/a.ts', 'src/a.test.ts', 'src/b.ts'],
      ['src/c.ts', 'src/d.ts', 'src/e.ts'],
      ['src/f.ts', 'src/g.ts', 'src/h.ts'],
    ];
    const rows = criticalPaths(chains, []);
    expect(rows.map((r) => r.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
      'src/f.ts',
    ]);
  });

  it('counts distinct importers: a file imported by 3 files reports 3', () => {
    const edges = [
      { from: 'src/x.ts', to: 'src/core.ts' },
      { from: 'src/y.ts', to: 'src/core.ts' },
      { from: 'src/z.ts', to: 'src/core.ts' },
      { from: 'src/z.ts', to: 'src/core.ts' },
    ];
    const rows = criticalPaths([['src/x.ts', 'src/core.ts']], edges);
    expect(rows.find((r) => r.path === 'src/core.ts')?.imported_by).toBe(3);
  });
});

describe('pathSections (AC-64, AC-65)', () => {
  it('returns critical paths empty with no_import_graph when there are no edges', () => {
    const s = pathSections({ ranked: ranked(['src/a.ts', 'src/b.ts']), edges: [] });
    expect(s.critical).toEqual({ items: [], empty_reason: 'no_import_graph' });
    expect(s.reading.paths).toEqual(['src/a.ts', 'src/b.ts']);
    expect(s.reading.empty_reason).toBeNull();
  });

  it('returns both sections empty with unsupported_language for a zero-file index', () => {
    const s = pathSections({ ranked: [], edges: [] });
    expect(s.reading).toEqual({ paths: [], empty_reason: 'unsupported_language' });
    expect(s.critical).toEqual({ items: [], empty_reason: 'unsupported_language' });
  });

  it('lets unsupported_language win over the edge rule when the caller says so', () => {
    const s = pathSections({
      ranked: ranked(['a.ts']),
      edges: [{ from: 'a.ts', to: 'b.ts' }],
      unsupportedLanguage: true,
    });
    expect(s.reading.empty_reason).toBe('unsupported_language');
    expect(s.critical.empty_reason).toBe('unsupported_language');
  });

  it('fills both sections when the graph has edges', () => {
    const s = pathSections({
      ranked: ranked(['src/a.ts', 'src/b.ts']),
      edges: [{ from: 'src/a.ts', to: 'src/b.ts' }],
    });
    expect(s.critical.empty_reason).toBeNull();
    expect(s.critical.items).toEqual([
      { path: 'src/a.ts', imported_by: 0 },
      { path: 'src/b.ts', imported_by: 1 },
    ]);
  });

  it('is identical across two calls on the same input', () => {
    const input = {
      ranked: ranked(['src/a.ts', 'src/b.ts', 'src/c.ts']),
      edges: [
        { from: 'src/a.ts', to: 'src/c.ts' },
        { from: 'src/a.ts', to: 'src/b.ts' },
      ],
    };
    expect(pathSections(input)).toEqual(pathSections(input));
  });
});

describe('packageDirOf', () => {
  it('maps root files, plain folders and container packages', () => {
    expect(packageDirOf('index.ts')).toBe('(root)');
    expect(packageDirOf('server/src/a.ts')).toBe('server');
    expect(packageDirOf('packages/ui/x.ts')).toBe('packages/ui');
    expect(packageDirOf('packages/x.ts')).toBe('packages');
  });
});

describe('packageDiagram (AC-82)', () => {
  const files = [
    { path: 'server/a.ts' },
    { path: 'server/b.ts' },
    { path: 'shared/c.ts' },
    { path: 'client/d.ts' },
  ];

  it('is null when there are no edges', () => {
    expect(packageDiagram(files, [])).toBeNull();
  });

  it('draws server --> shared and no edge where none exists', () => {
    const diagram = packageDiagram(files, [{ from: 'server/a.ts', to: 'shared/c.ts' }]) ?? '';
    const lines = diagram.split('\n');
    expect(lines[0]).toBe('flowchart LR');
    // server has the most files -> p0; client/shared tie at 1 file -> by name: client p1, shared p2.
    expect(lines).toContain('  p0["server"]');
    expect(lines).toContain('  p1["client"]');
    expect(lines).toContain('  p2["shared"]');
    expect(lines.filter((l) => l.includes('-->'))).toEqual(['  p0 --> p2']);
  });

  it('does not draw an edge inside one package and de-duplicates a pair', () => {
    const diagram =
      packageDiagram(files, [
        { from: 'server/a.ts', to: 'server/b.ts' },
        { from: 'server/a.ts', to: 'shared/c.ts' },
        { from: 'server/b.ts', to: 'shared/c.ts' },
      ]) ?? '';
    expect(diagram.split('\n').filter((l) => l.includes('-->'))).toEqual(['  p0 --> p2']);
  });

  it('keeps at most 12 nodes and sanitises labels', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ path: `pkg${i}/x.ts` }));
    const diagram = packageDiagram(many, [{ from: 'pkg0/x.ts', to: 'pkg1/x.ts' }]) ?? '';
    expect(diagram.split('\n').filter((l) => /^ {2}p\d+\[/.test(l))).toHaveLength(12);

    const odd = packageDiagram(
      [{ path: 'we"ird]name/x.ts' }, { path: 'b/y.ts' }],
      [{ from: 'b/y.ts', to: 'we"ird]name/x.ts' }],
    ) ?? '';
    expect(odd).toContain('["we_ird_name"]');
    expect(odd).not.toContain('"ird');
  });

  it('never draws a dot-directory (tooling) as a package', () => {
    const diagram =
      packageDiagram(
        [{ path: '.claude/hooks/x.ts' }, { path: '.claude/y.ts' }, ...files],
        [
          { from: 'server/a.ts', to: 'shared/c.ts' },
          { from: '.claude/y.ts', to: 'server/a.ts' },
        ],
      ) ?? '';
    expect(diagram).not.toContain('.claude');
    expect(diagram.split('\n').filter((l) => l.includes('-->'))).toEqual(['  p0 --> p2']);
  });

  it('lays packages without an edge out left to right with invisible links', () => {
    // The dev-digest shape: five independent packages, one import between two of them.
    const repo = [
      ...Array.from({ length: 5 }, (_, i) => ({ path: `client/c${i}.ts` })),
      ...Array.from({ length: 4 }, (_, i) => ({ path: `server/s${i}.ts` })),
      ...Array.from({ length: 3 }, (_, i) => ({ path: `mcp/m${i}.ts` })),
      ...Array.from({ length: 2 }, (_, i) => ({ path: `reviewer-core/r${i}.ts` })),
      { path: 'e2e/e.ts' },
    ];
    const diagram = packageDiagram(repo, [{ from: 'reviewer-core/r0.ts', to: 'server/s0.ts' }]) ?? '';
    // client p0, server p1, mcp p2, reviewer-core p3, e2e p4.
    expect(diagram.split('\n').slice(6)).toEqual([
      '  p3 --> p1',
      '  p0 ~~~ p2',
      '  p2 ~~~ p4',
      '  p4 ~~~ p3',
    ]);
  });

  it('breaks isolated packages into rows of at most 4', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ path: `pkg${String(i).padStart(2, '0')}/x.ts` }));
    const diagram = packageDiagram(many, [{ from: 'pkg00/x.ts', to: 'pkg01/x.ts' }]) ?? '';
    const invisible = diagram.split('\n').filter((l) => l.includes('~~~'));
    // 8 isolated: two rows of 4 (3 links each), the last row leads into p0.
    expect(invisible).toEqual([
      '  p2 ~~~ p3', '  p3 ~~~ p4', '  p4 ~~~ p5',
      '  p6 ~~~ p7', '  p7 ~~~ p8', '  p8 ~~~ p9',
      '  p9 ~~~ p0',
    ]);
  });
});
