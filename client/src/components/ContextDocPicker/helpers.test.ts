import { describe, it, expect } from "vitest";
import type { ContextAttachment, ContextDoc, InheritedContextAttachment } from "@devdigest/shared";
import {
  buildRows,
  categoryForPath,
  dropAttachment,
  filterRows,
  moveAttachment,
  rowLabel,
  toggleAttachment,
} from "./helpers";

const doc = (path: string, category: ContextDoc["category"] = "docs"): ContextDoc => ({
  path,
  name: path.slice(path.lastIndexOf("/") + 1),
  folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
  category,
  approx_tokens: 10,
});
const att = (path: string, present = true): ContextAttachment => ({
  path,
  present,
  approx_tokens: present ? 10 : null,
});
const inh = (path: string, skill = "Security Rules"): InheritedContextAttachment => ({
  ...att(path),
  skill_id: "s1",
  skill_name: skill,
});

describe("rowLabel", () => {
  it("splits a path into the file name and its folder with a trailing slash", () => {
    expect(rowLabel("specs/public-api.md")).toEqual({ name: "public-api.md", folder: "specs/" });
    expect(rowLabel("a/b/c.md")).toEqual({ name: "c.md", folder: "a/b/" });
  });
  it("leaves the folder empty at the repository root", () => {
    expect(rowLabel("README.md")).toEqual({ name: "README.md", folder: "" });
  });
});

describe("categoryForPath (AC-4 twin)", () => {
  it.each([
    ["specs/a.md", "specs"],
    ["server/INSIGHTS.md", "insights"],
    ["insights/x.md", "insights"],
    ["docs/a.md", "docs"],
    ["README.md", "docs"],
    ["server/specs/INSIGHTS.md", "specs"],
  ])("%s -> %s", (path, category) => {
    expect(categoryForPath(path)).toBe(category);
  });
});

describe("buildRows", () => {
  const docs = [doc("a.md"), doc("b.md"), doc("c.md"), doc("specs/d.md", "specs")];

  it("puts attached rows first in attachment order, then the rest in list order (AC-25)", () => {
    const rows = buildRows(docs, [att("b.md"), att("a.md")]);
    expect(rows.map((r) => r.path)).toEqual(["b.md", "a.md", "c.md", "specs/d.md"]);
    expect(rows.map((r) => r.kind)).toEqual(["attached", "attached", "available", "available"]);
  });

  it("keeps an attachment the list does not hold, with a category derived from its path", () => {
    const rows = buildRows(docs, [att("specs/beyond-500.md")]);
    expect(rows[0]).toMatchObject({ path: "specs/beyond-500.md", category: "specs", kind: "attached" });
  });

  it("flags a missing attachment", () => {
    const rows = buildRows(docs, [att("gone.md", false)]);
    expect(rows[0]).toMatchObject({ path: "gone.md", present: false });
  });

  it("places inherited rows between attached and unattached, once each, with their skill", () => {
    const rows = buildRows(docs, [att("a.md")], [inh("c.md"), inh("a.md")]);
    expect(rows.map((r) => [r.path, r.kind])).toEqual([
      ["a.md", "attached"],
      ["c.md", "inherited"],
      ["b.md", "available"],
      ["specs/d.md", "available"],
    ]);
    expect(rows[1]!.skillName).toBe("Security Rules");
  });

  it("takes the category of a listed document from the list", () => {
    expect(buildRows([doc("notes.md", "insights")], [att("notes.md")])[0]!.category).toBe("insights");
  });
});

describe("filterRows", () => {
  const rows = buildRows([doc("specs/public-api.md"), doc("docs/deploy.md")], [att("docs/deploy.md")]);
  it("matches the path case-insensitively and keeps attached matches", () => {
    expect(filterRows(rows, "API").map((r) => r.path)).toEqual(["specs/public-api.md"]);
    expect(filterRows(rows, "DEPLOY").map((r) => r.path)).toEqual(["docs/deploy.md"]);
  });
  it("returns every row for an empty query", () => {
    expect(filterRows(rows, "")).toHaveLength(2);
  });
});

describe("toggleAttachment", () => {
  it("appends an unattached path to the end (AC-28)", () => {
    expect(toggleAttachment(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });
  it("removes an attached path (AC-29)", () => {
    expect(toggleAttachment(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("moveAttachment / dropAttachment", () => {
  it("moves one place up or down", () => {
    expect(moveAttachment(["a", "b"], "b", -1)).toEqual(["b", "a"]);
    expect(moveAttachment(["a", "b"], "a", 1)).toEqual(["b", "a"]);
  });
  it("returns the same contents when the move falls off an end", () => {
    expect(moveAttachment(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveAttachment(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
  it("drops a path onto another's position", () => {
    expect(dropAttachment(["a", "b"], "b", "a")).toEqual(["b", "a"]);
  });
  it("ignores a drop onto a path that is not attached", () => {
    expect(dropAttachment(["a", "b"], "b", "zzz")).toEqual(["a", "b"]);
  });
});
