/**
 * Seed data for PR #483 (`acme/payments-api`) and the eval suite built from it (SPEC-04), used by
 * `seed.ts` only.
 *
 * One PR, three files with real multi-hunk patches, and one Security Reviewer review with 11
 * findings: 5 accepted, 5 dismissed, 1 untriaged. Eight of the triaged ones carry an eval case
 * (4 `must_find` from accepted findings, 4 `must_not_flag` from dismissed ones); two triaged
 * findings are left without a case so "Turn into eval case" has something to do on a clean
 * checkout. The `must_not_flag` ranges sit on benign changed lines (logging, a rename, a comment,
 * an import), which is the setup for the live experiment: a prompt that flags every changed line
 * flags them and precision drops (AC-113).
 *
 * Every line range below lies on new-side lines of its file's patch (checked by
 * `test/eval-seed.it.test.ts`). Secret-shaped literals are `xxx` placeholders only — GitHub push
 * protection rejects a realistic one (`server/INSIGHTS.md`, 2026-09-23).
 *
 * `src/db/` must not import from `src/modules/` (`db-not-to-modules`), so this file is plain
 * data plus one 3-line string builder. `caseDiff` duplicates `buildCaseDiff`
 * (`modules/eval/helpers/case-diff.ts`) on purpose; `eval-seed.it.test.ts` asserts they agree.
 */
import type { SeedPrFile } from './seed-pulls.js';

export const SEED_EVAL_REPO = 'acme/payments-api';
export const SEED_PR_483_NUMBER = 483;
export const SEED_PR_483_TITLE = 'Add payment webhooks and admin export';
export const SEED_PR_483_BODY =
  'Adds a Stripe webhook receiver, an admin order export and a token hashing helper for the payments API.';
/** The built-in agent the review and every case belong to. */
export const SEED_EVAL_AGENT = 'Security Reviewer';

/** The stored diff of a case: the `diff --git` header the diff parser expects, then the hunks. */
export function caseDiff(path: string, patch: string): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${patch.replace(/(\r?\n)+$/, '')}\n`;
}

/**
 * `src/api/webhooks.ts` — two hunks (new-side 1-10 and 18-27). Line 7 is the webhook-secret
 * placeholder, 20 the unverified payload parse, 21 the (benign) log line, 23 the interpolated SQL.
 */
const WEBHOOKS_PATCH = [
  "@@ -1,7 +1,10 @@ import { Router } from 'express';",
  " import { Router } from 'express';",
  " import { db } from '../lib/db';",
  "+import { logger } from '../lib/logger';",
  "+import { stripe } from '../lib/stripe';",
  " ",
  " export const webhooks = Router();",
  "+const WEBHOOK_SECRET = 'whsec_xxx';",
  " webhooks.get('/health', (_req, res) => {",
  "   res.json({ ok: true });",
  " });",
  "@@ -14,2 +18,10 @@ webhooks.get",
  " });",
  "+webhooks.post('/stripe', async (req, res) => {",
  "+  const event = JSON.parse(req.body.toString());",
  "+  logger.info('stripe event received', event.type);",
  "+  const id = event.data.object.id;",
  "+  const order = await db.query(`SELECT * FROM orders WHERE id = '${id}'`);",
  "+  await stripe.charges.capture(order.chargeId);",
  "+  res.sendStatus(200);",
  "+});",
  " export default webhooks;",
].join('\n');

/**
 * `src/admin/export.ts` — three hunks (new-side 1-8, 13-16 and 22-25). Line 6 writes to a caller-chosen
 * path, 14-15 are the benign rename + comment, 23-25 the route with no authorization check.
 */
const EXPORT_PATCH = [
  "@@ -1,6 +1,8 @@",
  " import { db } from '../lib/db';",
  "+import { writeFileSync } from 'node:fs';",
  " ",
  " export async function exportOrders(path: string) {",
  "-  const rows = await db.query('SELECT id, total FROM orders');",
  "+  const rows = await db.query('SELECT * FROM orders');",
  "+  writeFileSync(path, JSON.stringify(rows));",
  "   return rows.length;",
  " }",
  "@@ -12,3 +13,4 @@ export function",
  " export function toRow(row: OrderRow) {",
  "-  return { orderId: row.id, total: row.total };",
  "+  // order_id is the public column name",
  "+  return { order_id: row.id, total: row.total };",
  " }",
  "@@ -20,1 +22,4 @@",
  " export const adminRoutes = Router();",
  "+adminRoutes.post('/export', (req, res) => {",
  "+  exportOrders(req.query.path as string).then((n) => res.json({ exported: n }));",
  "+});",
].join('\n');

/**
 * `src/lib/crypto.ts` — two hunks (new-side 1-3 and 8-13). Line 1 is a benign import change, 9 the
 * md5 digest, 12 the Math.random session id.
 */
const CRYPTO_PATCH = [
  "@@ -1,3 +1,3 @@",
  "-import { createHash } from 'node:crypto';",
  "+import { createHash, randomBytes } from 'node:crypto';",
  " ",
  " const SALT = process.env.TOKEN_SALT ?? '';",
  "@@ -8,3 +8,6 @@ export function hashToken",
  " export function hashToken(token: string) {",
  "-  return createHash('sha256').update(SALT + token).digest('hex');",
  "+  return createHash('md5').update(SALT + token).digest('hex');",
  " }",
  "+export function newSessionId() {",
  "+  return Math.random().toString(36).slice(2);",
  "+}",
].join('\n');

export const SEED_PR_483_FILES: SeedPrFile[] = [
  { path: 'src/api/webhooks.ts', additions: 11, deletions: 0, patch: WEBHOOKS_PATCH },
  { path: 'src/admin/export.ts', additions: 8, deletions: 2, patch: EXPORT_PATCH },
  { path: 'src/lib/crypto.ts', additions: 5, deletions: 2, patch: CRYPTO_PATCH },
];

export type SeedEvalKind = 'must_find' | 'must_not_flag';

export interface SeedEvalFinding {
  file: string;
  startLine: number;
  endLine: number;
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  category: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  /** `null` = untriaged. */
  triage: 'accepted' | 'dismissed' | null;
  /**
   * The case seeded from this finding, or `null` for none. `name` is the literal kebab slug of the
   * title (`slugifyTitle`); `eval-seed.it.test.ts` asserts they agree, which guards this copy.
   */
  evalCase: { name: string; kind: SeedEvalKind } | null;
}

/** The 11 findings of the seeded Security Reviewer review of PR #483. */
export const SEED_PR_483_FINDINGS: SeedEvalFinding[] = [
  // ---- accepted, with a `must_find` case ----
  {
    file: 'src/api/webhooks.ts',
    startLine: 20,
    endLine: 20,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Stripe webhook payload is not signature-verified',
    rationale: 'The handler parses the raw body without checking the Stripe-Signature header, so anyone can post a forged event.',
    suggestion: 'Verify the signature with stripe.webhooks.constructEvent before trusting the payload.',
    confidence: 0.95,
    triage: 'accepted',
    evalCase: { name: 'stripe-webhook-payload-is-not-signature-verified', kind: 'must_find' },
  },
  {
    file: 'src/api/webhooks.ts',
    startLine: 23,
    endLine: 23,
    severity: 'CRITICAL',
    category: 'security',
    title: 'SQL built from webhook payload by string interpolation',
    rationale: 'The order id from the event is interpolated into the query text, which allows SQL injection through a crafted webhook.',
    suggestion: 'Use a parameterised query.',
    confidence: 0.93,
    triage: 'accepted',
    evalCase: { name: 'sql-built-from-webhook-payload-by-string-interpolation', kind: 'must_find' },
  },
  {
    file: 'src/admin/export.ts',
    startLine: 6,
    endLine: 6,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Export path comes straight from the query string',
    rationale: 'The file is written to a path the caller chose, so an admin request can overwrite any file the server can write.',
    suggestion: 'Write to a fixed export directory and generate the file name server-side.',
    confidence: 0.9,
    triage: 'accepted',
    evalCase: { name: 'export-path-comes-straight-from-the-query-string', kind: 'must_find' },
  },
  {
    file: 'src/lib/crypto.ts',
    startLine: 9,
    endLine: 9,
    severity: 'WARNING',
    category: 'security',
    title: 'MD5 used to hash session tokens',
    rationale: 'MD5 is broken for security use; token digests should use a modern hash.',
    suggestion: 'Keep sha256 (or HMAC-SHA256 with a server secret).',
    confidence: 0.88,
    triage: 'accepted',
    evalCase: { name: 'md5-used-to-hash-session-tokens', kind: 'must_find' },
  },
  // ---- accepted, no case yet ----
  {
    file: 'src/lib/crypto.ts',
    startLine: 12,
    endLine: 12,
    severity: 'WARNING',
    category: 'security',
    title: 'Session id built from Math.random',
    rationale: 'Math.random is not a cryptographic source, so session ids are guessable.',
    suggestion: 'Use randomBytes(16).toString("hex").',
    confidence: 0.84,
    triage: 'accepted',
    evalCase: null,
  },
  // ---- dismissed, with a `must_not_flag` case (benign changed lines) ----
  {
    file: 'src/api/webhooks.ts',
    startLine: 21,
    endLine: 21,
    severity: 'SUGGESTION',
    category: 'security',
    title: 'Webhook event type is logged',
    rationale: 'The event type is written to the log.',
    suggestion: null,
    confidence: 0.4,
    triage: 'dismissed',
    evalCase: { name: 'webhook-event-type-is-logged', kind: 'must_not_flag' },
  },
  {
    file: 'src/admin/export.ts',
    startLine: 15,
    endLine: 15,
    severity: 'SUGGESTION',
    category: 'security',
    title: 'Column renamed to snake_case',
    rationale: 'The exported column key changed from orderId to order_id.',
    suggestion: null,
    confidence: 0.35,
    triage: 'dismissed',
    evalCase: { name: 'column-renamed-to-snake-case', kind: 'must_not_flag' },
  },
  {
    file: 'src/admin/export.ts',
    startLine: 14,
    endLine: 14,
    severity: 'SUGGESTION',
    category: 'security',
    title: 'Explanatory comment added above the row mapper',
    rationale: 'A comment was added; it changes no behaviour.',
    suggestion: null,
    confidence: 0.3,
    triage: 'dismissed',
    evalCase: { name: 'explanatory-comment-added-above-the-row-mapper', kind: 'must_not_flag' },
  },
  {
    file: 'src/lib/crypto.ts',
    startLine: 1,
    endLine: 1,
    severity: 'SUGGESTION',
    category: 'security',
    title: 'Extra named import added to the crypto helper',
    rationale: 'randomBytes is imported next to createHash.',
    suggestion: null,
    confidence: 0.3,
    triage: 'dismissed',
    evalCase: { name: 'extra-named-import-added-to-the-crypto-helper', kind: 'must_not_flag' },
  },
  // ---- dismissed, no case yet ----
  {
    file: 'src/api/webhooks.ts',
    startLine: 7,
    endLine: 7,
    severity: 'WARNING',
    category: 'security',
    title: 'Webhook secret is a placeholder constant',
    rationale: 'A secret-shaped constant is committed; here it is a documented placeholder replaced at deploy time.',
    suggestion: 'Read it from the environment.',
    confidence: 0.6,
    triage: 'dismissed',
    evalCase: null,
  },
  // ---- untriaged ----
  {
    file: 'src/admin/export.ts',
    startLine: 23,
    endLine: 25,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Admin export route has no authorization check',
    rationale: 'The route is registered without any role check, so any authenticated caller can trigger an export.',
    suggestion: 'Add the admin guard middleware to the route.',
    confidence: 0.87,
    triage: null,
    evalCase: null,
  },
];

export const SEED_PR_483_REVIEW = {
  verdict: 'request_changes',
  summary:
    'The webhook receiver trusts unsigned input and builds SQL from it, and the admin export writes to a caller-chosen path. The token hash was also weakened to md5.',
  score: 38,
} as const;
