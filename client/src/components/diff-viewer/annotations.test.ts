import { describe, it, expect } from "vitest";
import { partitionAnnotations, normalizeAnnotationPath, type DiffAnnotation } from "./annotations";

function annotation(id: string, line: number): DiffAnnotation {
  return {
    id,
    path: "src/a.ts",
    line,
    color: "var(--crit)",
    icon: "AlertOctagon",
    label: "Blocker",
    content: null,
  };
}

describe("partitionAnnotations", () => {
  it("matches an annotation whose RIGHT:line key is rendered", () => {
    const renderedKeys = new Set(["RIGHT:10"]);
    const { matched, unanchored } = partitionAnnotations([annotation("a", 10)], renderedKeys);
    expect(matched.get("RIGHT:10")).toHaveLength(1);
    expect(unanchored).toHaveLength(0);
  });

  it("puts an annotation whose line is not rendered into unanchored", () => {
    const renderedKeys = new Set(["RIGHT:10"]);
    const { matched, unanchored } = partitionAnnotations([annotation("a", 999)], renderedKeys);
    expect(matched.size).toBe(0);
    expect(unanchored).toHaveLength(1);
    expect(unanchored[0]!.id).toBe("a");
  });

  it("a LEFT-only rendered line never matches (annotations only carry a RIGHT line)", () => {
    // Only the LEFT key is rendered for this line — no RIGHT key exists.
    const renderedKeys = new Set(["LEFT:10"]);
    const { matched, unanchored } = partitionAnnotations([annotation("a", 10)], renderedKeys);
    expect(matched.size).toBe(0);
    expect(unanchored).toHaveLength(1);
  });

  it("preserves input order within both buckets", () => {
    const renderedKeys = new Set(["RIGHT:1", "RIGHT:2"]);
    const items = [annotation("first", 1), annotation("second", 1), annotation("third", 999)];
    const { matched } = partitionAnnotations(items, renderedKeys);
    expect(matched.get("RIGHT:1")!.map((a) => a.id)).toEqual(["first", "second"]);
  });
});

describe("normalizeAnnotationPath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizeAnnotationPath("src\\config.ts")).toBe("src/config.ts");
  });

  it("strips a leading ./", () => {
    expect(normalizeAnnotationPath("./src/config.ts")).toBe("src/config.ts");
  });

  it("strips a leading /", () => {
    expect(normalizeAnnotationPath("/src/config.ts")).toBe("src/config.ts");
  });

  it("leaves an already-normalized path unchanged", () => {
    expect(normalizeAnnotationPath("src/config.ts")).toBe("src/config.ts");
  });

  it("makes a finding path and a PR file path compare equal despite formatting differences", () => {
    expect(normalizeAnnotationPath("./src\\config.ts")).toBe(
      normalizeAnnotationPath("src/config.ts"),
    );
  });
});
