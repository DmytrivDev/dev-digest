import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/brief.json";
import { BriefFileRef, type BriefNav } from "./BriefFileRef";

afterEach(cleanup);

function renderRef(path: string, line: number | null, nav: Partial<BriefNav> = {}) {
  const full: BriefNav = {
    prPaths: new Set(["src/in-diff.ts"]),
    blobHref: (p, l) => `https://github.com/acme/api/blob/idx/${p}#L${l}`,
    onOpen: vi.fn(),
    ...nav,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <BriefFileRef path={path} line={line} label={`${path}:${line}`} nav={full} />
    </NextIntlClientProvider>,
  );
  return full;
}

describe("BriefFileRef", () => {
  it("opens a PR file in Files changed with its line (AC-31)", () => {
    const nav = renderRef("src/in-diff.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: "src/in-diff.ts:12" }));
    expect(nav.onOpen).toHaveBeenCalledWith("src/in-diff.ts", 12);
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
  });

  it("passes a null line through", () => {
    const nav = renderRef("src/in-diff.ts", null);
    fireEvent.click(screen.getByRole("button"));
    expect(nav.onOpen).toHaveBeenCalledWith("src/in-diff.ts", null);
  });

  it("shows the inline message and a GitHub link for a file outside the diff, and does not navigate (AC-33, AC-34)", () => {
    const nav = renderRef("src/caller.ts", 88);
    fireEvent.click(screen.getByRole("button"));
    expect(nav.onOpen).not.toHaveBeenCalled();
    expect(screen.getByText(/File not in this PR's diff/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/blob/idx/src/caller.ts#L88");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the message without a link when none can be built", () => {
    renderRef("src/caller.ts", 88, { blobHref: () => null });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // NFR-1: Enter/Space on the focused control. jsdom does not turn a keydown into a
  // click, so Enter cannot be driven end to end here (and @testing-library/user-event
  // is not a dependency). What this pins instead is everything the browser's native
  // button semantics need: a real <button type="button"> that takes focus, is in the
  // tab order, and whose keydown nothing cancels. Given that, the browser fires the
  // same click that the first test shows opens the file.
  it("is a native, focusable button that opens the file on activation (NFR-1)", () => {
    const nav = renderRef("src/in-diff.ts", 12);
    const button = screen.getByRole("button", { name: "src/in-diff.ts:12" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toHaveAttribute("tabindex", "-1");
    button.focus();
    expect(document.activeElement).toBe(button);
    // fireEvent returns false when a handler called preventDefault (which would block Enter).
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    fireEvent.click(button);
    expect(nav.onOpen).toHaveBeenCalledWith("src/in-diff.ts", 12);
  });
});
