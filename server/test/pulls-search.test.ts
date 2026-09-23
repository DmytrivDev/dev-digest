import { describe, it, expect } from 'vitest';
import { matchesTitle, filterByTitle } from '../src/modules/pulls/index.js';

describe('matchesTitle', () => {
  it('matches a plain substring', () => {
    expect(matchesTitle('rate limit', 'Add rate limiting to public API')).toBe(true);
  });

  it('treats regex characters as plain text', () => {
    expect(matchesTitle('(v2)', 'Bump client (v2)')).toBe(true);
  });
});

describe('filterByTitle', () => {
  it('keeps matching pulls in order', () => {
    const pulls = [{ title: 'Fix cost column' }, { title: 'Add search' }, { title: 'Fix age label' }];
    expect(filterByTitle(pulls, 'Fix').map((p) => p.title)).toEqual(['Fix cost column', 'Fix age label']);
  });
});
