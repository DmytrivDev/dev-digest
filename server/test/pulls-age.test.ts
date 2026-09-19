import { describe, it, expect } from 'vitest';
import { prAgeLabel } from '../src/modules/pulls/age.js';

describe('prAgeLabel', () => {
  it('labels a pull request opened three days ago', () => {
    const now = new Date('2026-09-19T12:00:00.000Z');
    const openedAt = new Date('2026-09-16T12:00:00.000Z');
    expect(prAgeLabel(openedAt, now)).toBe('3 days');
  });
});
