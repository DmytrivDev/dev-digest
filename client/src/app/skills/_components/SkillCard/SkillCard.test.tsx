import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import common from "../../../../../messages/en/common.json";

const deleteSkill = vi.fn();
vi.mock("../../../../lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: deleteSkill, isPending: false }),
}));
import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  deleteSkill.mockClear();
});

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
      <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
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

// Deleting is irreversible and the trash icon sits inside a card that navigates
// on click, so both halves matter: the first click must only ask, and asking
// must not open the skill.
describe("SkillCard (delete)", () => {
  it("asks before deleting and deletes only on confirm", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);

    fireEvent.click(screen.getByLabelText("Delete skill"));
    expect(deleteSkill).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByText('Delete "test-quality-rubric"?')).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete skill"));
    expect(deleteSkill).toHaveBeenCalledWith("sk1");
  });

  it("cancels without deleting and without opening the card", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);

    fireEvent.click(screen.getByLabelText("Delete skill"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(deleteSkill).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete "test-quality-rubric"?')).not.toBeInTheDocument();
  });
});

// The card is where you decide to delete or disable a skill, so "is anyone
// using this" has to be on it. Absent and zero are different facts: the list
// counts, a single-skill read does not.
describe("SkillCard (agent count)", () => {
  it("shows the number of agents carrying the skill", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, agent_count: 2 }} />);
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("says no agents when the count is a counted zero", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, agent_count: 0 }} />);
    expect(screen.getByText("No agents")).toBeInTheDocument();
  });

  it("shows no badge at all when the count was not reported", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText(/agent/i)).not.toBeInTheDocument();
  });
});
