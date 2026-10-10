import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { checkPastedDiff } from "@/lib/eval-case-diff";
import evalMessages from "../../../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../../../messages/en/shell.json";
import { DiffInput } from "./DiffInput";

afterEach(cleanup);

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

function paste(rows: number): string {
  const body = Array.from({ length: rows }, (_, i) => `+row ${i}`).join("\n");
  return `+++ b/src/a.ts\n@@ -0,0 +1,${rows} @@\n${body}\n`;
}

/** Controlled host, so typing re-renders DiffInput the way the modal does. */
function Host({ initial }: { initial: string }) {
  const [value, setValue] = React.useState(initial);
  return <DiffInput value={value} onChange={setValue} check={checkPastedDiff(value)} />;
}

function renderInput(initial: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages }}>
      <Host initial={initial} />
    </NextIntlClientProvider>,
  );
}

describe("DiffInput — preview of a large paste", () => {
  it("is expanded for more than 200 changed lines", () => {
    renderInput(paste(300));
    expect(screen.getByText("row 299")).toBeInTheDocument();
  });

  it("does not scroll, on mount or while typing", () => {
    renderInput(paste(300));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: paste(301) } });
    fireEvent.change(box, { target: { value: paste(302) } });
    expect(screen.getByText("row 301")).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("draws no focused outline on the preview card", () => {
    const { container } = renderInput(paste(300));
    const cards = Array.from(container.querySelectorAll<HTMLElement>("[style*='border-color']"));
    expect(cards.some((el) => el.style.borderColor === "var(--accent)")).toBe(false);
  });
});
