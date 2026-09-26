/**
 * BlastRadiusCard — the Overview tab's blast-radius section. Load-bearing
 * assertions: a caller link resolves against the INDEX sha (falling back to
 * the PR head sha), endpoints/crons render as separate chip groups, and no
 * raw i18n key ever leaks (client/CLAUDE.md).
 */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";

const usePrBlast = vi.fn();
const usePrHistory = vi.fn();
const resyncStart = vi.fn();
let resyncRunning = false;
let resyncJustCompleted = false;
vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: (prId: string) => usePrBlast(prId),
  usePrHistory: (prId: string, opts: unknown) => usePrHistory(prId, opts),
  useBlastResync: () => ({
    start: resyncStart,
    isRunning: resyncRunning,
    justCompleted: resyncJustCompleted,
  }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

beforeEach(() => {
  usePrHistory.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(() => {
  cleanup();
  usePrBlast.mockReset();
  usePrHistory.mockReset();
  resyncStart.mockReset();
  resyncRunning = false;
  resyncJustCompleted = false;
});

function blast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [{ name: "rateLimit", file: "src/mw.ts", kind: "function" }],
    downstream: [
      {
        symbol: "rateLimit",
        callers: [{ name: "publicRouter", file: "src/routes.ts", line: 23 }],
        endpoints_affected: ["GET /x"],
        crons_affected: ["reset-buckets (hourly)"],
      },
    ],
    summary: "1 symbol changed → 1 caller, 1 endpoint, 1 cron",
    counts: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof BlastRadiusCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadiusCard
        repoId="repo-1"
        prId="pr-1"
        repoFullName="o/r"
        headSha="headsha123"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function expectNoRawKeys(container: HTMLElement) {
  const text = container.textContent ?? "";
  expect(text).not.toMatch(/\bblast\.[a-zA-Z]+(\.[a-zA-Z]+)*\b/);
}

describe("BlastRadiusCard", () => {
  it("shows the four summary counts", () => {
    usePrBlast.mockReturnValue({ data: blast(), isLoading: false, isError: false });
    const { container } = renderCard();
    expect(screen.getAllByText("1")).toHaveLength(4);
    expect(screen.getByText("symbols")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expectNoRawKeys(container);
  });

  it("a caller link resolves against the indexed_sha", () => {
    usePrBlast.mockReturnValue({
      data: blast({ indexed_sha: "sha-index" }),
      isLoading: false,
      isError: false,
    });
    renderCard();
    const link = screen.getByText("src/routes.ts:23").closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/o/r/blob/sha-index/src/routes.ts#L23");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("falls back to headSha when there is no indexed_sha", () => {
    usePrBlast.mockReturnValue({ data: blast(), isLoading: false, isError: false });
    renderCard();
    const link = screen.getByText("src/routes.ts:23").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/o/r/blob/headsha123/src/routes.ts#L23",
    );
  });

  it("renders endpoints and crons as separate chip groups", () => {
    usePrBlast.mockReturnValue({ data: blast(), isLoading: false, isError: false });
    renderCard();
    expect(screen.getByText("GET /x")).toBeInTheDocument();
    expect(screen.getByText("reset-buckets (hourly)")).toBeInTheDocument();
  });

  it("shows the empty state when downstream is []", () => {
    usePrBlast.mockReturnValue({
      data: blast({ downstream: [], counts: { symbols: 1, callers: 0, endpoints: 0, crons: 0 } }),
      isLoading: false,
      isError: false,
    });
    renderCard();
    expect(screen.getByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("shows the degraded badge with the reason text, and Resync calls start", () => {
    usePrBlast.mockReturnValue({
      data: blast({ degraded: true, reason: "index_partial" }),
      isLoading: false,
      isError: false,
    });
    renderCard();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(
      screen.getByText("The repo index is only partially built — some callers may be missing."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Resync"));
    expect(resyncStart).toHaveBeenCalledTimes(1);
  });

  it("shows a Resync complete notice when justCompleted is true", () => {
    resyncJustCompleted = true;
    usePrBlast.mockReturnValue({
      data: blast({ degraded: true, reason: "index_partial" }),
      isLoading: false,
      isError: false,
    });
    renderCard();
    expect(screen.getByText("Resync complete")).toBeInTheDocument();
  });

  it("hides the Resync button for files_unavailable", () => {
    usePrBlast.mockReturnValue({
      data: blast({ degraded: true, reason: "files_unavailable", changed_symbols: [], downstream: [] }),
      isLoading: false,
      isError: false,
    });
    renderCard();
    expect(screen.queryByText("Resync")).not.toBeInTheDocument();
  });

  it("the Graph toggle switches to an element with role img", () => {
    usePrBlast.mockReturnValue({ data: blast(), isLoading: false, isError: false });
    renderCard();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Graph"));
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders no raw i18n key", () => {
    usePrBlast.mockReturnValue({ data: blast(), isLoading: false, isError: false });
    const { container } = renderCard();
    expectNoRawKeys(container);
  });
});
