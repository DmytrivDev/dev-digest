/**
 * IntentCard — the Overview tab's derived-intent section. The load-bearing
 * assertions: confidence never renders as a percentage (R5 — a discrete tier
 * is not calibrated precision), and no raw i18n key ever leaks through (a
 * missing key renders the key itself, silently — client/CLAUDE.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";

const usePrIntent = vi.fn();
const deriveMutate = vi.fn();
let derivePending = false;
vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: (prId: string) => usePrIntent(prId),
  useDerivePrIntent: () => ({ mutate: deriveMutate, isPending: derivePending }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  usePrIntent.mockReset();
  deriveMutate.mockReset();
  derivePending = false;
});

function intent(o: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    pr_id: "pr-1",
    intent: "Adds a token-bucket rate limiter to the public API endpoints.",
    in_scope: ["Add a token-bucket limiter middleware", "Apply it to public endpoints"],
    out_of_scope: ["Changing the authentication model"],
    confidence: "high",
    sources: [
      { kind: "linked_issue", ref: "#482", resolved: true, detail: null },
      { kind: "ticket_key", ref: "PROJ-14", resolved: false, detail: null },
    ],
    model: "openrouter/openai/gpt-4.1-nano",
    derived_at: "2026-09-22T00:00:00.000Z",
    cost_usd: 0.0012,
    ...o,
  };
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentCard prId="pr-1" />
    </NextIntlClientProvider>,
  );
}

/** Guard against a silently-leaked raw i18n key (e.g. "intent.source.foo"). */
function expectNoRawKeys(container: HTMLElement) {
  const text = container.textContent ?? "";
  expect(text).not.toMatch(/\bintent\.[a-zA-Z]+(\.[a-zA-Z]+)*\b/);
}

describe("IntentCard", () => {
  it("renders a loading skeleton while the query is in flight", () => {
    usePrIntent.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = renderCard();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("No intent derived yet.")).not.toBeInTheDocument();
  });

  it("shows an empty state with a Derive intent button that triggers derivation", () => {
    usePrIntent.mockReturnValue({ data: { intent: null }, isLoading: false, isError: false });
    renderCard();
    expect(screen.getByText("No intent derived yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Derive intent"));
    expect(deriveMutate).toHaveBeenCalledWith(undefined);
  });

  it("shows an error state when the query fails", () => {
    usePrIntent.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderCard();
    expect(screen.getByText("Could not derive intent.")).toBeInTheDocument();
  });

  it("renders the loaded intent inside typographic quotes, with two labelled scope columns, no % for any tier, one chip per source, and no raw i18n key leaks", () => {
    usePrIntent.mockReturnValue({ data: { intent: intent() }, isLoading: false, isError: false });
    const { container } = renderCard();

    expect(
      screen.getByText("“Adds a token-bucket rate limiter to the public API endpoints.”"),
    ).toBeInTheDocument();

    expect(screen.getByText("IN SCOPE")).toBeInTheDocument();
    expect(screen.getByText("OUT OF SCOPE")).toBeInTheDocument();
    expect(screen.getByText("Add a token-bucket limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Changing the authentication model")).toBeInTheDocument();

    // Confidence renders as a discrete label, never a percentage (R5).
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+%/);

    // One chip per source, the unresolved one carrying the "unresolved" title.
    expect(screen.getByText("Issue #482")).toBeInTheDocument();
    const ticketChip = screen.getByText("Ticket PROJ-14");
    expect(ticketChip.closest("[title]")).toHaveAttribute(
      "title",
      "Referenced, but could not be read",
    );

    expectNoRawKeys(container);
  });

  it.each(["high", "medium", "low"] as const)(
    "renders its own confidence label for the %s tier",
    (tier) => {
      usePrIntent.mockReturnValue({
        data: { intent: intent({ confidence: tier }) },
        isLoading: false,
        isError: false,
      });
      renderCard();
      const expected = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" }[tier];
      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );

  it("shows a labelled Recalculate button, not the empty-state Derive intent button, and forces re-derivation", () => {
    usePrIntent.mockReturnValue({ data: { intent: intent() }, isLoading: false, isError: false });
    renderCard();

    const recalculate = screen.getByRole("button", { name: "Recalculate" });
    expect(recalculate).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Derive intent" })).not.toBeInTheDocument();

    fireEvent.click(recalculate);
    expect(deriveMutate).toHaveBeenCalledWith(true);
  });

  it("disables the button and shows Recalculating… while a recalculation is in flight", () => {
    derivePending = true;
    usePrIntent.mockReturnValue({ data: { intent: intent() }, isLoading: false, isError: false });
    renderCard();

    const recalculating = screen.getByRole("button", { name: /Recalculating/ });
    expect(recalculating).toBeDisabled();
  });
});
