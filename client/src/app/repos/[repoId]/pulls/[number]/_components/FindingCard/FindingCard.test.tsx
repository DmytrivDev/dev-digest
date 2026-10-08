import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/reject actions (the button reads Reject, the action id stays 'dismiss')", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

/** The eval action runs a mutation, so these cards need a query client. */
function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingCard — eval case action (AC-1…AC-3)", () => {
  const TRIAGED: FindingRecord = {
    ...FINDING,
    accepted_at: "2026-10-08T10:00:00.000Z",
    eval_case_id: null,
    eval_ineligible_reason: null,
  };

  it("places 'Turn into eval case' right after Dismiss, for an accepted finding", () => {
    renderWithProviders(<FindingCard f={TRIAGED} defaultExpanded agentId="a1" prId="pr1" />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    const dismiss = labels.indexOf("Reject");
    expect(dismiss).toBeGreaterThan(-1);
    expect(labels[dismiss + 1]).toBe("Turn into eval case");
  });

  it("offers it for a dismissed finding too", () => {
    renderWithProviders(
      <FindingCard
        f={{ ...TRIAGED, accepted_at: null, dismissed_at: "2026-10-08T10:00:00.000Z" }}
        defaultExpanded
        agentId="a1"
      />,
    );
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeInTheDocument();
  });

  it("offers nothing for an untriaged finding or one no agent produced", () => {
    renderWithProviders(<FindingCard f={FINDING} defaultExpanded />);
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).toBeNull();
    cleanup();
    renderWithProviders(
      <FindingCard f={{ ...TRIAGED, eval_ineligible_reason: "not_agent_finding" }} defaultExpanded />,
    );
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).toBeNull();
  });

  it("renders a hostile title as text, not markup (NFR-4)", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const { container } = renderWithProviders(
      <FindingCard f={{ ...TRIAGED, title: hostile }} defaultExpanded />,
    );
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
