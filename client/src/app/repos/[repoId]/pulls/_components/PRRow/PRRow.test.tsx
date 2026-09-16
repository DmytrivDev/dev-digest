/**
 * PRRow — the PR-list row. Guards the COST cell and, structurally, the table's
 * silent-misalignment trap: `COLUMN_KEYS` (header cells), `GRID` (grid tracks)
 * and the cells rendered here are three parallel lists that must stay the same
 * length — when they drift, nothing throws, the columns just slide sideways.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { COLUMN_KEYS, GRID } from "../../constants";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc1234",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "reviewed",
    opened_at: "2026-06-11T09:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z",
    score: 61,
    cost_usd: 0.014,
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — COST cell", () => {
  it("renders the latest batch cost for a priced PR", () => {
    renderRow(pr());
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("renders '—' for a PR with no priced run, never '$0.00'", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("keeps a genuine zero visible as $0.00", () => {
    renderRow(pr({ cost_usd: 0 }));
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });
});

describe("PRRow — table alignment", () => {
  it("renders exactly one cell per column key, and GRID has one track per key", () => {
    const { container } = renderRow(pr());
    const row = container.firstElementChild as HTMLElement;
    expect(row.children).toHaveLength(COLUMN_KEYS.length);
    expect(GRID.trim().split(/\s+/)).toHaveLength(COLUMN_KEYS.length);
  });
});
