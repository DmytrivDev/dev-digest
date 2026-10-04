import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { NOW_MS, makeTour } from "../../fixtures";
import { TourHeader } from "./TourHeader";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(cleanup);

function renderHeader(
  tour: OnboardingTour = makeTour(),
  props: Partial<{
    showRegenerate: boolean;
    regenerateDisabled: boolean;
    onRegenerate: () => void;
  }> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourHeader
        tour={tour}
        repoName="payments-api"
        nowMs={NOW_MS}
        showRegenerate
        regenerateDisabled={false}
        onRegenerate={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("TourHeader", () => {
  it("shows the repo name in a monospace element after the title (AC-28)", () => {
    renderHeader();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Onboarding for payments-api");
    expect(screen.getByText("payments-api")).toHaveClass("mono");
  });

  it("renders the provenance subtitle (AC-29)", () => {
    renderHeader();
    expect(
      screen.getByText(
        "Generated from 4,812 indexed source files · branch main @ a1e59f2 · last refreshed 2h ago",
      ),
    ).toBeInTheDocument();
  });

  it("shows the stale notice only for a stale tour (AC-33)", () => {
    const { unmount } = renderHeader(makeTour({ stale: true }));
    expect(screen.getByText("Index has changed since this tour was generated")).toBeInTheDocument();
    unmount();
    renderHeader(makeTour({ stale: false }));
    expect(screen.queryByText(/Index has changed/)).not.toBeInTheDocument();
  });

  it("calls onRegenerate, and disables the button while it is not allowed", () => {
    const onRegenerate = vi.fn();
    const { unmount } = renderHeader(makeTour(), { onRegenerate });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    unmount();
    renderHeader(makeTour(), { regenerateDisabled: true, onRegenerate });
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("has no Regenerate button when the repository has no clone (AC-7)", () => {
    renderHeader(makeTour(), { showRegenerate: false });
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("puts the page URL on the clipboard and confirms (AC-34)", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it("puts the tour as Markdown on the clipboard and confirms (AC-35)", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    expect(await screen.findByRole("button", { name: "Markdown copied" })).toBeInTheDocument();
    const text = writeText.mock.calls[0]![0] as string;
    expect(text.startsWith("# Onboarding for payments-api\n")).toBe(true);
    expect(text).toContain("## First tasks");
  });

  it("claims nothing when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
  });
});
