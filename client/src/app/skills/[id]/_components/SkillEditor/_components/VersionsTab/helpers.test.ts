import { describe, it, expect } from "vitest";
import { diffLines, hasChanges } from "./helpers";

const render = (before: string, after: string) =>
  diffLines(before, after).map((l) => `${l.kind}:${l.text}`);

describe("diffLines", () => {
  it("reports an unchanged body as all context", () => {
    const body = "# Rubric\n\n- one\n- two";
    expect(diffLines(body, body).every((l) => l.kind === "ctx")).toBe(true);
    expect(hasChanges(diffLines(body, body))).toBe(false);
  });

  it("marks an added line and keeps the surrounding lines as context", () => {
    expect(render("a\nb", "a\nnew\nb")).toEqual(["ctx:a", "add:new", "ctx:b"]);
  });

  it("marks a removed line", () => {
    expect(render("a\ngone\nb", "a\nb")).toEqual(["ctx:a", "del:gone", "ctx:b"]);
  });

  it("shows a replaced line as a removal followed by an addition", () => {
    expect(render("a\nold\nb", "a\nnew\nb")).toEqual(["ctx:a", "del:old", "add:new", "ctx:b"]);
  });

  it("handles an empty body on either side", () => {
    expect(render("", "added")).toEqual(["del:", "add:added"]);
    expect(render("removed", "")).toEqual(["del:removed", "add:"]);
  });

  // The prefix/suffix trim is what keeps a one-line edit in a long rubric from
  // running the LCS table over the whole body.
  it("only diffs the region that actually changed", () => {
    const before = ["h1", "h2", "h3", "mid", "t1", "t2"].join("\n");
    const after = ["h1", "h2", "h3", "MID", "t1", "t2"].join("\n");
    expect(render(before, after)).toEqual([
      "ctx:h1",
      "ctx:h2",
      "ctx:h3",
      "del:mid",
      "add:MID",
      "ctx:t1",
      "ctx:t2",
    ]);
  });

  // Above the LCS cap the diff degrades to a block replacement rather than
  // locking the tab on an O(n×m) table. Still true, just coarser.
  it("degrades to a whole-block replacement on a very large change", () => {
    const before = Array.from({ length: 1400 }, (_, i) => `a${i}`).join("\n");
    const after = Array.from({ length: 1400 }, (_, i) => `b${i}`).join("\n");
    const lines = diffLines(before, after);
    expect(lines.filter((l) => l.kind === "del")).toHaveLength(1400);
    expect(lines.filter((l) => l.kind === "add")).toHaveLength(1400);
    expect(lines.filter((l) => l.kind === "ctx")).toHaveLength(0);
  });
});
