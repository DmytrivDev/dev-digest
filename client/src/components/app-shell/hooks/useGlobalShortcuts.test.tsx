import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1" }),
}));

import { useGlobalShortcuts } from "./useGlobalShortcuts";

const noop = () => {};

function Probe() {
  useGlobalShortcuts({ onOpenPalette: noop, onOpenHelp: noop });
  return <input aria-label="field" />;
}

beforeEach(() => push.mockClear());
afterEach(cleanup);

describe("useGlobalShortcuts g o", () => {
  it("navigates to the repo-scoped Onboarding Tour on g then o", () => {
    render(<Probe />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "o" });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/repos/r1/onboarding");
  });

  it("ignores the chord while a text input has focus", () => {
    const { getByLabelText } = render(<Probe />);
    const input = getByLabelText("field");
    input.focus();
    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(input, { key: "o" });
    expect(push).not.toHaveBeenCalled();
  });
});
