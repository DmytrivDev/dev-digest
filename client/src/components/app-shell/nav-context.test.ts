import { describe, it, expect } from "vitest";
import { NAV, resolveHref } from "@devdigest/ui";

describe("Project Context sidebar entry", () => {
  const workspace = NAV.find((g) => g.section === "WORKSPACE");
  const entry = workspace?.items.find((i) => i.key === "context");

  it("is in the WORKSPACE group, after Onboarding Tour", () => {
    expect(entry).toMatchObject({
      key: "context",
      label: "Project Context",
      href: "/repos/:repoId/context",
    });
    const keys = workspace?.items.map((i) => i.key);
    expect(keys?.indexOf("context")).toBe((keys?.indexOf("onboarding-tour") ?? -2) + 1);
  });

  it("orders WORKSPACE as pulls, onboarding-tour, context", () => {
    expect(workspace?.items.map((i) => i.key)).toEqual(["pulls", "onboarding-tour", "context"]);
  });

  it("has the Onboarding Tour entry with the g o shortcut", () => {
    const tour = workspace?.items.find((i) => i.key === "onboarding-tour");
    expect(tour).toMatchObject({
      label: "Onboarding Tour",
      icon: "Workflow",
      href: "/repos/:repoId/onboarding",
      gKey: "o",
    });
    expect(resolveHref(tour!.href, "r-42")).toBe("/repos/r-42/onboarding");
  });

  it("resolves :repoId with the active repository id", () => {
    expect(resolveHref(entry!.href, "r-42")).toBe("/repos/r-42/context");
  });
});
