import * as t from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PgFixture } from './pg.js';

/**
 * `runReview` is fire-and-forget: the POST returns runIds immediately and each
 * agent's review is persisted in the background (the client subscribes to SSE).
 * Tests that assert on persisted reviews/findings/traces must first wait for the
 * background runs to finish. This polls `agent_runs` until every row for the PR
 * reaches a terminal status (done / failed / cancelled).
 */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

export async function waitForPrRuns(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { expected?: number; timeoutMs?: number } = {},
): Promise<Array<typeof t.agentRuns.$inferSelect>> {
  const { expected, timeoutMs = 10_000 } = opts;
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    // With an explicit `expected`, wait until that many runs finish (ignores any
    // extra rows, e.g. a trifecta scan). Otherwise wait for all rows to settle.
    const done =
      expected != null
        ? terminal.length >= expected
        : runs.length > 0 && terminal.length === runs.length;
    if (done) return runs;
    if (Date.now() - start > timeoutMs) return runs;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Wait for a run's TRACE document, not just for the run row.
 *
 * `completeAgentRun` flips `agent_runs.status` to `done` (run-executor.ts:251)
 * BEFORE `saveRunTrace` writes the trace (:303), so `waitForPrRuns` can return
 * while `run_traces` is still empty. A test that reads the trace straight after
 * is racing those two statements — it passes most runs and fails a few, which
 * is the worst kind of test. Poll for the document instead.
 */
export async function waitForRunTrace(
  db: PgFixture['handle']['db'],
  runId: string,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
    if (row) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`run ${runId} produced no trace within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
