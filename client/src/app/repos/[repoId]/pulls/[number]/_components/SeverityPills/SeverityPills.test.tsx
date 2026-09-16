import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityPills } from "./SeverityPills";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SeverityPills", () => {
  it("renders only the severities that actually occur in the run", () => {
    renderWithIntl(
      <SeverityPills
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        active={null}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /CRITICAL/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WARNING/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SUGGESTION/ })).not.toBeInTheDocument();
  });

  it("shows each level's count next to its label", () => {
    renderWithIntl(
      <SeverityPills
        counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 0 }}
        active={null}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /CRITICAL/ })).toHaveTextContent("2");
  });

  it("renders nothing at all when the run has no findings", () => {
    const { container } = renderWithIntl(
      <SeverityPills
        counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }}
        active={null}
        onToggle={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the clicked severity, including a click on the active pill", () => {
    const onToggle = vi.fn();
    renderWithIntl(
      <SeverityPills
        counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }}
        active="CRITICAL"
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /WARNING/ }));
    expect(onToggle).toHaveBeenCalledWith("WARNING");
    // clearing the filter is the parent's job — the pill just reports the click
    fireEvent.click(screen.getByRole("button", { name: /CRITICAL/ }));
    expect(onToggle).toHaveBeenCalledWith("CRITICAL");
  });
});
