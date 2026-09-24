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
