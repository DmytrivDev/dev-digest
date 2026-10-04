import { describe, it, expect } from "vitest";
import { blobHref, splitRef } from "./helpers";

describe("splitRef", () => {
  it("reads `path:N-M` as the path and the range start (AC-32)", () => {
    expect(splitRef("src/a.ts:12-18")).toEqual({ path: "src/a.ts", line: 12 });
  });

  it("reads `path:N`", () => {
    expect(splitRef("src/a.ts:40")).toEqual({ path: "src/a.ts", line: 40 });
  });

  it("reads a bare path as no line", () => {
    expect(splitRef("package.json")).toEqual({ path: "package.json", line: null });
  });
});

describe("blobHref", () => {
  it("builds the github.com blob link at the sha and line (AC-34)", () => {
    expect(blobHref("acme/api", "abc123", "src/b.ts", 7)).toBe(
      "https://github.com/acme/api/blob/abc123/src/b.ts#L7",
    );
  });

  it("omits the anchor without a line", () => {
    expect(blobHref("acme/api", "abc123", "src/b.ts", null)).toBe(
      "https://github.com/acme/api/blob/abc123/src/b.ts",
    );
  });

  it("is null without a repo or a sha", () => {
    expect(blobHref(null, "abc", "a.ts", 1)).toBeNull();
    expect(blobHref("acme/api", null, "a.ts", 1)).toBeNull();
  });
});
