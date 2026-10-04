import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, Risk } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import type { BriefNav } from "../BriefFileRef";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const nav: BriefNav = { prPaths: new Set(), blobHref: () => null, onOpen: vi.fn() };

const risk = (title: string, o: Partial<Risk> = {}): Risk => ({
  kind: "security",
  title,
  explanation: "why",
  severity: "high",
  file_refs: ["src/a.ts:1"],
  ...o,
});

function brief(risks: Risk[]): PrBrief {
  return {
    summary: "s",
    risks: { risks },
    review_focus: [],
    intent: null,
    blast: null,
    head_sha: "a1b2c3d4e5f6",
    generated_at: "2026-10-03T00:00:00.000Z",
    model: "openai/gpt-4.1",
    usage: { llm_calls: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0.01, duration_ms: 1 },
    inputs: [],
    dropped: { risks: 0, review_focus: 0 },
  };
}

function renderRisks(b: PrBrief | null, inFlight = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas brief={b} inFlight={inFlight} nav={nav} />
    </NextIntlClientProvider>,
  );
}

describe("RiskAreas", () => {
  it("labels the block 'Risk areas' and renders one pill per risk (AC-3)", () => {
    renderRisks(brief([risk("Auth surface touched"), risk("Adds Redis round-trip", { kind: "perf" })]));
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("Adds Redis round-trip")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Show details" })).toHaveLength(2);
  });

  it("says 'not generated yet' when there is no brief (AC-7)", () => {
    renderRisks(null);
    expect(screen.getByText("Not generated yet.")).toBeInTheDocument();
  });

  it("says 'No notable risks flagged.' for a brief with zero risks (AC-27)", () => {
    renderRisks(brief([]));
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("shows three skeleton rows while a generation is in flight (AC-9)", () => {
    const { container } = renderRisks(brief([risk("Hidden while generating")]), true);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
    expect(screen.queryByText("Hidden while generating")).not.toBeInTheDocument();
  });

  it("shows skeletons, not the placeholder, when in flight without a brief", () => {
    const { container } = renderRisks(null, true);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
    expect(screen.queryByText("Not generated yet.")).not.toBeInTheDocument();
  });
});
