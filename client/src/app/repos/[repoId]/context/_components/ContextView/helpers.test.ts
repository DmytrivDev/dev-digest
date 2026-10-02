import { describe, it, expect } from "vitest";
import type { ContextDoc } from "@devdigest/shared";
import { filterDocsByPath, githubBlobUrl, resolveSelection } from "./helpers";

const doc = (path: string): ContextDoc => ({
  path,
  name: path.split("/").pop()!,
  folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
  category: "docs",
  approx_tokens: 1,
});

const DOCS = ["docs/deploy.md", "specs/public-api.md", "README.md"].map(doc);

describe("filterDocsByPath", () => {
  it("keeps documents whose path contains the text, case-insensitively", () => {
    expect(filterDocsByPath(DOCS, "API").map((d) => d.path)).toEqual(["specs/public-api.md"]);
    expect(filterDocsByPath(DOCS, "readme").map((d) => d.path)).toEqual(["README.md"]);
  });

  it("matches on the folder part of the path too", () => {
    expect(filterDocsByPath(DOCS, "docs/").map((d) => d.path)).toEqual(["docs/deploy.md"]);
  });

  it("returns everything for an empty filter and nothing for no match", () => {
    expect(filterDocsByPath(DOCS, "")).toBe(DOCS);
    expect(filterDocsByPath(DOCS, "zzz")).toEqual([]);
  });
});

describe("resolveSelection", () => {
  it("selects the first visible document when nothing was picked", () => {
    expect(resolveSelection(DOCS, DOCS, null)).toBe("docs/deploy.md");
  });

  it("keeps a picked document even when the filter hides it", () => {
    const visible = filterDocsByPath(DOCS, "readme");
    expect(resolveSelection(DOCS, visible, "docs/deploy.md")).toBe("docs/deploy.md");
  });

  it("falls back to the first visible document when the picked one is gone", () => {
    expect(resolveSelection(DOCS, DOCS, "gone.md")).toBe("docs/deploy.md");
  });

  it("selects nothing when no document is visible", () => {
    expect(resolveSelection(DOCS, [], null)).toBeNull();
  });
});

describe("githubBlobUrl", () => {
  it("percent-encodes every path segment", () => {
    expect(githubBlobUrl("acme", "api", "main", "docs/a b.md")).toBe(
      "https://github.com/acme/api/blob/main/docs/a%20b.md",
    );
  });

  it("keeps the slashes of a branch like release/1.x and encodes each part", () => {
    expect(githubBlobUrl("acme", "api", "release/1.x", "README.md")).toBe(
      "https://github.com/acme/api/blob/release/1.x/README.md",
    );
    expect(githubBlobUrl("acme", "api", "feat/a#b", "x.md")).toBe(
      "https://github.com/acme/api/blob/feat/a%23b/x.md",
    );
  });

  it("cannot be steered by ? or # in a path", () => {
    expect(githubBlobUrl("acme", "api", "main", "a?b#c.md")).toBe(
      "https://github.com/acme/api/blob/main/a%3Fb%23c.md",
    );
  });
});
