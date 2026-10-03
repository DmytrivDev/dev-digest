import { describe, it, expect } from "vitest";
import { parsePatch } from "./helpers";
import { focusRowIndex, isFocusedFile } from "./focus";

const PATCH = "@@ -9,4 +9,4 @@\n   port: 3000,\n-  old: 1,\n+  stripeKey: x,\n   redisUrl: y,";

describe("isFocusedFile", () => {
  it("is false with no focus", () => {
    expect(isFocusedFile({ path: "src/a.ts" }, null)).toBe(false);
    expect(isFocusedFile({ path: "src/a.ts" }, undefined)).toBe(false);
  });

  it("matches the same path and ignores a leading ./ or backslash separators", () => {
    expect(isFocusedFile({ path: "src/a.ts" }, { path: "src/a.ts", line: null })).toBe(true);
    expect(isFocusedFile({ path: "src/a.ts" }, { path: "./src\\a.ts", line: 3 })).toBe(true);
  });

  it("does not match a different file", () => {
    expect(isFocusedFile({ path: "src/a.ts" }, { path: "src/b.ts", line: null })).toBe(false);
  });
});

describe("focusRowIndex", () => {
  const lines = parsePatch(PATCH);

  it("returns the index of the row whose NEW-side number equals the line", () => {
    // 0 hunk, 1 ctx(new 9), 2 del, 3 add(new 10), 4 ctx(new 11)
    expect(focusRowIndex(lines, 9)).toBe(1);
    expect(focusRowIndex(lines, 10)).toBe(3);
    expect(focusRowIndex(lines, 11)).toBe(4);
  });

  it("never lands on a deleted row (old side)", () => {
    // the deleted row carries oldNo 10 only; line 10 must resolve to the added row
    expect(lines[2]?.kind).toBe("del");
    expect(focusRowIndex(lines, 10)).toBe(3);
  });

  it("returns -1 for a line that is not rendered, or no line", () => {
    expect(focusRowIndex(lines, 9999)).toBe(-1);
    expect(focusRowIndex(lines, null)).toBe(-1);
    expect(focusRowIndex([], 3)).toBe(-1);
  });
});
