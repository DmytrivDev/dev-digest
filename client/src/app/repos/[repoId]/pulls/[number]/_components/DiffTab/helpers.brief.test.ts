import { describe, it, expect } from "vitest";
import type { PrBrief, PrFile } from "@devdigest/shared";
import { briefFileCounts, briefLineNotes, firstNewLine } from "./helpers";

const NL = String.fromCharCode(10);
const PATCH = ["@@ -4,2 +7,3 @@", " ctx", "+added", " more"].join(NL);

function brief(risks: PrBrief["risks"]["risks"], focus: PrBrief["review_focus"] = []): PrBrief {
  return { risks: { risks }, review_focus: focus } as unknown as PrBrief;
}

const risk = (o: Partial<PrBrief["risks"]["risks"][number]>) => ({
  kind: "security",
  title: "t",
  explanation: "e",
  severity: "high" as const,
  file_refs: [],
  ...o,
});

const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 1, deletions: 0, patch: PATCH },
  { path: "bin/blob.png", additions: 0, deletions: 0, patch: null },
];

describe("firstNewLine", () => {
  it("reads the new-side start of the first hunk", () => {
    expect(firstNewLine(PATCH)).toBe(7);
  });
  it("is null without a patch or a hunk header", () => {
    expect(firstNewLine(null)).toBeNull();
    expect(firstNewLine("no header")).toBeNull();
  });
});

describe("briefLineNotes", () => {
  it("pins a whole-file risk ref to the file's first diff row, and to 0 without a patch", () => {
    const notes = briefLineNotes(brief([risk({ file_refs: ["src/a.ts", "bin/blob.png"] })]), FILES);
    expect(notes.map((n) => [n.path, n.line, n.wholeFile])).toEqual([
      ["src/a.ts", 7, true],
      ["bin/blob.png", 0, true],
    ]);
  });

  it("skips a whole-file ref when the same risk already marks a line in that file", () => {
    const notes = briefLineNotes(brief([risk({ file_refs: ["src/a.ts:8", "src/a.ts"] })]), FILES);
    expect(notes.map((n) => [n.line, n.wholeFile])).toEqual([[8, false]]);
  });

  it("keeps two different risks on the same row; one risk repeating a row is marked once", () => {
    const notes = briefLineNotes(
      brief([
        risk({ title: "one", file_refs: ["src/a.ts:8-9", "src/a.ts:8"] }),
        risk({ title: "two", file_refs: ["src/a.ts:8"] }),
      ]),
      FILES,
    );
    expect(notes.map((n) => n.title)).toEqual(["one", "two"]);
  });

  it("puts focus items after risks", () => {
    const notes = briefLineNotes(
      brief([risk({ file_refs: ["src/a.ts:8"] })], [{ file: "src/a.ts", line: 9, reason: "r" }]),
      FILES,
    );
    expect(notes.map((n) => n.kind)).toEqual(["risk", "focus"]);
  });
});

describe("briefFileCounts", () => {
  it("counts distinct risks and focus items per file with the highest severity", () => {
    const notes = briefLineNotes(
      brief(
        [
          risk({ severity: "low", file_refs: ["src/a.ts:8", "src/a.ts:9"] }),
          risk({ severity: "medium", file_refs: ["./src/a.ts"] }),
        ],
        [{ file: "src/a.ts", line: 9, reason: "r" }],
      ),
      FILES,
    );
    expect(briefFileCounts(notes).get("src/a.ts")).toEqual({ risks: 2, focus: 1, severity: "medium" });
  });
});
