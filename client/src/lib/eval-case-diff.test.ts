import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalExpectation } from "@devdigest/shared";
import {
  caseNewSideLines,
  checkPastedDiff,
  expectationDiffError,
  findingSkeleton,
  previewFile,
} from "./eval-case-diff";
import { parsePatch } from "@/components/diff-viewer/helpers";

/* The parity fixture is shared with the server (`eval-paste-diff.test.ts`): both
   packages must give the same verdict for every entry (AC-12). Anchored on cwd
   like `src/test/vendor-shared-sync.test.ts` — vitest runs from `client/`. */
const FIXTURE_PATH = join(process.cwd(), "../server/test/fixtures/eval-case-diff-parity.json");

interface ParityEntry {
  name: string;
  diff: string | { repeatToBytes: number; header: string };
  expectation?: EvalExpectation;
  expect: {
    diff: null | "diff_too_large" | "diff_unparseable" | "multi_file_diff";
    path?: string;
    expectation?: null | "file_mismatch" | "range_outside_hunks";
    skeleton?: { start_line: number } | null;
  };
}

const entries = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ParityEntry[];

/** A `{repeatToBytes, header}` entry is the header padded with `x` up to exactly n UTF-8 bytes. */
function expand(diff: ParityEntry["diff"]): string {
  if (typeof diff === "string") return diff;
  const headerBytes = new TextEncoder().encode(diff.header).length;
  return diff.header + "x".repeat(diff.repeatToBytes - headerBytes);
}

describe("checkPastedDiff / expectationDiffError / findingSkeleton — parity fixture (AC-12)", () => {
  it("loads the shared fixture list", () => {
    expect(entries.length).toBeGreaterThanOrEqual(13);
  });

  for (const entry of entries) {
    it(entry.name, () => {
      const check = checkPastedDiff(expand(entry.diff));

      if (entry.expect.diff !== null) {
        expect(check).toEqual({ ok: false, code: entry.expect.diff });
        return;
      }
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      if (entry.expect.path !== undefined) expect(check.path).toBe(entry.expect.path);

      if (entry.expectation && entry.expect.expectation !== undefined) {
        expect(expectationDiffError(check, entry.expectation)).toBe(entry.expect.expectation);
      }
      // An entry without a `skeleton` key must not have a skeleton asserted.
      if (entry.expect.skeleton !== undefined) {
        const want = entry.expect.skeleton;
        expect(findingSkeleton(check)).toEqual(
          want === null
            ? null
            : { kind: "must_find", file: check.path, start_line: want.start_line, end_line: want.start_line },
        );
      }
    });
  }
});

describe("checkPastedDiff — order and empty input (AC-7)", () => {
  it("returns no code for empty text, so nothing is shown", () => {
    expect(checkPastedDiff("")).toEqual({ ok: false, code: null });
  });

  it("reports only the size failure when the paste also fails the parse and file-count checks", () => {
    const big = "x".repeat(200 * 1024 + 1);
    // no +++ header at all, two diff --git lines, and over 200 KB
    expect(checkPastedDiff(`diff --git a/a b/a\ndiff --git a/b b/b\n${big}`)).toEqual({
      ok: false,
      code: "diff_too_large",
    });
  });

  it("reports the parse failure before the file count", () => {
    expect(checkPastedDiff("diff --git a/a b/a\ndiff --git a/b b/b\n+++ /dev/null\n@@ -1 +1 @@\n+x\n")).toEqual({
      ok: false,
      code: "diff_unparseable",
    });
  });

  it("treats an empty path after +++ as unparseable, like a missing path or /dev/null", () => {
    const unparseable = { ok: false, code: "diff_unparseable" };
    expect(checkPastedDiff("+++ b/\n@@ -1 +1 @@\n+x\n")).toEqual(unparseable);
    expect(checkPastedDiff("+++ \n@@ -1 +1 @@\n+x\n")).toEqual(unparseable);
  });

  it("measures size in UTF-8 bytes of the raw text, not in characters", () => {
    // "é" is two bytes: 102 401 of them is 204 802 bytes but only 102 401 characters.
    const head = "+++ b/a.ts\n@@ -1 +1 @@\n+";
    const body = "é".repeat(102_400);
    expect(checkPastedDiff(head + body)).toEqual({ ok: false, code: "diff_too_large" });
  });

  it("counts CRLF as two bytes towards the size cap before normalising", () => {
    const head = "+++ b/a.ts\r\n@@ -1 +1 @@\r\n+";
    const pad = 200 * 1024 - head.length - 2;
    expect(checkPastedDiff(`${head}${"x".repeat(pad)}\r\n`).ok).toBe(true);
    expect(checkPastedDiff(`${head}${"x".repeat(pad + 1)}\r\n`)).toEqual({ ok: false, code: "diff_too_large" });
  });
});

describe("preview and skeleton (AC-5, AC-6, AC-9)", () => {
  const FULL = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 111..222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -10,3 +10,4 @@",
    " ctx10",
    "-old",
    "+add11",
    "+add12",
    " ctx13",
    "",
  ].join("\n");

  it("previews exactly as many added lines as the hunks hold, and never a header line", () => {
    const check = checkPastedDiff(FULL);
    if (!check.ok) throw new Error("expected a valid diff");
    const file = previewFile(check);
    const lines = parsePatch(file.patch);
    expect(lines.filter((l) => l.kind === "add")).toHaveLength(2);
    expect(lines.filter((l) => l.kind === "del")).toHaveLength(1);
    expect(file).toMatchObject({ path: "src/a.ts", additions: 2, deletions: 1 });
    expect(file.patch).not.toMatch(/diff --git|^index |^--- |^\+\+\+ /m);
  });

  it("numbers the first non-removed line with the hunk's new-side start", () => {
    const check = checkPastedDiff("+++ b/a.ts\n@@ -5,2 +12,3 @@\n-gone\n+first\n ctx\n+last\n");
    if (!check.ok) throw new Error("expected a valid diff");
    const numbered = parsePatch(previewFile(check).patch).filter((l) => l.kind !== "hunk" && l.kind !== "del");
    expect(numbered.map((l) => l.newNo)).toEqual([12, 13, 14]);
  });

  it("drops a trailing 'No newline' marker so the gutter never numbers it", () => {
    const check = checkPastedDiff("+++ b/a.ts\n@@ -1,2 +1,2 @@\n x\n-y\n+z\n\\ No newline at end of file\n");
    if (!check.ok) throw new Error("expected a valid diff");
    expect(previewFile(check).patch).not.toContain("\\");
    expect(parsePatch(previewFile(check).patch).filter((l) => l.newNo !== undefined)).toHaveLength(2);
  });

  it("puts the skeleton on the first added line (12 -> 12/12), not on an earlier context line", () => {
    const check = checkPastedDiff("+++ b/src/a.ts\n@@ -10,3 +10,4 @@\n c10\n c11\n+a12\n+a13\n");
    expect(findingSkeleton(check)).toEqual({ kind: "must_find", file: "src/a.ts", start_line: 12, end_line: 12 });
  });

  it("falls back to the first context line for a diff with no added line", () => {
    const check = checkPastedDiff("+++ b/src/a.ts\n@@ -5,3 +5,2 @@\n c5\n-gone\n c6\n");
    expect(findingSkeleton(check)).toEqual({ kind: "must_find", file: "src/a.ts", start_line: 5, end_line: 5 });
  });

  it("has no skeleton for a failed check or a deletion-only diff", () => {
    expect(findingSkeleton(checkPastedDiff(""))).toBeNull();
    expect(findingSkeleton(checkPastedDiff("garbage"))).toBeNull();
    expect(findingSkeleton(checkPastedDiff("+++ b/a.ts\n@@ -4,2 +4,0 @@\n-a\n-b\n"))).toBeNull();
  });

  it("clamps the covered lines to the hunk header", () => {
    const check = checkPastedDiff("+++ b/a.ts\n@@ -1,1 +1,1 @@\n a\n+b\n+c\n");
    if (!check.ok) throw new Error("expected a valid diff");
    expect(caseNewSideLines(check.hunks)[0]!.numbers).toEqual([1]);
  });
});
