import { describe, it, expect } from "vitest";
import { ownRunState } from "./helpers";

const read = (status?: "running" | "completed" | "failed", error_reason: "interrupted" | "all_cases_errored" | null = null) => ({
  data: status ? { status, error_reason } : undefined,
  isError: false,
});

describe("ownRunState — the case's own run (SPEC-07 AC-13, AC-14, AC-17)", () => {
  it("is idle with no list entry and no followed run", () => {
    expect(ownRunState({ listRunning: false, trackedRunId: null, read: read() })).toEqual({
      running: false,
      interrupted: false,
    });
  });

  it("is running while the runs list holds a running run of the case", () => {
    expect(ownRunState({ listRunning: true, trackedRunId: null, read: read() }).running).toBe(true);
  });

  it("is running for a followed id whose own read has not answered yet (the gap after a 202)", () => {
    expect(ownRunState({ listRunning: false, trackedRunId: "r1", read: read() }).running).toBe(true);
  });

  it("is running while the followed run's read says running", () => {
    expect(ownRunState({ listRunning: false, trackedRunId: "r1", read: read("running") }).running).toBe(true);
  });

  it("stops running once the followed run's read is final, whichever way it ended", () => {
    for (const status of ["completed", "failed"] as const) {
      expect(ownRunState({ listRunning: false, trackedRunId: "r1", read: read(status) }).running).toBe(false);
    }
  });

  it("stops waiting when the followed run's read failed, so 'Running…' cannot stay stuck", () => {
    expect(
      ownRunState({ listRunning: false, trackedRunId: "r1", read: { data: undefined, isError: true } }),
    ).toEqual({ running: false, interrupted: false });
  });

  it("is interrupted only for a failed run with the 'interrupted' reason", () => {
    const state = (r: ReturnType<typeof read>) =>
      ownRunState({ listRunning: false, trackedRunId: "r1", read: r }).interrupted;
    expect(state(read("failed", "interrupted"))).toBe(true);
    expect(state(read("failed", "all_cases_errored"))).toBe(false);
    expect(state(read("completed"))).toBe(false);
    expect(state(read("running"))).toBe(false);
    expect(state(read())).toBe(false);
  });
});
