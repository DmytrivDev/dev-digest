import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { IconBtn } from "./IconBtn";

afterEach(cleanup);

describe("IconBtn — disabled (SPEC-07)", () => {
  it("renders as before without `disabled`: enabled, no opacity or cursor override", () => {
    render(<IconBtn icon="Play" label="Run" />);
    const btn = screen.getByRole("button", { name: "Run" });
    expect(btn).toBeEnabled();
    expect(btn.style.opacity).toBe("");
    expect(btn.style.cursor).toBe("");
  });

  it("is a disabled button at 0.4 opacity with a not-allowed cursor, and swallows clicks", () => {
    const onClick = vi.fn();
    render(<IconBtn icon="Play" label="Run" disabled onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "Run" });
    expect(btn).toBeDisabled();
    expect(btn.style.opacity).toBe("0.4");
    expect(btn.style.cursor).toBe("not-allowed");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("takes no hover look while disabled", () => {
    render(<IconBtn icon="Play" label="Run" disabled />);
    const btn = screen.getByRole("button", { name: "Run" });
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toBe("transparent");
  });

  it("still takes the hover look when enabled", () => {
    render(<IconBtn icon="Play" label="Run" />);
    const btn = screen.getByRole("button", { name: "Run" });
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toBe("var(--bg-hover)");
  });
});
