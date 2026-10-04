import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("renders no verdict icon, label, badge or score ring when verdict is null (AC-17)", () => {
    const { container } = renderWithIntl(
      <VerdictBanner verdict={null} summary="Brief summary." score={null} />,
    );
    expect(screen.getByText("Brief summary.")).toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("puts the model on the cost element as its tooltip (AC-19)", () => {
    renderWithIntl(
      <VerdictBanner
        verdict={null}
        summary="s"
        score={null}
        cost={{ text: "$0.014 8.2K→1.3K", title: "openai/gpt-4.1" }}
      />,
    );
    expect(screen.getByText("$0.014 8.2K→1.3K")).toHaveAttribute("title", "openai/gpt-4.1");
  });

  it("renders the cost under the score, plus actions and children", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary="ok"
        score={90}
        findingsCount={0}
        cost={{ text: "$0.01", title: "m" }}
        actions={<button type="button">act</button>}
      >
        <span>muted line</span>
      </VerdictBanner>,
    );
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("$0.01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "act" })).toBeInTheDocument();
    expect(screen.getByText("muted line")).toBeInTheDocument();
  });
});
