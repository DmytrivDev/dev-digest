import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/agentPerformance.json";
import { EstimateLabel } from "./EstimateLabel";

afterEach(cleanup);

function show(basis: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <EstimateLabel basis={basis} />
    </NextIntlClientProvider>,
  );
}

describe("EstimateLabel (AC-49)", () => {
  it("shows the label and hides the explanation by default", () => {
    show("estimate");
    expect(screen.getByText("DevDigest estimate")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the explanation on hover and hides it on leave", () => {
    show("estimate");
    const label = screen.getByText("DevDigest estimate");
    fireEvent.mouseEnter(label.parentElement!);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/not reconciled with provider billing/);
    fireEvent.mouseLeave(label.parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the explanation on focus, linked by aria-describedby, and closes on Escape", () => {
    show("estimate");
    const label = screen.getByText("DevDigest estimate");
    expect(label).toHaveAttribute("tabindex", "0");
    fireEvent.focus(label);
    const tip = screen.getByRole("tooltip");
    expect(label).toHaveAttribute("aria-describedby", tip.id);
    fireEvent.keyDown(label, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders nothing for any other basis", () => {
    const { container } = show("billed");
    expect(container).toBeEmptyDOMElement();
  });
});
