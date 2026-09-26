import type { Clock } from '../src/ports/clock.js';

/**
 * A deterministic `Clock` for W6's deadline tests: `sleep` advances the
 * virtual clock immediately instead of waiting real wall-clock time.
 */
export class FakeClock implements Clock {
  private time = 0;

  constructor(startAt = 0) {
    this.time = startAt;
  }

  now(): number {
    return this.time;
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    this.time += ms;
  }

  /** Jump the clock forward without going through `sleep` (e.g. to cross a deadline). */
  advance(ms: number): void {
    this.time += ms;
  }
}
