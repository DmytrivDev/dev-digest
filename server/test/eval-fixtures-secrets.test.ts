/**
 * NFR-1: no realistic Stripe-shaped secret in the seed or in any eval fixture. GitHub push
 * protection rejects a push whose history contains `sk_live_` + 20 alphanumerics, and nothing
 * else local catches it (`server/INSIGHTS.md`, 2026-09-23). Placeholders are `sk_live_xxx`.
 * Pure file reads, no Docker.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SECRET = /sk_live_[0-9A-Za-z]{20,}/;
// Anchored on cwd (the server package), not import.meta.url — the project's vendor-sync test does the same.
const root = process.cwd();

const evalTestSources = readdirSync(join(root, 'test'))
  .filter((f) => /^eval-.*\.ts$/.test(f) || f === 'reviews-eval-fields.it.test.ts')
  .map((f) => join('test', f));

const files = [
  join('src', 'db', 'seed.ts'),
  join('src', 'db', 'seed-eval.ts'),
  join('src', 'db', 'seed-pulls.ts'),
  ...evalTestSources,
];

describe('eval fixtures hold no realistic secret literal (NFR-1)', () => {
  it('scans the seed and every eval test source', () => {
    // The glob must have found the eval tests, or the scan below proves nothing.
    expect(evalTestSources.length).toBeGreaterThanOrEqual(5);
    expect(files).toContain(join('src', 'db', 'seed-eval.ts'));
  });

  it.each(files)('%s', (file) => {
    const source = readFileSync(join(root, file), 'utf8');
    expect(SECRET.test(source)).toBe(false);
  });

  it('the scanner itself catches a realistic literal and passes the placeholder', () => {
    expect(SECRET.test('stripeKey: "sk_live_' + 'A1b2C3d4E5f6G7h8I9j0K1"')).toBe(true);
    expect(SECRET.test("stripeKey: 'sk_live_xxx'")).toBe(false);
  });
});
