import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const mutate = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSmartDiff: () => smartDiffData,
  usePrReviews: () => reviewsData,
  useFindingAction: () => ({ mutate, ...findingActionState }),
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  findingActionState = { isPending: false, variables: undefined };
});

let smartDiffData: { data: SmartDiff | undefined } = { data: undefined };
let reviewsData: { data: ReviewRecord[] | undefined } = { data: undefined };
let findingActionState: { isPending: boolean; variables: { findingId: string } | undefined } = {
  isPending: false,
  variables: undefined,
};

function sdFile(path: string, findingLines: number[] = []): SmartDiff["groups"][number]["files"][number] {
  return { path, pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: findingLines };
}

function fullSmartDiff(): SmartDiff {
  return {
    groups: [
      { role: "core", files: [sdFile("src/config.ts", [10])] },
      { role: "tests", files: [sdFile("test/x.test.ts")] },
      { role: "wiring", files: [sdFile("src/middleware/index.ts")] },
      { role: "docs", files: [sdFile("README.md")] },
      { role: "boilerplate", files: [sdFile("pnpm-lock.yaml")] },
    ],
    split_suggestion: { too_big: false, total_lines: 10, proposed_splits: [] },
  };
}

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 10,
    end_line: 10,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Agent",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...o,
  };
}

const FILES: PrFile[] = [
  { path: "src/config.ts", additions: 1, deletions: 0, patch: "@@ -9,3 +9,4 @@\n   a,\n+  stripeKey: x,\n   b," },
  { path: "test/x.test.ts", additions: 1, deletions: 0, patch: null },
  { path: "src/middleware/index.ts", additions: 1, deletions: 0, patch: null },
  { path: "README.md", additions: 1, deletions: 0, patch: null },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: null },
];

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ prReview: prReviewMessages, shell: shellMessages }}
    >
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment={false} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab", () => {
  it("renders five group headers in order core, tests, wiring, docs, boilerplate", () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [] };
    renderTab();
    const headers = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
    const labels = headers.map((h) => h.textContent);
    expect(labels[0]).toContain("Core");
    expect(labels[1]).toContain("Tests");
    expect(labels[2]).toContain("Wiring");
    expect(labels[3]).toContain("Docs");
    expect(labels[4]).toContain("Boilerplate");
  });

  it('clicking "Original order" removes the headers and keeps every path', () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [] };
    renderTab();
    fireEvent.click(screen.getByText("Original order"));
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    for (const f of FILES) expect(screen.getByText(f.path)).toBeInTheDocument();
  });

  it('a CRITICAL finding on a rendered line shows the "Blocker" label and its FindingCard title', () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ findings: [finding()] })] };
    renderTab();
    expect(screen.getByText("Blocker")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("the file dot is present on the finding's file only", () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ findings: [finding()] })] };
    renderTab();
    const marks = screen.getAllByLabelText("This file has findings");
    expect(marks).toHaveLength(1);
  });

  it("scopes the repeated N-files text with within(groupHeader)", () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [] };
    renderTab();
    const headers = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded") && b.textContent?.includes("1 file"));
    expect(headers.length).toBeGreaterThan(0);
    expect(within(headers[0]!).getByText("1 file")).toBeInTheDocument();
  });
});

describe("DiffTab — notes toggle, review-not-run, accept action (W8)", () => {
  it('clicking "Hide comments" removes the inline FindingCard', () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ findings: [finding()] })] };
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Hide comments/));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it('with no kind:"review" review, "Review not run yet" is visible and no group counter is present', () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ kind: "summary" })] };
    renderTab();
    expect(screen.getByText("Review not run yet")).toBeInTheDocument();
    expect(screen.queryByLabelText(/files with findings/)).not.toBeInTheDocument();
  });

  it("clicking Accept on the inline card calls mutate with {findingId, action, prId}", () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ findings: [finding()] })] };
    renderTab();
    fireEvent.click(screen.getByText("Accept"));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("a pending action for this finding disables its Accept/Dismiss buttons", () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ findings: [finding()] })] };
    findingActionState = { isPending: true, variables: { findingId: "f1" } };
    renderTab();
    expect(screen.getByText("Accept").closest("button")).toBeDisabled();
    expect(screen.getByText("Reject").closest("button")).toBeDisabled();
  });

  it("a pending action for a DIFFERENT finding leaves this card's buttons enabled", () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ findings: [finding()] })] };
    findingActionState = { isPending: true, variables: { findingId: "some-other-finding" } };
    renderTab();
    expect(screen.getByText("Accept").closest("button")).not.toBeDisabled();
  });
});

describe("DiffTab — inline finding collapses to one line (W9)", () => {
  it("clicking the inline card's title row hides its rationale and keeps the title", () => {
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [review({ findings: [finding()] })] };
    renderTab();
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(screen.queryByText("A secret is committed.")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });
});
