import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding()];

const MIXED: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" }),
  finding({ id: "f2", severity: "WARNING", title: "N+1 query under load", category: "perf" }),
  finding({
    id: "f3",
    severity: "SUGGESTION",
    title: "Extract magic number",
    category: "style",
    confidence: 0.6,
  }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity pills", () => {
  it("shows one pill per severity present, with the count of the cards below it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("button", { name: /CRITICAL/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /WARNING/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /SUGGESTION/ })).toHaveTextContent("1");
  });

  it("filters the list to one severity, and restores it on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const critical = screen.getByRole("button", { name: /CRITICAL/ });

    fireEvent.click(critical);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query under load")).not.toBeInTheDocument();
    expect(screen.queryByText("Extract magic number")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /CRITICAL/ }));
    expect(screen.getByText("N+1 query under load")).toBeInTheDocument();
    expect(screen.getByText("Extract magic number")).toBeInTheDocument();
  });

  it("switching pills swaps the filter instead of stacking it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /CRITICAL/ }));
    fireEvent.click(screen.getByRole("button", { name: /WARNING/ }));
    expect(screen.getByText("N+1 query under load")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("counts what 'hide low confidence' leaves visible, and drops the emptied pill", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // the SUGGESTION finding sits at 0.6 confidence — below the 0.65 threshold
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByRole("button", { name: /SUGGESTION/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Extract magic number")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CRITICAL/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /WARNING/ })).toHaveTextContent("1");
  });

  it("clears a filter that 'hide low confidence' just emptied, instead of stranding the user", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /SUGGESTION/ }));
    expect(screen.getByText("Extract magic number")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("No findings match")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query under load")).toBeInTheDocument();
  });

  it("renders no pills at all when the run found nothing", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).not.toBeInTheDocument();
  });
});
