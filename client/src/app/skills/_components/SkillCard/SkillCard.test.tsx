import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "test-quality-rubric",
  description: "Use when the diff adds or changes tests.",
  type: "rubric",
  source: "manual",
  body: "- Flag uncovered branches.",
  enabled: true,
  version: 3,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the name, description, type, source and version", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("Use when the diff adds or changes tests.")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when the description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows the enabled toggle only when the card can toggle", () => {
    const { unmount } = renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    unmount();

    renderWithIntl(<SkillCard skill={SKILL} onToggle={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("marks an imported skill as needing vetting only while it is disabled", () => {
    // An imported skill is somebody else's instructions; the badge is the cue to
    // read it before enabling. Once enabled, it has been vetted — no badge.
    const imported = { ...SKILL, source: "imported_url" as const };
    const { unmount } = renderWithIntl(<SkillCard skill={{ ...imported, enabled: false }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    unmount();

    renderWithIntl(<SkillCard skill={{ ...imported, enabled: true }} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("does not flag a manual skill as needing vetting, even when disabled", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, enabled: false }} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });
});
