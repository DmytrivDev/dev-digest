import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillUsed } from "@devdigest/shared";
import runMessages from "../../../../../../../../../../messages/en/runs.json";
import skillMessages from "../../../../../../../../../../messages/en/skills.json";
import { SkillsUsedSection } from "./SkillsUsedSection";

const used = (over: Partial<SkillUsed> = {}): SkillUsed => ({
  id: "sk-1",
  name: "test-quality-rubric",
  type: "rubric",
  source: "manual",
  version: 3,
  order: 0,
  enabled: true,
  untrusted: false,
  tokens: 1234,
  ...over,
});

function renderSection(skills: SkillUsed[] | null | undefined) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: runMessages, skills: skillMessages }}>
      <div data-theme="dark">
        <SkillsUsedSection skills={skills} />
      </div>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("SkillsUsedSection", () => {
  it("lists each skill with its version and token cost", () => {
    renderSection([used()]);
    expect(screen.getByText("Skills used")).toBeInTheDocument();
    expect(screen.getByText("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    // Grouped with the app locale, never the machine's.
    expect(screen.getByText("1,234 tokens")).toBeInTheDocument();
  });

  it("links a skill to its editor", () => {
    renderSection([used({ id: "sk-42" })]);
    expect(screen.getByText("test-quality-rubric").closest("a")).toHaveAttribute(
      "href",
      "/skills/sk-42",
    );
  });

  it("numbers rows from the link order, so the report matches the picker", () => {
    renderSection([used({ id: "a", name: "first", order: 0 }), used({ id: "b", name: "second", order: 1 })]);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // The reason `used` is reported separately from the prompt blocks: a skill
  // that was attached but switched off has to stay answerable in the report.
  it("marks a disabled skill as skipped and shows no token count for it", () => {
    renderSection([used({ enabled: false, tokens: null })]);
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.queryByText(/tokens$/)).not.toBeInTheDocument();
    expect(screen.getByText("0 of 1 in prompt")).toBeInTheDocument();
  });

  it("flags a skill whose body was delimiter-wrapped", () => {
    renderSection([used({ source: "community", untrusted: true })]);
    expect(screen.getByText("untrusted")).toBeInTheDocument();
  });

  it("says the agent had none when the run resolved an empty link list", () => {
    renderSection([]);
    expect(screen.getByText("This agent had no skills attached.")).toBeInTheDocument();
  });

  // Absent is not zero: an older trace never recorded this, so claiming "none"
  // would invent a fact. The whole section stays out.
  it("renders nothing at all when the trace predates the field", () => {
    const { container } = renderSection(undefined);
    expect(container.querySelector("[data-theme]")?.children.length).toBe(0);
    expect(screen.queryByText("Skills used")).not.toBeInTheDocument();
  });
});
