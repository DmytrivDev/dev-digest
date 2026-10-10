import { describe, it, expect } from "vitest";
import type { EvalCaseOutcome, EvalExpectation, EvalSuiteRun } from "@devdigest/shared";
import { ApiError } from "./api";
import { formatCost } from "./cost";
import {
  CASE_INPUT_ERROR_KEY,
  CREATE_CASE_ERROR_FALLBACK,
  CREATE_CASE_ERROR_KEY,
  COMPARE_ERROR_KEY,
  EVAL_ERROR_GENERIC,
  EVAL_ERROR_RATE_LIMITED,
  RUN_START_ERROR_KEY,
  UPDATE_CASE_ERROR_KEY,
  alertDropParams,
  caseSaveErrorKey,
  compareErrorKey,
  createCaseErrorKey,
  deltaPoints,
  expectationText,
  formatMetric,
  lastRunParts,
  parseExpectationText,
  resultLineParts,
  runningCaseRunFor,
  runningRunOf,
  runStartErrorKey,
  suiteRunsOnly,
  trendTooltipParts,
  updateCaseErrorKey,
} from "./eval";
import evalMessages from "../../messages/en/eval.json";
import prReviewMessages from "../../messages/en/prReview.json";

const EXPECTATION: EvalExpectation = {
  kind: "must_find",
  file: "src/config.ts",
  start_line: 12,
  end_line: 14,
};

function outcome(over: Partial<EvalCaseOutcome> = {}): EvalCaseOutcome {
  return {
    case_id: "c1",
    case_name: "stripe-key-leak",
    kind: "must_find",
    expectation: EXPECTATION,
    status: "scored",
    pass: true,
    error_reason: null,
    findings_matched: 1,
    findings_total: 2,
    grounding_kept: 2,
    grounding_total: 2,
    duration_ms: 1840,
    cost_usd: 0.02,
    actual: [],
    ...over,
  };
}

/** Resolve a dot-path ("finding.evalCase.errors.generic") in a messages tree. */
function resolve(tree: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);
}

describe("formatMetric / formatCost (AC-77)", () => {
  it("shows n/a for a null metric, a dash for a null cost, a whole percent otherwise", () => {
    expect(formatMetric(null)).toBe("n/a");
    expect(formatMetric(undefined)).toBe("n/a");
    expect(formatMetric(0.8249)).toBe("82%");
    expect(formatMetric(0)).toBe("0%");
    expect(formatMetric(1)).toBe("100%");
    expect(formatCost(null)).toBe("—");
  });
});

describe("deltaPoints", () => {
  it("is the difference of the displayed percentages, in whole points", () => {
    expect(deltaPoints(0.82, 0.78)).toBe(4);
    expect(deltaPoints(0.91, 0.93)).toBe(-2);
    expect(deltaPoints(0.8249, 0.78)).toBe(4);
    expect(deltaPoints(0.5, 0.5)).toBe(0);
  });

  it("is null when either side is missing", () => {
    expect(deltaPoints(null, 0.5)).toBeNull();
    expect(deltaPoints(0.5, null)).toBeNull();
    expect(deltaPoints(undefined, undefined)).toBeNull();
  });
});

describe("resultLineParts (AC-30)", () => {
  it("must_find → expected a finding at <loc>, got N", () => {
    expect(resultLineParts(outcome({ findings_matched: 1 }), EXPECTATION)).toEqual({
      variant: "mustFind",
      loc: "src/config.ts:12–14",
      n: 1,
    });
  });

  it("must_not_flag → expected none at <loc>, got N", () => {
    const exp: EvalExpectation = { ...EXPECTATION, kind: "must_not_flag" };
    expect(resultLineParts(outcome({ findings_matched: 3, pass: false }), exp)).toEqual({
      variant: "mustNotFlag",
      loc: "src/config.ts:12–14",
      n: 3,
    });
  });

  it("an errored outcome → errored · <reason>", () => {
    expect(
      resultLineParts(outcome({ status: "errored", pass: null, error_reason: "timeout" }), EXPECTATION),
    ).toEqual({ variant: "errored", reason: "timeout" });
  });

  it("no outcome → never run", () => {
    expect(resultLineParts(null, EXPECTATION)).toEqual({ variant: "never" });
    expect(resultLineParts(undefined, EXPECTATION)).toEqual({ variant: "never" });
  });
});

describe("lastRunParts (AC-44)", () => {
  it("passed / failed carry the result line, seconds and cost", () => {
    const passed = lastRunParts(outcome(), EXPECTATION);
    expect(passed).toEqual({
      variant: "passed",
      line: { variant: "mustFind", loc: "src/config.ts:12–14", n: 1 },
      seconds: "1.8",
      costUsd: 0.02,
    });
    expect(lastRunParts(outcome({ pass: false, findings_matched: 0 }), EXPECTATION).variant).toBe(
      "failed",
    );
  });

  it("a null cost stays null so formatCost renders the dash", () => {
    const parts = lastRunParts(outcome({ cost_usd: null }), EXPECTATION);
    expect(parts.variant === "passed" && formatCost(parts.costUsd)).toBe("—");
  });

  it("errored and never-run have no timing", () => {
    expect(
      lastRunParts(outcome({ status: "errored", pass: null, error_reason: "llm_error" }), EXPECTATION),
    ).toEqual({ variant: "errored", reason: "llm_error" });
    expect(lastRunParts(null, EXPECTATION)).toEqual({ variant: "never" });
  });
});

describe("parseExpectationText (AC-39 / AC-40)", () => {
  it("round-trips a valid expectation", () => {
    const parsed = parseExpectationText(expectationText(EXPECTATION));
    expect(parsed).toEqual({ ok: true, value: EXPECTATION });
  });

  it("rejects malformed JSON", () => {
    expect(parseExpectationText("{ not json")).toEqual({ ok: false });
    expect(parseExpectationText("")).toEqual({ ok: false });
  });

  it("rejects a missing file, a bad kind and an inverted range", () => {
    expect(
      parseExpectationText(JSON.stringify({ kind: "must_find", start_line: 1, end_line: 2 })),
    ).toEqual({ ok: false });
    expect(parseExpectationText(JSON.stringify({ ...EXPECTATION, kind: "maybe" }))).toEqual({
      ok: false,
    });
    expect(
      parseExpectationText(JSON.stringify({ ...EXPECTATION, start_line: 9, end_line: 3 })),
    ).toEqual({ ok: false });
  });
});

describe("alertDropParams (AC-86)", () => {
  it("turns a drop into whole points and the two versions", () => {
    expect(
      alertDropParams({
        metric: "precision",
        old_value: 0.91,
        new_value: 0.85,
        old_version: 7,
        new_version: 8,
      }),
    ).toEqual({ metric: "precision", pts: 6, newVersion: 8, oldVersion: 7 });
  });

  it("each metric name resolves to a label in eval.json", () => {
    for (const metric of ["recall", "precision", "citation_accuracy"]) {
      expect(typeof resolve(evalMessages, `common.metricName.${metric}`)).toBe("string");
    }
  });
});

describe("reason code → message key (AC-8, AC-64)", () => {
  it("every create-case code maps to a prReview key that exists", () => {
    expect(Object.keys(CREATE_CASE_ERROR_KEY)).toHaveLength(6);
    for (const key of [...Object.values(CREATE_CASE_ERROR_KEY), CREATE_CASE_ERROR_FALLBACK]) {
      expect(typeof resolve(prReviewMessages, key), key).toBe("string");
    }
  });

  it("every run-start, update and compare code maps to an eval key that exists", () => {
    const keys = [
      ...Object.values(RUN_START_ERROR_KEY),
      ...Object.values(UPDATE_CASE_ERROR_KEY),
      ...Object.values(COMPARE_ERROR_KEY),
      ...Object.values(CASE_INPUT_ERROR_KEY),
      EVAL_ERROR_RATE_LIMITED,
      EVAL_ERROR_GENERIC,
    ];
    for (const key of keys) {
      expect(typeof resolve(evalMessages, key), key).toBe("string");
    }
  });

  it("no mapped message is a raw code or an i18n key", () => {
    const texts = [
      ...Object.values(CREATE_CASE_ERROR_KEY).map((k) => resolve(prReviewMessages, k)),
      ...[
        ...Object.values(RUN_START_ERROR_KEY),
        ...Object.values(COMPARE_ERROR_KEY),
        ...Object.values(CASE_INPUT_ERROR_KEY),
      ].map((k) => resolve(evalMessages, k)),
    ] as string[];
    for (const text of texts) {
      expect(text).toMatch(/\s/);
      expect(text).not.toMatch(/^[a-z_]+$/);
    }
  });

  it("picks the key from the response's code", () => {
    const err = (status: number, code?: string) => new ApiError("x", status, code);
    expect(createCaseErrorKey(err(422, "patch_missing"))).toBe(
      CREATE_CASE_ERROR_KEY.patch_missing,
    );
    expect(createCaseErrorKey(err(422, "something_new"))).toBe(CREATE_CASE_ERROR_FALLBACK);
    expect(createCaseErrorKey(new Error("boom"))).toBe(CREATE_CASE_ERROR_FALLBACK);
    expect(runStartErrorKey(err(409, "run_in_progress"))).toBe(RUN_START_ERROR_KEY.run_in_progress);
    expect(runStartErrorKey(err(422, "no_cases"))).toBe(RUN_START_ERROR_KEY.no_cases);
    expect(runStartErrorKey(err(429))).toBe(EVAL_ERROR_RATE_LIMITED);
    expect(runStartErrorKey(err(500))).toBe(EVAL_ERROR_GENERIC);
    expect(updateCaseErrorKey(err(422, "file_mismatch"))).toBe(UPDATE_CASE_ERROR_KEY.file_mismatch);
    expect(compareErrorKey(err(409, "run_not_completed"))).toBe(
      COMPARE_ERROR_KEY.run_not_completed,
    );
    expect(compareErrorKey(err(422, "constructor"))).toBe(EVAL_ERROR_GENERIC);
  });

  it("maps every manual-case save failure to one eval key (SPEC-05 AC-17)", () => {
    const err = (status: number, code?: string) => new ApiError("x", status, code);
    for (const code of Object.keys(CASE_INPUT_ERROR_KEY)) {
      expect(caseSaveErrorKey(err(422, code))).toBe(CASE_INPUT_ERROR_KEY[code as keyof typeof CASE_INPUT_ERROR_KEY]);
    }
    expect(caseSaveErrorKey(err(422, "file_mismatch"))).toBe(UPDATE_CASE_ERROR_KEY.file_mismatch);
    expect(caseSaveErrorKey(err(422, "range_outside_hunks"))).toBe(UPDATE_CASE_ERROR_KEY.range_outside_hunks);
    expect(caseSaveErrorKey(err(404, "not_found"))).toBe(EVAL_ERROR_GENERIC);
    expect(caseSaveErrorKey(err(422, "constructor"))).toBe(EVAL_ERROR_GENERIC);
    expect(caseSaveErrorKey(new Error("boom"))).toBe(EVAL_ERROR_GENERIC);
  });
});

describe("trendTooltipParts (SPEC-05 AC-54)", () => {
  const point = {
    started_at: "2026-10-07T10:00:00.000Z",
    run_id: "run7",
    agent_version: 7,
    cost_usd: 0.03,
    recall: 0.8249,
    precision: null,
    citation_accuracy: 0.9,
  };

  it("formats the date, version, cost and three whole percentages with n/a for a null metric", () => {
    expect(trendTooltipParts(point)).toEqual({
      when: expect.stringContaining("2026"),
      version: 7,
      cost: "$0.03",
      recall: "82%",
      precision: "n/a",
      citation: "90%",
    });
  });

  it("shows a missing cost as the em dash and tolerates a payload without the new fields", () => {
    const parts = trendTooltipParts({ started_at: point.started_at, recall: 1, precision: 1, citation_accuracy: 1 });
    expect(parts.cost).toBe("—");
    expect(parts.version).toBeNull();
    expect(trendTooltipParts({ ...point, cost_usd: null }).cost).toBe("—");
  });
});

// ---- SPEC-07: run scope helpers ------------------------------------------------

function scopedRun(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return { id, status: "completed", scope: "suite", case_id: null, ...over } as EvalSuiteRun;
}

describe("suiteRunsOnly / runningRunOf / runningCaseRunFor (SPEC-07 AC-24, AC-25, AC-45)", () => {
  // The AC-45 shape: 20 suite runs, then the one running case run.
  const suite = Array.from({ length: 20 }, (_, i) => scopedRun(`s${i}`));
  const caseRun = scopedRun("k1", { status: "running", scope: "case", case_id: "c7" });
  const list = [...suite, caseRun];

  it("keeps the 20 suite runs and drops the running case run", () => {
    const only = suiteRunsOnly(list);
    expect(only).toHaveLength(20);
    expect(only.map((r) => r.id)).toEqual(suite.map((r) => r.id));
  });

  it("drops a finished case run too, and counts a run without a scope as a suite run", () => {
    const finished = scopedRun("k0", { scope: "case", case_id: "c7" });
    const legacy = { id: "old", status: "completed" } as EvalSuiteRun;
    expect(suiteRunsOnly([finished, legacy, scopedRun("s")]).map((r) => r.id)).toEqual(["old", "s"]);
    expect(suiteRunsOnly([])).toEqual([]);
  });

  it("runningRunOf finds the running run of either scope, else null", () => {
    expect(runningRunOf(list)?.id).toBe("k1");
    const runningSuite = scopedRun("rs", { status: "running" });
    expect(runningRunOf([scopedRun("a"), runningSuite])?.id).toBe("rs");
    expect(runningRunOf(suite)).toBeNull();
    expect(runningRunOf([])).toBeNull();
  });

  it("runningCaseRunFor matches only a running case run of that case", () => {
    expect(runningCaseRunFor(list, "c7")?.id).toBe("k1");
    expect(runningCaseRunFor(list, "c8")).toBeNull();
    // a running SUITE run is not a case run, and a finished case run is not running
    expect(runningCaseRunFor([scopedRun("rs", { status: "running" })], "c7")).toBeNull();
    expect(
      runningCaseRunFor([scopedRun("k0", { scope: "case", case_id: "c7" })], "c7"),
    ).toBeNull();
  });
});

describe("SPEC-07 strings (NFR-1)", () => {
  it("every new eval.json key resolves to the spec's English text", () => {
    expect(resolve(evalMessages, "caseModal.runCase")).toBe("Run case");
    expect(resolve(evalMessages, "caseModal.running")).toBe("Running…");
    expect(resolve(evalMessages, "caseModal.interrupted")).toBe("Run interrupted — try again");
    expect(resolve(evalMessages, "caseRun.savedNotRun")).toBe("Case saved; not run: {reason}");
    expect(resolve(evalMessages, "evalsTab.row.run")).toBe("Run");
    expect(resolve(evalMessages, "evalsTab.row.running")).toBe("Running");
    expect(resolve(evalMessages, "runButton.runningCase")).toBe("Running case…");
  });
});
