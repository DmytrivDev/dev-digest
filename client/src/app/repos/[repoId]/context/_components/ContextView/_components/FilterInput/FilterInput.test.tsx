import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FilterInput } from "./FilterInput";

afterEach(cleanup);

describe("FilterInput", () => {
  it("reports typed text through onChange", () => {
    const onChange = vi.fn();
    render(<FilterInput value="" onChange={onChange} placeholder="Filter" label="Filter docs" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter docs" }), {
      target: { value: "api" },
    });
    expect(onChange).toHaveBeenCalledWith("api");
  });

  it("does not suppress the focus outline, so the global :focus-visible ring shows (NFR-3)", () => {
    render(<FilterInput value="" onChange={() => {}} placeholder="Filter" label="Filter docs" />);
    const input = screen.getByRole("textbox", { name: "Filter docs" });
    expect(input.style.outline).toBe("");
    expect(input.style.outlineStyle).not.toBe("none");
  });
});
