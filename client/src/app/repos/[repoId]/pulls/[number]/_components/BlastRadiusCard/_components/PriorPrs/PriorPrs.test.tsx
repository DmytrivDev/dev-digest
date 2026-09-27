/**
 * PriorPrs — the Blast Radius card's lazy "Prior PRs touching these files"
 * panel. Load-bearing assertion: the query is called with `enabled: false`
 * while the panel is collapsed and `enabled: true` only once it's opened
 * (the child-mount trick, `client/INSIGHTS.md:11`) — so the real hook never
 * fires a request while collapsed.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistory } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";

const usePrHistory = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({
  usePrHistory: (prId: string, opts: unknown) => usePrHistory(prId, opts),
}));

import { PriorPrs } from "./PriorPrs";

afterEach(() => {
  cleanup();
  usePrHistory.mockReset();
});

function history(overrides: Partial<PrHistory> = {}): PrHistory {
  return {
    history: [
      {
        pr_number: 5,
        title: "Earlier fix",
        merged_at: "2026-01-01T00:00:00.000Z",
        author: "octocat",
        files_overlap: ["src/a.ts"],
        notes: "overlaps 1 changed file.",
      },
    ],
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <PriorPrs prId="pr-1" repoFullName="o/r" />
    </NextIntlClientProvider>,
  );
}

describe("PriorPrs", () => {
  it("queries with enabled:false while collapsed, enabled:true after opening", () => {
    usePrHistory.mockReturnValue({ data: undefined, isLoading: false });
    renderPanel();
    expect(usePrHistory).toHaveBeenCalledWith("pr-1", { enabled: false });

    usePrHistory.mockReturnValue({ data: history(), isLoading: false });
    fireEvent.click(screen.getByText("Prior PRs touching these files"));
    expect(usePrHistory).toHaveBeenLastCalledWith("pr-1", { enabled: true });
  });

  it("renders rows once open, with the count badge read off the query result", () => {
    usePrHistory.mockReturnValue({ data: history(), isLoading: false });
    renderPanel();
    expect(screen.getByText("1")).toBeInTheDocument(); // count badge

    fireEvent.click(screen.getByText("Prior PRs touching these files"));
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByText("Earlier fix")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
  });

  it("shows the no_github text when reason is no_github", () => {
    usePrHistory.mockReturnValue({ data: history({ history: [], reason: "no_github" }), isLoading: false });
    renderPanel();
    fireEvent.click(screen.getByText("Prior PRs touching these files"));
    expect(screen.getByText("Connect a GitHub token to see prior PRs.")).toBeInTheDocument();
  });
});
