/**
 * JobRunner failure handling.
 *
 * The regression this pins: `enqueue()` returns `{ id, done }`, and every call
 * site in the codebase keeps only `id`. The queued callback rethrows after
 * marking the row failed, so an ordinary failure (cloning a repo that does not
 * exist — the seeded `acme/payments-api` does exactly this) left `done`
 * rejected with nobody listening. Under Node 22's default
 * `--unhandled-rejections=throw` that terminated the API process, while Next.js
 * kept serving :3000 — so the UI looked like the database had been wiped.
 *
 * No DB: a stub records the writes, which is all the contract we care about.
 */
import { describe, it, expect, vi } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

interface Write {
  status?: string;
  error?: string | null;
  attempts?: number;
}

/** Minimal Db stub covering the two chains JobRunner uses. */
function makeDb(): { db: Db; writes: Write[] } {
  const writes: Write[] = [];
  const db = {
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: 'job-1' }],
      }),
    }),
    update: () => ({
      set: (v: Write) => ({
        where: async () => {
          writes.push(v);
        },
      }),
    }),
  } as unknown as Db;
  return { db, writes };
}

describe('JobRunner', () => {
  it('marks a failed job and does not leave an unhandled rejection', async () => {
    const { db, writes } = makeDb();
    // retries: 0 keeps the test fast — the retry path is not what is under test.
    const runner = new JobRunner(db, { retries: 0, timeoutMs: 1_000 });
    runner.register('explode', async () => {
      throw new Error('Repository not found');
    });

    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      // Deliberately discard `done`, exactly as every real call site does.
      const { id } = await runner.enqueue('ws-1', 'explode', {});
      expect(id).toBe('job-1');

      // Two macrotask turns: one for the queue to run the handler, one for the
      // rejection to be reported if it were unobserved.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    const failed = writes.find((w) => w.status === 'failed');
    expect(failed).toBeDefined();
    expect(failed?.error).toBe('Repository not found');
  });

  it('still rejects `done` for a caller that awaits it', async () => {
    const { db } = makeDb();
    const runner = new JobRunner(db, { retries: 0, timeoutMs: 1_000 });
    runner.register('explode', async () => {
      throw new Error('boom');
    });

    const { done } = await runner.enqueue('ws-1', 'explode', {});
    await expect(done).rejects.toThrow('boom');
  });

  it('marks a successful job done', async () => {
    const { db, writes } = makeDb();
    const runner = new JobRunner(db, { retries: 0, timeoutMs: 1_000 });
    runner.register('ok', async () => {});

    const { done } = await runner.enqueue('ws-1', 'ok', {});
    await done;

    expect(writes.some((w) => w.status === 'done')).toBe(true);
    expect(writes.some((w) => w.status === 'failed')).toBe(false);
  });
});
