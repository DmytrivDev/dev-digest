import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const stats = vi.hoisted(() => ({ current: null as SkillStats | null }));

vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: stats.current, isLoading: false, isError: false }),
}));

import { StatsTab } from "./StatsTab";

const SKILL: Skill = {
  id: "sk1",
  name: "test-quality-rubric",
  description: "Use when the diff adds or changes tests.",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 3,
  evidence_files: null,
};

const skillStats = (over: Partial<SkillStats> = {}): SkillStats => ({
  window_days: 30,
  used_by: [{ agent_id: "a1", agent_name: "Security Reviewer", agent_enabled: true }],
  runs: 12,
  findings: 8,
  findings_by_severity: { CRITICAL: 2, WARNING: 6 },
  findings_by_category: { security: 5, bug: 3 },
  accept_rate: 0.75,
  accepted: 3,
  dismissed: 1,
  tokens: 4200,
  last_version_used: 3,
  last_used_at: "2026-09-17T00:00:00.000Z",
  ...over,
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  stats.current = null;
});

describe("StatsTab", () => {
  it("shows the headline numbers with the window in their labels", () => {
    stats.current = skillStats();
    renderTab();
    expect(screen.getByText("USED BY")).toBeInTheDocument();
    expect(screen.getByText("RUNS (30D)")).toBeInTheDocument();
    expect(screen.getByText("FINDINGS (30D)")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    // CircularScore prints the same number inside its ring, so the rate legitimately
    // appears twice — getByText would throw on the duplicate, not on a bug.
    expect(screen.getAllByText("75")).toHaveLength(2);
  });

  it("lists the agents currently carrying the skill", () => {
    stats.current = skillStats();
    renderTab();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
  });

  it("marks a linked agent that is itself switched off", () => {
    stats.current = skillStats({
      used_by: [{ agent_id: "a1", agent_name: "Off Agent", agent_enabled: false }],
    });
    renderTab();
    expect(screen.getByText("agent disabled")).toBeInTheDocument();
  });

  // An untriaged backlog is not a rejected skill — a 0% ring over zero
  // decisions is an accusation the data never made.
  it('shows "—" rather than 0% when nothing has been triaged', () => {
    stats.current = skillStats({ accept_rate: null, accepted: 0, dismissed: 0 });
    renderTab();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("keeps the co-occurrence caveat on screen next to the numbers", () => {
    stats.current = skillStats();
    renderTab();
    expect(screen.getByText(/not findings it caused/)).toBeInTheDocument();
  });

  it("says there are no findings rather than drawing an empty donut", () => {
    stats.current = skillStats({ findings: 0, findings_by_category: {}, findings_by_severity: {} });
    renderTab();
    expect(screen.getByText("No findings in this window.")).toBeInTheDocument();
  });

  // Never linked AND never run: a wall of zeros would read as a verdict on the
  // skill rather than on its usage.
  it("shows the empty state when the skill has never been linked or run", () => {
    stats.current = skillStats({
      used_by: [],
      runs: 0,
      findings: 0,
      findings_by_category: {},
      findings_by_severity: {},
      accept_rate: null,
    });
    renderTab();
    expect(screen.getByText("No usage yet")).toBeInTheDocument();
    expect(screen.queryByText("USED BY")).not.toBeInTheDocument();
  });
});
