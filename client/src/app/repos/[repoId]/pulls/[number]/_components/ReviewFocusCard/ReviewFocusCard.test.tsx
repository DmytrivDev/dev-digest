import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, ReviewFocusItem } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import type { BriefNav } from "../BriefFileRef";
import { ReviewFocusCard } from "./ReviewFocusCard";

afterEach(cleanup);

function brief(focus: ReviewFocusItem[]): PrBrief {
  return {
    summary: "s",
    risks: { risks: [] },
    review_focus: focus,
    intent: null,
    blast: null,
    head_sha: "a1b2c3d4e5f6",
    generated_at: "2026-10-03T00:00:00.000Z",
    model: "openai/gpt-4.1",
    usage: { llm_calls: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0.01, duration_ms: 1 },
    inputs: [],
    dropped: { risks: 0, review_focus: 0 },
  };
}

function renderCard(b: PrBrief | null, inFlight = false, nav: Partial<BriefNav> = {}) {
  const full: BriefNav = {
    prPaths: new Set(["src/config.ts", "src/a.ts", "src/b.ts", "src/c.ts"]),
    blobHref: (p, l) => `https://github.com/acme/api/blob/idx/${p}#L${l}`,
    onOpen: vi.fn(),
    ...nav,
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocusCard brief={b} inFlight={inFlight} nav={full} />
    </NextIntlClientProvider>,
  );
  return { ...view, nav: full };
}

const item = (file: string, line: number, reason = "r"): ReviewFocusItem => ({ file, line, reason });

describe("ReviewFocusCard", () => {
  it("renders the header and a count badge equal to the items shown (AC-4)", () => {
    renderCard(brief([item("src/a.ts", 1), item("src/b.ts", 2), item("src/c.ts", 3), item("src/config.ts", 4)]));
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders `file:line` then ' — reason' as a bulleted row (AC-28)", () => {
    renderCard(brief([item("src/config.ts", 12, "live key")]));
    const li = screen.getByRole("listitem");
    expect(li).toHaveTextContent("src/config.ts:12 — live key");
    expect(screen.getByRole("button", { name: "src/config.ts:12" })).toHaveClass("mono");
  });

  it("opens the file in Files changed on activation (AC-31)", () => {
    const { nav } = renderCard(brief([item("src/config.ts", 12, "live key")]));
    fireEvent.click(screen.getByRole("button", { name: "src/config.ts:12" }));
    expect(nav.onOpen).toHaveBeenCalledWith("src/config.ts", 12);
  });

  // Enter on the focused button (W20 Done means): jsdom does not synthesise a click from a
  // keydown and user-event is not a dependency, so this pins what native button semantics
  // need — a real <button type="button"> that takes focus, is in the tab order, and whose
  // keydown is not cancelled — plus the activation itself.
  it("the focus item is a native, focusable button that opens the file on activation (NFR-1)", () => {
    const { nav } = renderCard(brief([item("src/config.ts", 12, "live key")]));
    const button = screen.getByRole("button", { name: "src/config.ts:12" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toHaveAttribute("tabindex", "-1");
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    fireEvent.click(button);
    expect(nav.onOpen).toHaveBeenCalledWith("src/config.ts", 12);
  });

  it("a blast-only file shows the inline message and does not navigate (AC-33)", () => {
    const { nav } = renderCard(brief([item("src/api/caller.ts", 45)]));
    fireEvent.click(screen.getByRole("button", { name: "src/api/caller.ts:45" }));
    expect(nav.onOpen).not.toHaveBeenCalled();
    expect(screen.getByText(/File not in this PR's diff/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/idx/src/api/caller.ts#L45",
    );
  });

  it("shows the empty text and a '0' badge for zero items (AC-29)", () => {
    renderCard(brief([]));
    expect(
      screen.getByText("No focus lines — nothing the brief could ground in this diff"),
    ).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("says 'not generated yet' when there is no brief, with no badge (AC-7)", () => {
    renderCard(null);
    expect(screen.getByText("Not generated yet.")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows three skeleton rows while in flight (AC-9)", () => {
    const { container } = renderCard(brief([item("src/a.ts", 1)]), true);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders the reason literally — no element, no link (AC-30)", () => {
    const xss = "<img src=x onerror=alert(1)> https://evil.example";
    const { container } = renderCard(brief([item("src/a.ts", 1, xss)]));
    expect(screen.getByRole("listitem")).toHaveTextContent(xss);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});
