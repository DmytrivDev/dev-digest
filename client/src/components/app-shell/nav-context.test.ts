import { describe, it, expect } from "vitest";
import { NAV, resolveHref } from "@devdigest/ui";

describe("Project Context sidebar entry", () => {
  const workspace = NAV.find((g) => g.section === "WORKSPACE");
  const entry = workspace?.items.find((i) => i.key === "context");

  it("is in the WORKSPACE group, after Pull Requests", () => {
    expect(entry).toMatchObject({
      key: "context",
      label: "Project Context",
      href: "/repos/:repoId/context",
    });
    const keys = workspace?.items.map((i) => i.key);
    expect(keys?.indexOf("context")).toBe((keys?.indexOf("pulls") ?? -2) + 1);
  });

  it("resolves :repoId with the active repository id", () => {
    expect(resolveHref(entry!.href, "r-42")).toBe("/repos/r-42/context");
  });
});
