import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import skillMessages from "../../../../../../../../messages/en/skills.json";

const setSkills = vi.fn();
const links = vi.hoisted(() => ({ current: [] as AgentSkillLink[] }));
const skills = vi.hoisted(() => ({ current: [] as Skill[] }));

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: links.current }),
  useSetAgentSkills: () => ({ mutate: setSkills }),
}));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: skills.current, isLoading: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

const skill = (id: string, name: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: "",
  type: "rubric",
  source: "manual",
  body: "x",
  enabled: true,
  version: 1,
  evidence_files: null,
  ...over,
});

const link = (skillId: string, order: number): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id: skillId,
  order,
});

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agents: agentMessages, skills: skillMessages }}
    >
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  setSkills.mockReset();
  links.current = [];
  skills.current = [];
});

describe("SkillsTab", () => {
  it("lists linked skills first, in prompt order, numbered", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta"), skill("c", "gamma")];
    links.current = [link("c", 0), link("a", 1)];
    renderTab();

    // Order is the thing this tab exists to control, so assert on the rendered
    // sequence, not just on presence.
    // The checkbox role sits on the inner button; the visible name is its
    // sibling inside the wrapping <label>, which is also where the accessible
    // name comes from.
    const names = screen
      .getAllByRole("checkbox")
      .map((el) => el.closest("label")?.textContent);
    expect(names).toEqual(["gamma", "alpha", "beta"]);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("attaches a skill by appending it, so it lands last in the prompt", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta")];
    links.current = [link("a", 0)];
    renderTab();

    fireEvent.click(screen.getByRole("checkbox", { name: "beta" }));
    expect(setSkills).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["a", "b"] });
  });

  it("detaches a linked skill", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta")];
    links.current = [link("a", 0), link("b", 1)];
    renderTab();

    fireEvent.click(screen.getByRole("checkbox", { name: "alpha" }));
    expect(setSkills).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["b"] });
  });

  /** Drag `from` onto `to`, the way a pointer would. */
  const dragOnto = (from: HTMLElement, to: HTMLElement) => {
    fireEvent.dragStart(from);
    fireEvent.dragOver(to);
    fireEvent.drop(to);
  };

  const rowOf = (name: string) =>
    screen.getByRole("checkbox", { name }).closest("[draggable]") as HTMLElement;

  it("reorders by dragging one row onto another and saves the whole ordered set", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta"), skill("c", "gamma")];
    links.current = [link("a", 0), link("b", 1), link("c", 2)];
    renderTab();

    dragOnto(rowOf("gamma"), rowOf("alpha"));
    expect(setSkills).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["c", "a", "b"] });
  });

  // One POST per drop, not one per row the pointer crosses: the endpoint
  // replaces the agent's whole link set in a transaction.
  it("saves once on drop, not on every row the drag passes over", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta"), skill("c", "gamma")];
    links.current = [link("a", 0), link("b", 1), link("c", 2)];
    renderTab();

    const moved = rowOf("alpha");
    fireEvent.dragStart(moved);
    fireEvent.dragOver(rowOf("beta"));
    fireEvent.dragOver(rowOf("gamma"));
    expect(setSkills).not.toHaveBeenCalled();
    fireEvent.drop(rowOf("gamma"));
    expect(setSkills).toHaveBeenCalledTimes(1);
  });

  it("abandons the reorder when the drag ends without a drop", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta")];
    links.current = [link("a", 0), link("b", 1)];
    renderTab();

    const moved = rowOf("alpha");
    fireEvent.dragStart(moved);
    fireEvent.dragOver(rowOf("beta"));
    fireEvent.dragEnd(moved);
    expect(setSkills).not.toHaveBeenCalled();
  });

  // An unlinked skill has no position in the prompt, so there is nothing to
  // drag; the picker shows it in the same list only so it can be ticked.
  it("only makes linked rows draggable", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta")];
    links.current = [link("a", 0)];
    renderTab();

    expect(rowOf("alpha")).toHaveAttribute("draggable", "true");
    expect(rowOf("beta")).toHaveAttribute("draggable", "false");
  });

  // HTML5 drag-and-drop is pointer-only, so the handle keeps doing the move
  // from the keyboard — dropping that would be an accessibility regression.
  it("reorders from the keyboard on a focused handle", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta")];
    links.current = [link("a", 0), link("b", 1)];
    renderTab();

    const handles = screen.getAllByRole("button", { name: /^Reorder / });
    fireEvent.keyDown(handles[1]!, { key: "ArrowUp" });
    expect(setSkills).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["b", "a"] });
  });

  it("does not save when the keyboard move would fall off the end", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta")];
    links.current = [link("a", 0), link("b", 1)];
    renderTab();

    const handles = screen.getAllByRole("button", { name: /^Reorder / });
    fireEvent.keyDown(handles[0]!, { key: "ArrowUp" });
    expect(setSkills).not.toHaveBeenCalled();
  });

  it("gives an unlinked row no usable handle", () => {
    skills.current = [skill("a", "alpha"), skill("b", "beta")];
    links.current = [link("a", 0)];
    renderTab();

    const handles = screen.getAllByRole("button", { name: /^Reorder / });
    expect(handles[1]).toBeDisabled();
  });

  it("marks a linked-but-disabled skill, because it is left out of the prompt", () => {
    skills.current = [skill("a", "alpha", { enabled: false })];
    links.current = [link("a", 0)];
    renderTab();
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("points at the Skills page when the workspace has no skills at all", () => {
    renderTab();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
