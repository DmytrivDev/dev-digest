/**
 * FindingsTooltip — the PR list's hover preview. The load-bearing assertion is
 * the NEGATIVE one: the preview is read-only. Accept/Reject lives on the PR
 * page, where a full finding card gives enough context to judge; triaging from
 * a list row that vanishes on mouse-out would be a misclick waiting to happen.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string) => usePrReviews(prId),
}));

import { FindingsTooltip } from "./FindingsTooltip";

afterEach(() => {
  cleanup();
  usePrReviews.mockReset();
});

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal `sk_live_` **Stripe** secret key.",
    suggestion: null,
    confidence: 0.98,
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
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Block before merge.",
    score: 38,
    model: "seed",
    created_at: "2026-06-13T20:52:51.000Z",
    findings: [finding()],
    ...o,
  };
}

function renderTooltip() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTooltip prId="pr-1" />
    </NextIntlClientProvider>,
  );
}

describe("FindingsTooltip", () => {
  it("heads the popup with the latest run's finding count", () => {
    usePrReviews.mockReturnValue({ data: [review()], isLoading: false });
    renderTooltip();
    expect(screen.getByText("1 findings in this run")).toBeInTheDocument();
  });

  it("previews each finding as plain text: title, category, file:line, confidence", () => {
    usePrReviews.mockReturnValue({ data: [review()], isLoading: false });
    renderTooltip();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
    // markdown markers are stripped — a preview is one line of prose
    expect(
      screen.getByText("Line 12 contains a literal sk_live_ Stripe secret key."),
    ).toBeInTheDocument();
  });

  it("renders a line RANGE when the finding spans more than one line", () => {
    usePrReviews.mockReturnValue({
      data: [review({ findings: [finding({ start_line: 45, end_line: 52 })] })],
      isLoading: false,
    });
    renderTooltip();
    expect(screen.getByText("src/config.ts:45-52")).toBeInTheDocument();
  });

  it("has NO buttons — previews are read-only (Accept/Reject stays on the PR page)", () => {
    usePrReviews.mockReturnValue({ data: [review()], isLoading: false });
    const { container } = renderTooltip();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.querySelectorAll("button, a, input")).toHaveLength(0);
  });

  it("skips summary records — it must count the same review the column does", () => {
    usePrReviews.mockReturnValue({
      data: [
        review({ id: "r-sum", kind: "summary", findings: [finding({ id: "f-sum" })] }),
        review({ id: "r-rev", findings: [finding({ id: "f-a" }), finding({ id: "f-b" })] }),
      ],
      isLoading: false,
    });
    renderTooltip();
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
  });

  it("says so when the latest run found nothing", () => {
    usePrReviews.mockReturnValue({ data: [review({ findings: [] })], isLoading: false });
    renderTooltip();
    expect(screen.getByText("No findings in the latest run.")).toBeInTheDocument();
  });

  it("fetches lazily: it asks for this PR's reviews only once mounted", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: true });
    renderTooltip();
    expect(usePrReviews).toHaveBeenCalledWith("pr-1");
  });
});
