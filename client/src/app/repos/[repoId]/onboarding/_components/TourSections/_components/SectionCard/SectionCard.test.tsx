import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { SectionCard } from "./SectionCard";

afterEach(cleanup);

function renderCards() {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <SectionCard kind="critical_paths">
        <p>critical body</p>
      </SectionCard>
      <SectionCard kind="how_to_run">
        <p>run body</p>
      </SectionCard>
    </NextIntlClientProvider>,
  );
}

describe("SectionCard", () => {
  it("is expanded on load, titled and addressable by its kind (AC-90, AC-91)", () => {
    renderCards();
    const header = screen.getByRole("button", { name: "Critical paths" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("critical body")).toBeVisible();
    const section = screen.getByRole("region", { name: "Critical paths" });
    expect(section).toHaveAttribute("id", "critical_paths");
  });

  it("collapses only the clicked card, and a second click expands it again (AC-91)", () => {
    renderCards();
    const critical = screen.getByRole("button", { name: "Critical paths" });
    const run = screen.getByRole("button", { name: "How to run locally" });

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("critical body")).not.toBeVisible();
    expect(run).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("run body")).toBeVisible();

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("critical body")).toBeVisible();
  });

  it("has a header that is a real button controlling its body (keyboard-operable)", () => {
    renderCards();
    const header = screen.getByRole("button", { name: "Critical paths" });
    expect(header.tagName).toBe("BUTTON");
    expect(header).toHaveAttribute("type", "button");
    const controlled = document.getElementById(header.getAttribute("aria-controls") ?? "");
    expect(controlled).toContainElement(screen.getByText("critical body"));
  });
});
