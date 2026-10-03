/**
 * OverviewTab — the PR Brief container. Load-bearing assertions: the DOM order of
 * the sections (AC-1), that Intent and Blast radius render with or without a brief
 * (AC-5), exactly one POST per Generate click and none on mount (AC-8, AC-47), the
 * skeletons for both in-flight triggers (AC-9), the navigation hand-off of a focus
 * item (AC-31), and that no raw i18n key leaks (NFR-3).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius, PrBrief, PrBriefResponse, PrFile, PrIntentRecord, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { ApiError } from "@/lib/api";

const usePrBrief = vi.fn();
const generateMutate = vi.fn();
let generateState: { isPending: boolean; error: Error | null } = { isPending: false, error: null };
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: (prId: string) => usePrBrief(prId),
  useGeneratePrBrief: () => ({ mutate: generateMutate, ...generateState }),
}));

const usePrIntent = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: (prId: string) => usePrIntent(prId),
  useDerivePrIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

const usePrBlast = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: (prId: string) => usePrBlast(prId),
  usePrHistory: () => ({ data: undefined, isLoading: false }),
  useBlastResync: () => ({ start: vi.fn(), isRunning: false, justCompleted: false }),
}));

import { OverviewTab } from "./OverviewTab";

const onOpenInDiff = vi.fn();

beforeEach(() => {
  usePrIntent.mockReturnValue({ data: { intent: intent() }, isLoading: false, isError: false });
  usePrBlast.mockReturnValue({ data: blast(), isLoading: false, isError: false });
  usePrBrief.mockReturnValue({ data: envelope(null), isLoading: false, error: null });
});

afterEach(() => {
  cleanup();
  usePrBrief.mockReset();
  usePrIntent.mockReset();
  usePrBlast.mockReset();
  generateMutate.mockReset();
  onOpenInDiff.mockReset();
  generateState = { isPending: false, error: null };
});

function intent(): PrIntentRecord {
  return {
    pr_id: "pr-1",
    intent: "Adds a token-bucket rate limiter.",
    in_scope: ["Add middleware"],
    out_of_scope: ["Auth changes"],
    confidence: "high",
    sources: [],
    model: "m",
    derived_at: "2026-09-22T00:00:00.000Z",
    cost_usd: 0.001,
  };
}

function blast(): BlastRadius {
  return {
    changed_symbols: [{ name: "rateLimit", file: "src/mw.ts", kind: "function" }],
    downstream: [
      {
        symbol: "rateLimit",
        callers: [{ name: "publicRouter", file: "src/routes.ts", line: 23 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: "1 symbol changed → 1 caller",
    counts: { symbols: 1, callers: 1, endpoints: 0, crons: 0 },
  };
}

function makeBrief(o: Partial<PrBrief> = {}): PrBrief {
  return {
    summary: "Solid middleware, but a secret is committed.",
    risks: {
      risks: [
        {
          kind: "security",
          title: "Auth surface touched",
          explanation: "why",
          severity: "high",
          file_refs: ["src/config.ts:12-18"],
        },
      ],
    },
    review_focus: [{ file: "src/config.ts", line: 12, reason: "live key" }],
    intent: null,
    blast: null,
    head_sha: "a1b2c3d4e5f6",
    generated_at: "2026-10-03T00:00:00.000Z",
    model: "openai/gpt-4.1",
    usage: { llm_calls: 1, tokens_in: 8200, tokens_out: 1300, cost_usd: 0.014, duration_ms: 900 },
    inputs: [],
    dropped: { risks: 0, review_focus: 0 },
    ...o,
  };
}

function envelope(brief: PrBrief | null, o: Partial<PrBriefResponse> = {}): PrBriefResponse {
  return { brief, generating: false, stale: false, ...o };
}

const files: PrFile[] = [
  { path: "src/config.ts", additions: 4, deletions: 0, patch: null },
  { path: "src/api/users.ts", additions: 2, deletions: 1, patch: null },
];

function makeReview(): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 61,
    model: null,
    created_at: "2026-10-03T00:00:00.000Z",
    findings: [],
  };
}

function renderTab(props: Partial<React.ComponentProps<typeof OverviewTab>> = {}) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: briefMessages, blast: blastMessages, prReview: prReviewMessages }}
    >
      <OverviewTab
        prId="pr-1"
        prBody="The PR description."
        repoId="repo-1"
        repoFullName="acme/api"
        headSha="a1b2c3d4e5f6"
        reviews={[]}
        files={files}
        onOpenInDiff={onOpenInDiff}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

/** True when `a` comes before `b` in document order. */
function before(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** The direct child of the brief section that renders `title` (a card's own root). */
function sectionChildWith(title: string): HTMLElement {
  const heading = screen.getByText(title);
  let node: HTMLElement = heading;
  while (node.parentElement && node.parentElement.tagName !== "SECTION") node = node.parentElement;
  return node;
}

describe("OverviewTab", () => {
  it("renders label, banner, Intent, Blast radius, Review focus and Description in that order (AC-1)", () => {
    usePrBrief.mockReturnValue({ data: envelope(makeBrief()), isLoading: false, error: null });
    renderTab();
    const order = [
      screen.getByText("PR Brief"),
      screen.getByText("Solid middleware, but a secret is committed."),
      screen.getByText("Intent"),
      screen.getByText("Blast radius"),
      screen.getByText("Review focus — read these first"),
      screen.getByText("Description"),
    ];
    for (let i = 0; i < order.length - 1; i++) {
      expect(before(order[i]!, order[i + 1]!), `section ${i} before ${i + 1}`).toBe(true);
    }
  });

  it("puts the Risk areas block in the Intent card, after a divider (AC-3)", () => {
    usePrBrief.mockReturnValue({ data: envelope(makeBrief()), isLoading: false, error: null });
    renderTab();
    const card = within(sectionChildWith("Intent"));
    const divider = card.getByRole("separator");
    const riskLabel = card.getByText("Risk areas");
    expect(before(divider, riskLabel)).toBe(true);
    expect(card.getByText("Auth surface touched")).toBeInTheDocument();
  });

  it("stacks Intent above Blast radius as separate full-width rows of the brief section (AC-1, AC-2)", () => {
    renderTab();
    const intent = sectionChildWith("Intent");
    const blast = sectionChildWith("Blast radius");
    expect(intent).not.toBe(blast);
    expect(intent.parentElement).toBe(blast.parentElement);
    expect(before(intent, blast)).toBe(true);
  });

  it("with no brief, Intent and Blast radius keep their content and the Generate button shows (AC-5, AC-6, AC-7)", () => {
    renderTab();
    expect(screen.getByText("“Adds a token-bucket rate limiter.”")).toBeInTheDocument();
    expect(screen.getByText("src/routes.ts:23")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(screen.getAllByText("Not generated yet.")).toHaveLength(2);
  });

  it("with a brief, Intent and Blast radius render the same content (AC-5)", () => {
    usePrBrief.mockReturnValue({ data: envelope(makeBrief()), isLoading: false, error: null });
    renderTab();
    expect(screen.getByText("“Adds a token-bucket rate limiter.”")).toBeInTheDocument();
    expect(screen.getByText("src/routes.ts:23")).toBeInTheDocument();
  });

  it("does not request a generation on mount (AC-47)", () => {
    usePrBrief.mockReturnValue({ data: envelope(makeBrief()), isLoading: false, error: null });
    renderTab();
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("one Generate click is one mutation (AC-8)", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("shows three skeleton rows in each of banner, Risk areas and Review focus while the POST is pending (AC-9)", () => {
    generateState = { isPending: true, error: null };
    renderTab();
    expectThreeSkeletonSections();
  });

  it("shows the same skeletons while the server reports `generating` (AC-9)", () => {
    usePrBrief.mockReturnValue({ data: envelope(null, { generating: true }), isLoading: false, error: null });
    renderTab();
    expectThreeSkeletonSections();
  });

  it("hands a focus item to onOpenInDiff with its file and line (AC-31)", () => {
    usePrBrief.mockReturnValue({ data: envelope(makeBrief()), isLoading: false, error: null });
    renderTab();
    const focus = screen.getByText("Review focus — read these first").closest("div[style*='border']")!;
    fireEvent.click(within(focus as HTMLElement).getByRole("button", { name: "src/config.ts:12" }));
    expect(onOpenInDiff).toHaveBeenCalledWith("src/config.ts", 12);
  });

  it("keeps a blast-only focus file on Overview with the inline message (AC-33)", () => {
    usePrBrief.mockReturnValue({
      data: envelope(
        makeBrief({
          review_focus: [{ file: "src/routes.ts", line: 23, reason: "caller" }],
          blast: { ...blast(), indexed_sha: "idxsha" },
        }),
      ),
      isLoading: false,
      error: null,
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "src/routes.ts:23" }));
    expect(onOpenInDiff).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/idxsha/src/routes.ts#L23",
    );
  });

  it("the banner shows the newest review's verdict and score (AC-16)", () => {
    usePrBrief.mockReturnValue({ data: envelope(makeBrief()), isLoading: false, error: null });
    renderTab({ reviews: [makeReview()] });
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
  });

  it("shows a failed generation inline with the server's message (AC-12)", () => {
    generateState = { isPending: false, error: new ApiError("The model took too long.", 502, "llm_timeout") };
    renderTab();
    expect(screen.getByText("The model took too long.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("falls back to a generic message for an error that is not an ApiError", () => {
    generateState = { isPending: false, error: new Error("boom") };
    renderTab();
    expect(screen.getByText("Could not generate the brief.")).toBeInTheDocument();
  });

  it("flags a brief built for an older head as stale (AC-23)", () => {
    usePrBrief.mockReturnValue({
      data: envelope(makeBrief({ head_sha: "0123456789ab" })),
      isLoading: false,
      error: null,
    });
    renderTab({ headSha: "ffffffffffff" });
    expect(screen.getByText("Generated for 0123456 — the PR has new commits")).toBeInTheDocument();
  });

  it("the empty hint carries no 'review' instruction, and no raw i18n key leaks (NFR-3)", () => {
    const { container } = renderTab();
    expect(screen.getByText(briefMessages.unavailableHint)).toBeInTheDocument();
    expect(briefMessages.unavailableHint).not.toMatch(/review/i);
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b(banner|risks|focus|nav|inputs|block)\.[a-zA-Z]+/);
  });

  it("omits the Description section for a PR without a body", () => {
    renderTab({ prBody: null });
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });
});

/** Banner, Risk areas and Review focus each show three skeleton rows. */
function expectThreeSkeletonSections() {
  const banner = screen.getByRole("button", { name: "Generate brief" });
  expect(banner).toBeDisabled();
  const count = (el: Element | null) => el?.querySelectorAll(".skeleton").length;

  expect(count(banner.parentElement)).toBe(3);
  const risks = screen.getByText("Risk areas").parentElement!.parentElement!;
  expect(count(risks)).toBe(3);
  const focus = screen.getByText("Review focus — read these first").closest("div[style*='border']")!;
  expect(count(focus)).toBe(3);
}
