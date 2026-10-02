import { describe, it, expect } from "vitest";
import { activeSection } from "./helpers";
import { SECTION_KINDS } from "./constants";

const tops = (values: number[]) =>
  SECTION_KINDS.map((kind, i) => ({ kind, top: values[i] ?? 0 }));

describe("activeSection", () => {
  it("picks the last section whose top has reached the offset (AC-93)", () => {
    expect(activeSection(tops([-900, -500, -10, 300, 800]), 0)).toBe("how_to_run");
  });

  it("falls back to the first section when none has reached the offset", () => {
    expect(activeSection(tops([40, 400, 900, 1300, 1800]), 0)).toBe("architecture_overview");
  });

  it("treats a top exactly at the offset as reached", () => {
    expect(activeSection(tops([-10, 0, 300, 600, 900]), 0)).toBe("critical_paths");
  });

  it("picks the last section once every section is above the offset", () => {
    expect(activeSection(tops([-900, -700, -500, -300, -100]), 0)).toBe("first_tasks");
  });

  it("honours a non-zero offset", () => {
    expect(activeSection(tops([-300, 50, 200, 500, 900]), 96)).toBe("critical_paths");
  });

  it("returns null for no sections", () => {
    expect(activeSection([], 0)).toBeNull();
  });
});
