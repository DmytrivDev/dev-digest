import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { toRel } from '../src/adapters/depgraph/index.js';

// file_edges are joined against symbols.path / references.from_path, which are
// '/'-separated on every OS. A '\' here empties the graph on Windows.
describe('depgraph toRel', () => {
  const root = resolve('clone-root');

  it('returns a POSIX repo-relative path for an absolute cruise path', () => {
    expect(toRel(root, join(root, 'server', 'src', 'a.ts'))).toBe('server/src/a.ts');
  });

  it('returns a POSIX repo-relative path for a cwd-relative cruise path', () => {
    const cwdRelative = join('clone-root', 'server', 'src', 'b.ts');
    expect(toRel(root, cwdRelative)).toBe('server/src/b.ts');
  });
});
