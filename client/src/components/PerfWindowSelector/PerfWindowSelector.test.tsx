import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/agentPerformance.json";
import type { UiWindow } from "@/lib/agent-performance";
import { PerfWindowSelector } from "./PerfWindowSelector";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(value: UiWindow = { kind: "days", days: 30 }) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <PerfWindowSelector value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

const apply = () => screen.getByRole("button", { name: "Apply" });
const start = () => screen.getByLabelText("Start date");
const end = () => screen.getByLabelText("End date");
const pick = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("PerfWindowSelector presets", () => {
  it("marks the current preset pressed", () => {
    setup({ kind: "days", days: 30 });
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the preset and never fetches", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(onChange).toHaveBeenCalledWith({ kind: "days", days: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("buttons are reachable as native buttons (keyboard activates them)", () => {
    setup();
    for (const name of ["1 day", "30 days", "Custom range"]) {
      expect(screen.getByRole("button", { name }).tagName).toBe("BUTTON");
    }
  });
});

describe("PerfWindowSelector custom range (AC-34)", () => {
  it("reveals the date inputs with Apply disabled and the reason shown", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    expect(apply()).toBeDisabled();
    expect(screen.getByText("Pick both a start and an end date.")).toBeInTheDocument();
    fireEvent.click(apply());
    expect(onChange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a reversed range", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    pick(start(), "2026-03-05");
    pick(end(), "2026-03-01");
    expect(apply()).toBeDisabled();
    expect(screen.getByText("The start date is after the end date.")).toBeInTheDocument();
    expect(apply()).toHaveAttribute("aria-describedby", screen.getByText(/start date is after/).id);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("explains an end date in the future", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    pick(start(), "2026-03-01");
    pick(end(), "2999-01-01");
    expect(apply()).toBeDisabled();
    expect(screen.getByText("The end date is after today.")).toBeInTheDocument();
  });

  it("explains a range longer than 366 days", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    pick(start(), "2020-01-01");
    pick(end(), "2021-06-01");
    expect(apply()).toBeDisabled();
    expect(screen.getByText("The range is longer than 366 days.")).toBeInTheDocument();
  });

  it("applies a valid range through onChange only", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    pick(start(), "2026-03-01");
    pick(end(), "2026-03-05");
    expect(apply()).toBeEnabled();
    fireEvent.click(apply());
    expect(onChange).toHaveBeenCalledWith({ kind: "custom", start: "2026-03-01", end: "2026-03-05" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens prefilled when the current window is custom", () => {
    setup({ kind: "custom", start: "2026-03-01", end: "2026-03-05" });
    expect(start()).toHaveValue("2026-03-01");
    expect(end()).toHaveValue("2026-03-05");
    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "true");
  });
});
