import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { NOW_MS, makeTour } from "../../fixtures";
import { StatusBanner } from "./StatusBanner";

afterEach(cleanup);

function renderBanner(tour: OnboardingTour) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <StatusBanner tour={tour} nowMs={NOW_MS} />
    </NextIntlClientProvider>,
  );
}

describe("StatusBanner", () => {
  it("renders nothing for a complete tour", () => {
    const { container } = renderBanner(makeTour());
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every reason's sentence in one banner (AC-42)", () => {
    renderBanner(makeTour({ reasons: ["index_partial", "no_history"] }));
    const banner = screen.getByRole("status");
    expect(
      within(banner).getByText(
        "The index is partial: some files could not be parsed or indexing ran out of time.",
      ),
    ).toBeInTheDocument();
    expect(
      within(banner).getByText(
        "No commit history was available, so files are ranked by the import graph only.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("links to the API keys settings when no key is configured (AC-46)", () => {
    renderBanner(makeTour({ status: "skeleton", reasons: ["llm_not_configured"] }));
    expect(screen.getByText(/No API key is configured for OpenRouter\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute(
      "href",
      "/settings/api-keys",
    );
  });

  it("has no Settings link for other reasons", () => {
    renderBanner(makeTour({ reasons: ["no_history"] }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the failed-regeneration line with the reason and the tour's age (AC-22)", () => {
    renderBanner(
      makeTour({ last_failure: { reason: "llm_timeout", at: "2026-10-02T11:00:00.000Z" } }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Regeneration failed: The model did not answer within 120 seconds. — showing the tour from 2h ago",
    );
  });
});
