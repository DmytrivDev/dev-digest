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

describe("Eval Dashboard sidebar entry", () => {
  const lab = NAV.find((g) => g.section === "SKILLS LAB");
  const entry = lab?.items.find((i) => i.key === "eval");

  it("is in SKILLS LAB with the Gauge icon, linking to /eval", () => {
    expect(entry).toMatchObject({ label: "Eval Dashboard", icon: "Gauge", href: "/eval" });
  });

  it("sits last in SKILLS LAB, after Conventions, as in the mock (chrome.jsx:13)", () => {
    const keys = lab?.items.map((i) => i.key);
    expect(keys?.at(-1)).toBe("eval");
    expect(keys?.indexOf("eval")).toBe((keys?.indexOf("conventions") ?? -2) + 1);
  });

  it("is not repo-scoped, so resolveHref leaves it alone", () => {
    expect(resolveHref(entry!.href, "r-42")).toBe("/eval");
  });
});
