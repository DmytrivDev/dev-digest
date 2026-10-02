import { describe, it, expect } from "vitest";
import { naturalWidth, nodeClassCSS, toTopDown } from "./helpers";

describe("nodeClassCSS", () => {
  it("colours each class's node border, dashed when asked", () => {
    const css = nodeClassCSS({ service: { color: "#3b82f6" }, shared: { color: "#888", dashed: true } });
    expect(css).toContain(".node.service rect");
    expect(css).toContain("stroke: #3b82f6 !important");
    expect(css).toMatch(/\.node\.shared rect[^{]*\{[^}]*stroke-dasharray/);
    expect(css).not.toMatch(/\.node\.service rect[^{]*\{[^}]*stroke-dasharray/);
  });

  it("skips a class name or colour that could break out of the rule", () => {
    expect(nodeClassCSS({ "x{}body": { color: "#fff" } })).toBe("");
    expect(nodeClassCSS({ ok: { color: "red;} body{display:none" } })).toBe("");
  });
});

describe("toTopDown", () => {
  it("turns a left-right flowchart top-down, keeping the body", () => {
    expect(toTopDown('flowchart LR\n  A["a"] --> B')).toBe('flowchart TB\n  A["a"] --> B');
    expect(toTopDown("  graph RL\n  A --> B")).toBe("  graph TB\n  A --> B");
  });

  it("leaves anything else alone", () => {
    expect(toTopDown("flowchart TD\n  A --> B")).toBeNull();
    expect(toTopDown("sequenceDiagram\n  A->>B: hi")).toBeNull();
    // Only the header: an `LR` inside a label is not a direction.
    expect(toTopDown('flowchart TB\n  A["LR mode"]')).toBeNull();
  });
});

describe("naturalWidth", () => {
  it("reads the width out of the SVG viewBox", () => {
    expect(naturalWidth('<svg viewBox="0 0 1812.66 211.7" width="100%">')).toBeCloseTo(1812.66);
    expect(naturalWidth("<svg>")).toBeNull();
  });
});
