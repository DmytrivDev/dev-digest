import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrBrief, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";

const mutate = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSmartDiff: () => smartDiffData,
  usePrReviews: () => reviewsData,
  useFindingAction: () => ({ mutate, ...findingActionState }),
}));

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: briefData === null ? undefined : { brief: briefData, generating: false, stale: false } }),
}));

import { DiffTab } from "./DiffTab";
import { parseDiffTarget } from "./helpers";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  findingActionState = { isPending: false, variables: undefined };
  briefData = null;
});

let smartDiffData: { data: SmartDiff | undefined } = { data: undefined };
let briefData: PrBrief | null = null;
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
      messages={{ prReview: prReviewMessages, shell: shellMessages, brief: briefMessages }}
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

describe("DiffTab — deep link (?file=&line=)", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    smartDiffData = { data: fullSmartDiff() };
    reviewsData = { data: [] };
  });

  // The boilerplate lockfile is collapsed by default AND over the 200-line
  // auto-expand ceiling, so it only shows its lines when the link targets it.
  const LOCK_LINE = "lockfileVersion: 9";
  const DEEP_FILES: PrFile[] = FILES.map((f) =>
    f.path === "pnpm-lock.yaml"
      ? { ...f, additions: 300, patch: `@@ -1,1 +1,2 @@
+${LOCK_LINE}
 x` }
      : f,
  );

  function renderWith(query: string, files: PrFile[] = DEEP_FILES) {
    return render(
      <NextIntlClientProvider
        locale="en"
        messages={{ prReview: prReviewMessages, shell: shellMessages, brief: briefMessages }}
      >
        <DiffTab
          prId="pr1"
          filesCount={files.length}
          files={files}
          canComment={false}
          focus={parseDiffTarget(new URLSearchParams(query))}
        />
      </NextIntlClientProvider>,
    );
  }

  const scrolledElement = (n = 0) => scrollIntoView.mock.contexts[n] as HTMLElement;

  it("a boilerplate target expands its role group and its card", () => {
    renderWith("tab=diff&file=pnpm-lock.yaml");
    expect(screen.getByText(LOCK_LINE)).toBeInTheDocument();
  });

  it("without a link the boilerplate group stays collapsed and nothing scrolls", () => {
    renderWith("tab=diff");
    expect(screen.queryByText(LOCK_LINE)).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("an unknown file renders the normal diff: no error, nothing expanded, no scroll", () => {
    renderWith("tab=diff&file=nope.ts&line=3");
    expect(screen.queryByText(LOCK_LINE)).not.toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a malformed line (line=0) is no target at all", () => {
    renderWith("tab=diff&file=pnpm-lock.yaml&line=0");
    expect(screen.queryByText(LOCK_LINE)).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to and highlights the targeted line in Smart order and again in Original order", () => {
    const { container } = renderWith("tab=diff&file=src/config.ts&line=10");
    expect(scrolledElement(0).textContent).toContain("stripeKey: x");
    expect(container.querySelectorAll("[data-highlighted]")).toHaveLength(1);

    scrollIntoView.mockClear();
    fireEvent.click(screen.getByText("Original order"));
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrolledElement(0).textContent).toContain("stripeKey: x");
    expect(container.querySelectorAll("[data-highlighted]")).toHaveLength(1);
  });

  it("a line that is not in the diff scrolls the card header instead", () => {
    renderWith("tab=diff&file=src/config.ts&line=9999");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrolledElement(0).textContent).toContain("src/config.ts");
  });
});

describe("DiffTab — PR Brief marks", () => {
  const PATCHED: PrFile[] = [
    {
      path: "src/config.ts",
      additions: 2,
      deletions: 0,
      patch: ["@@ -1,1 +1,3 @@", " line one", "+const key = 'x';", "+const other = 2;"].join("\n"),
    },
  ];

  function brief(): PrBrief {
    return {
      summary: "s",
      risks: {
        risks: [
          { kind: "security", title: "Live key committed", explanation: "A key sits in config.", severity: "high", file_refs: ["src/config.ts:2-3", "src/config.ts"] },
        ],
      },
      review_focus: [{ file: "src/config.ts", line: 3, reason: "Check the second constant" }],
      intent: null,
      blast: null,
      head_sha: "abc",
      generated_at: "2026-10-03T00:00:00.000Z",
      model: "openrouter/x",
      usage: { llm_calls: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0, duration_ms: 1 },
      inputs: [],
      dropped: { risks: 0, review_focus: 0 },
    } as unknown as PrBrief;
  }

  it("marks risk and focus lines with a label and an inline card, like findings", () => {
    briefData = brief();
    smartDiffData = { data: undefined };
    reviewsData = { data: [] };
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages, brief: briefMessages }}>
        <DiffTab prId="pr1" filesCount={1} files={PATCHED} canComment={false} />
      </NextIntlClientProvider>,
    );
    // No Smart Diff → one flat list, the file card open. Row labels (the stripe's text) on line 2 (risk) and line 3 (focus).
    expect(screen.getAllByText("Risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Focus").length).toBeGreaterThan(0);
    // Inline cards with the brief's own text.
    expect(screen.getByText("Live key committed")).toBeInTheDocument();
    expect(screen.getByText("A key sits in config.")).toBeInTheDocument();
    expect(screen.getByText("Check the second constant")).toBeInTheDocument();
    expect(screen.getAllByText("From the PR Brief")).toHaveLength(2);
  });
});
