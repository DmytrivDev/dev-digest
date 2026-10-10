import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Checkbox } from "./Checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("toggles through onChange when enabled", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does nothing when disabled, and says so to assistive tech", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} disabled onChange={onChange} label="Pick" />);
    const box = screen.getByRole("checkbox", { name: "Pick" });
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is not marked disabled by default", () => {
    render(<Checkbox checked onChange={() => {}} ariaLabel="Select row" />);
    const box = screen.getByRole("checkbox", { name: "Select row" });
    expect(box).toBeEnabled();
    expect(box).not.toHaveAttribute("aria-disabled");
    expect(box).toHaveAttribute("aria-checked", "true");
  });

  it("names an unlabelled checkbox through ariaLabel", () => {
    render(<Checkbox checked={false} ariaLabel="Select run v7" />);
    expect(screen.getByRole("checkbox", { name: "Select run v7" })).toBeInTheDocument();
  });
});
