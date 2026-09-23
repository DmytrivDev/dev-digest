import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { SmartDiffGroup } from "./SmartDiffGroup";

afterEach(cleanup);

function renderGroup(props: Partial<Parameters<typeof SmartDiffGroup>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SmartDiffGroup
        label="Core"
        hint="The substance of the change"
        color="var(--accent)"
        filesCount={2}
        filesWithFindings={null}
        defaultOpen
        {...props}
      >
        <div>child content</div>
      </SmartDiffGroup>
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffGroup", () => {
  it("renders the counter as 2 when two files have findings", () => {
    renderGroup({ filesWithFindings: 2 });
    const header = screen.getByRole("button");
    expect(within(header).getByText("2")).toBeInTheDocument();
  });

  it("the counter is absent at 0", () => {
    renderGroup({ filesWithFindings: 0 });
    const header = screen.getByRole("button");
    expect(within(header).queryByLabelText(/files with findings/)).not.toBeInTheDocument();
  });

  it("docs/boilerplate start collapsed, so their children are not rendered", () => {
    renderGroup({ defaultOpen: false });
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });

  it("clicking the header expands", () => {
    renderGroup({ defaultOpen: false });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("uses singular wording for one file", () => {
    renderGroup({ filesCount: 1, filesWithFindings: 1 });
    const header = screen.getByRole("button");
    expect(within(header).getByText("1 file")).toBeInTheDocument();
    expect(within(header).getByLabelText("1 file with findings")).toBeInTheDocument();
  });

  it("exposes the open state via aria-expanded", () => {
    renderGroup({ defaultOpen: false });
    const header = screen.getByRole("button");
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("a 0-file group does not toggle on click", () => {
    renderGroup({ defaultOpen: true, filesCount: 0 });
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });
});
