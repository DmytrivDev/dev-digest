import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("maps the repo-scoped tour route to onboarding-tour", () => {
    expect(activeKeyFor("/repos/x/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/x/onboarding/")).toBe("onboarding-tour");
  });

  it("does not map the add-repository wizard to the tour", () => {
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("does not match a longer segment that merely starts with onboarding", () => {
    expect(activeKeyFor("/repos/x/onboarding-notes")).not.toBe("onboarding-tour");
  });

  it("keeps the Project Context mapping", () => {
    expect(activeKeyFor("/repos/x/context")).toBe("context");
  });
});

describe("activeKeyFor — Eval Dashboard", () => {
  it("is active on /eval and on every path below it", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/abc")).toBe("eval");
  });
});
