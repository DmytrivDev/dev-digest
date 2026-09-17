import { describe, it, expect } from "vitest";
import { formatCost } from "./cost";

describe("formatCost", () => {
  it("distinguishes missing data from a genuine zero", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(0)).toBe("$0.00");
  });

  it("keeps ~2 significant figures for sub-cent runs instead of $0.00", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.00042)).toBe("$0.00042");
    expect(formatCost(0.014)).toBe("$0.014");
  });

  it("trims trailing zeros down to a 2-decimal floor", () => {
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.1)).toBe("$0.10");
  });

  it("uses plain 2 decimals from a dollar up", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(12.3456)).toBe("$12.35");
  });
});
