import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefInput, PrBrief, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { BriefBanner } from "./BriefBanner";

afterEach(cleanup);

function makeBrief(o: Partial<PrBrief> = {}): PrBrief {
  return {
    summary: "Solid middleware, but a secret is committed.",
    risks: { risks: [] },
    review_focus: [],
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

function makeReview(o: Partial<ReviewRecord> = {}): ReviewRecord {
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
    ...o,
  };
}

/** Findings only need the two fields the banner reads. */
function findings(...rows: { severity: string; dismissed_at: string | null }[]) {
  return rows as unknown as ReviewRecord["findings"];
}

interface Props {
  brief?: PrBrief | null;
  stale?: boolean;
  inFlight?: boolean;
  error?: { message: string } | null;
  latestReview?: ReviewRecord | null;
  liveHeadSha?: string | null;
}

function renderBanner(p: Props = {}) {
  const onGenerate = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <BriefBanner
        brief={p.brief === undefined ? makeBrief() : p.brief}
        stale={p.stale ?? false}
        inFlight={p.inFlight ?? false}
        error={p.error ?? null}
        latestReview={p.latestReview ?? null}
        liveHeadSha={p.liveHeadSha === undefined ? "a1b2c3d4e5f6" : p.liveHeadSha}
        onGenerate={onGenerate}
      />
    </NextIntlClientProvider>,
  );
  return { ...view, onGenerate };
}

describe("BriefBanner — no brief", () => {
  it("the Generate brief control is a native, focusable button (NFR-1)", () => {
    const { onGenerate } = renderBanner({ brief: null });
    const generate = screen.getByRole("button", { name: "Generate brief" });
    expect(generate.tagName).toBe("BUTTON");
    expect(generate).not.toHaveAttribute("tabindex", "-1");
    generate.focus();
    expect(document.activeElement).toBe(generate);
    expect(fireEvent.keyDown(generate, { key: "Enter" })).toBe(true);
    fireEvent.click(generate);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state with a primary Generate brief button that sends one request (AC-6, AC-8)", () => {
    const { onGenerate } = renderBanner({ brief: null });
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows skeleton rows and a disabled Generate button while a generation is in flight (AC-9, AC-10)", () => {
    const { container, onGenerate } = renderBanner({ brief: null, inFlight: true });
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
    const generate = screen.getByRole("button", { name: "Generate brief" });
    expect(generate).toBeDisabled();
    fireEvent.click(generate);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("shows the failure message and a Retry that sends one request (AC-12)", () => {
    const { onGenerate } = renderBanner({
      brief: null,
      error: { message: "The model took too long to answer." },
    });
    expect(screen.getByText("The model took too long to answer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

describe("BriefBanner — brief", () => {
  it("renders the summary as the banner paragraph (AC-15)", () => {
    renderBanner();
    expect(screen.getByText("Solid middleware, but a secret is committed.")).toBeInTheDocument();
  });

  it("renders the summary literally: no element, no link (AC-30)", () => {
    const xss = "<img src=x onerror=alert(1)> https://evil.example";
    const { container } = renderBanner({ brief: makeBrief({ summary: xss }) });
    expect(screen.getByText(xss)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows the verdict, findings/blockers badge and score of the review (AC-16)", () => {
    renderBanner({
      latestReview: makeReview({
        score: 61,
        findings: findings(
          { severity: "CRITICAL", dismissed_at: null },
          { severity: "CRITICAL", dismissed_at: "2026-10-03" },
          { severity: "WARNING", dismissed_at: null },
        ),
      }),
    });
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/3 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
  });

  it("shows no verdict, badge or score without a review (AC-17)", () => {
    renderBanner({ latestReview: null });
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });

  it("ignores a summary-kind review", () => {
    renderBanner({ latestReview: makeReview({ kind: "summary", verdict: null, score: null }) });
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });

  it("shows the cost and tokens, with the model as its tooltip (AC-18, AC-19)", () => {
    renderBanner();
    expect(screen.getByText("$0.014 8.2K→1.3K")).toHaveAttribute("title", "openai/gpt-4.1");
  });

  it("reads an unknown cost as an em dash", () => {
    renderBanner({
      brief: makeBrief({
        usage: { llm_calls: 1, tokens_in: null, tokens_out: null, cost_usd: null, duration_ms: 1 },
      }),
    });
    expect(screen.getByText("—")).toHaveAttribute("title", "openai/gpt-4.1");
  });

  it("the refresh icon sends one request (AC-20, NFR-1)", () => {
    const { onGenerate } = renderBanner();
    const refresh = screen.getByRole("button", { name: "Regenerate brief" });
    expect(refresh.tagName).toBe("BUTTON");
    fireEvent.click(refresh);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  // NFR-1: jsdom does not turn Enter into a click and user-event is not a dependency, so
  // this pins what native button semantics need — real <button> elements that take focus,
  // stay in the tab order, and whose keydown is not cancelled — plus the activation.
  it("the refresh icon is a native, focusable button (NFR-1)", () => {
    const { onGenerate } = renderBanner();
    const refresh = screen.getByRole("button", { name: "Regenerate brief" });
    expect(refresh).toHaveAttribute("type", "button");
    expect(refresh).not.toHaveAttribute("tabindex", "-1");
    refresh.focus();
    expect(document.activeElement).toBe(refresh);
    expect(fireEvent.keyDown(refresh, { key: "Enter" })).toBe(true);
    fireEvent.click(refresh);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows the muted inputs line for missing and truncated inputs (AC-21)", () => {
    const inputs: BriefInput[] = [
      { source: "intent", status: "used" },
      { source: "linked_issue", status: "missing", reason: "github_unavailable" },
      { source: "specs", status: "truncated", reason: "over_budget" },
    ];
    renderBanner({ brief: makeBrief({ inputs }) });
    expect(
      screen.getByText(
        "Built without: linked issue (GitHub unavailable) · Truncated: specs (over budget)",
      ),
    ).toBeInTheDocument();
  });

  it("shows no inputs line when every input was used", () => {
    renderBanner({ brief: makeBrief({ inputs: [{ source: "intent", status: "used" }] }) });
    expect(screen.queryByText(/Built without|Truncated/)).not.toBeInTheDocument();
  });

  it("shows a reason code the namespace does not know as the code, not a raw key", () => {
    renderBanner({
      brief: makeBrief({ inputs: [{ source: "specs", status: "missing", reason: "brand_new_reason" }] }),
    });
    expect(screen.getByText("Built without: specs (brand_new_reason)")).toBeInTheDocument();
  });

  it("counts dropped items (AC-22), with the singular wording for one", () => {
    renderBanner({ brief: makeBrief({ dropped: { risks: 1, review_focus: 1 } }) });
    expect(screen.getByText("2 items referencing unknown files were removed")).toBeInTheDocument();
    cleanup();
    renderBanner({ brief: makeBrief({ dropped: { risks: 1, review_focus: 0 } }) });
    expect(screen.getByText("1 item referencing an unknown file was removed")).toBeInTheDocument();
    cleanup();
    renderBanner({ brief: makeBrief({ dropped: { risks: 0, review_focus: 0 } }) });
    expect(screen.queryByText(/were? removed/)).not.toBeInTheDocument();
  });

  describe("stale notice (AC-23)", () => {
    it("shows for the server flag, with the first 7 characters of the head, and Regenerate sends one request", () => {
      const { onGenerate } = renderBanner({ stale: true });
      expect(screen.getByText("Generated for a1b2c3d — the PR has new commits")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
      expect(onGenerate).toHaveBeenCalledTimes(1);
    });

    it("shows when the live head differs although the flag is false", () => {
      renderBanner({ stale: false, liveHeadSha: "ffffffffffff" });
      expect(screen.getByText(/the PR has new commits/)).toBeInTheDocument();
    });

    it("does not show for equal SHAs", () => {
      renderBanner({ stale: false, liveHeadSha: "a1b2c3d4e5f6" });
      expect(screen.queryByText(/the PR has new commits/)).not.toBeInTheDocument();
    });
  });

  it("keeps the summary next to an inline error (AC-13)", () => {
    renderBanner({ error: { message: "No API key for openai — add it in Settings → Models." } });
    expect(screen.getByText("Solid middleware, but a secret is committed.")).toBeInTheDocument();
    expect(screen.getByText("No API key for openai — add it in Settings → Models.")).toBeInTheDocument();
  });

  it("disables the refresh icon and Regenerate while in flight, and shows skeleton rows (AC-9, AC-10)", () => {
    const { container, onGenerate } = renderBanner({ stale: true, inFlight: true });
    const refresh = screen.getByRole("button", { name: "Regenerate brief" });
    const regenerate = screen.getByRole("button", { name: "Regenerate" });
    expect(refresh).toBeDisabled();
    expect(regenerate).toBeDisabled();
    fireEvent.click(refresh);
    fireEvent.click(regenerate);
    expect(onGenerate).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
    expect(screen.queryByText("Solid middleware, but a secret is committed.")).not.toBeInTheDocument();
  });
});
