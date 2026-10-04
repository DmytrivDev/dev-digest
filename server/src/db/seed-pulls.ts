/**
 * Seed data for PR #482 (`acme/payments-api`), used by `seed.ts` only.
 *
 * Nine files covering all five Smart Diff roles, so a clean checkout shows
 * every group non-empty. Two carry a real unified-diff patch so the seeded
 * findings (src/config.ts:12, src/api/users.ts:45) anchor on a rendered line
 * — the other seven keep their previous shape (no patch).
 *
 * `src/db/` must not import from `src/modules/` (`db-not-to-modules`,
 * `.dependency-cruiser.cjs`), so this file is plain data — no classifier
 * import, no logic.
 */
import type { PrBrief } from '@devdigest/shared';

export interface SeedPrFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/**
 * `src/config.ts` — 3 lines of context (old 9-11) then 4 added lines (new
 * 12-15), so the finding on line 12 lands on the FIRST added line.
 */
const CONFIG_PATCH = `@@ -9,4 +9,8 @@
 export const config = {
   port: 3000,
   env: process.env.NODE_ENV ?? 'production',
+  stripeKey: 'sk_live_xxx',
+  redisUrl: process.env.REDIS_URL,
+  rateLimitWindow: 60,
+  rateLimitMax: 100,
 };`;

/**
 * `src/api/users.ts` — 2 lines of context, 2 removed lines, 1 line of
 * context, then 7 added lines (new 43-49), so the finding on line 45 lands
 * on the third added line (the per-user query inside the new loop).
 */
const USERS_PATCH = `@@ -40,5 +40,10 @@
 export async function listUsers(ids) {
   const users = [];
-  const rows = await db.getUsersBatch(ids);
-  return rows;
   for (const id of ids) {
+  const rows = await db.getUsers(ids);
+  for (const row of rows) {
+    users.push(await db.getUserDetail(row.id));
+  }
+  return users;
+}
+`;

export const SEED_PR_482_FILES: SeedPrFile[] = [
  { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0, patch: null },
  { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6, patch: null },
  { path: 'src/config.ts', additions: 4, deletions: 0, patch: CONFIG_PATCH },
  { path: 'src/api/users.ts', additions: 7, deletions: 2, patch: USERS_PATCH },
  { path: 'test/ratelimit.test.ts', additions: 52, deletions: 0, patch: null },
  { path: 'src/middleware/index.ts', additions: 2, deletions: 1, patch: null },
  { path: 'docs/rate-limiting.md', additions: 18, deletions: 0, patch: null },
  { path: 'README.md', additions: 3, deletions: 0, patch: null },
  { path: 'pnpm-lock.yaml', additions: 6, deletions: 0, patch: null },
];

/**
 * The stored PR Brief of PR #482 (SPEC-03) — what the Overview shows on a clean checkout
 * without any provider key. `head_sha` equals the seeded PR's head, so it reads as fresh.
 *
 * Every `file_refs` entry is grounded in `SEED_PR_482_FILES` (the config patch's new range is
 * 9-16, users' is 40-49; ratelimit and the lockfile carry no patch, so a path suffices), which
 * means `validateBrief` removes nothing from it (`brief-seed.it.test.ts`). The `risks` field is
 * the contract's `Risks` wrapper, not a bare array.
 *
 * Plain data on purpose (`db-not-to-modules`): the type comes in as `import type`, no logic.
 */
export const SEED_PR_482_BRIEF = {
  summary:
    'Adds a token-bucket rate limiter in front of the public API; a live-looking Stripe key is committed in config and the user list now queries once per user.',
  risks: {
    risks: [
      {
        kind: 'security',
        severity: 'high',
        title: 'Secret committed in config',
        explanation: 'A Stripe-style secret key is written into src/config.ts instead of an env var.',
        file_refs: ['src/config.ts:12'],
      },
      {
        kind: 'perf',
        severity: 'medium',
        title: 'Per-request limiter overhead',
        explanation: 'The limiter runs on every public request and keeps its bucket state in memory.',
        file_refs: ['src/middleware/ratelimit.ts'],
      },
      {
        kind: 'deps',
        severity: 'low',
        title: 'Lockfile changed',
        explanation: 'The lockfile moved with the change; check the added dependency is intended.',
        file_refs: ['pnpm-lock.yaml'],
      },
    ],
  },
  review_focus: [
    { file: 'src/api/users.ts', line: 45, reason: 'one query per user inside the loop' },
    { file: 'src/config.ts', line: 12, reason: 'hard-coded secret' },
  ],
  intent: {
    intent:
      'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
    in_scope: ['Add a token-bucket limiter middleware', 'Apply it to the public API endpoints'],
    out_of_scope: ['Changing the authentication model'],
  },
  blast: null,
  head_sha: 'a1b2c3d4e5f6',
  generated_at: '2026-10-01T10:00:00.000Z',
  model: 'openai/gpt-4.1',
  usage: { llm_calls: 1, tokens_in: 8200, tokens_out: 1300, cost_usd: 0.014, duration_ms: 9400 },
  inputs: [
    { source: 'intent', status: 'used' },
    { source: 'blast', status: 'missing', reason: 'no_data' },
    { source: 'diff_stats', status: 'used' },
    { source: 'description', status: 'used' },
    { source: 'linked_issue', status: 'missing', reason: 'no_linked_issue' },
    { source: 'specs', status: 'missing', reason: 'none_attached' },
  ],
  dropped: { risks: 0, review_focus: 0 },
} satisfies PrBrief;
