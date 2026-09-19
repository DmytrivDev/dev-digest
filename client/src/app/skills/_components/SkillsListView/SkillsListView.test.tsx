import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import shellMessages from "../../../../../messages/en/shell.json";
import common from "../../../../../messages/en/common.json";

const push = vi.fn();
const skills = vi.hoisted(() => ({ current: [] as Skill[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/skills",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: skills.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
// The app shell pulls in the sidebar, repo switcher and command palette; none
// of that is what this test is about.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsListView } from "./SkillsListView";

const skill = (id: string, name: string): Skill => ({
  id,
  name,
  description: "Use when the diff touches tests.",
  type: "rubric",
  source: "manual",
  body: "- rule",
  enabled: true,
  version: 1,
  evidence_files: null,
});

function renderList() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, shell: shellMessages, common }}>
      <SkillsListView />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  push.mockReset();
  skills.current = [];
});

describe("SkillsListView", () => {
  // Reading a skill must not cost a page: the list stays put and the body
  // opens beside it. The editor is one click further, and still the only
  // place a body can be changed.
  it("opens the skill in a side panel instead of navigating", () => {
    skills.current = [skill("sk1", "test-quality-rubric")];
    renderList();

    fireEvent.click(screen.getByText("test-quality-rubric"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Preview — rendered as the reviewing agent receives it")).toBeInTheDocument();
    expect(screen.getByText("rule")).toBeInTheDocument();
  });

  it("reaches the editor from the panel, not from the card", () => {
    skills.current = [skill("sk1", "test-quality-rubric")];
    renderList();

    fireEvent.click(screen.getByText("test-quality-rubric"));
    fireEvent.click(screen.getByText("Open editor"));
    expect(push).toHaveBeenCalledWith("/skills/sk1");
  });

  it("closes the panel without navigating", () => {
    skills.current = [skill("sk1", "test-quality-rubric")];
    renderList();

    fireEvent.click(screen.getByText("test-quality-rubric"));
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // The panel reads the row by id, so a list that refetches under it (a toggle
  // elsewhere, a window focus) shows the CURRENT body, not the copy it opened.
  it("follows the list when the previewed skill changes underneath it", () => {
    skills.current = [skill("sk1", "test-quality-rubric")];
    const { rerender } = renderList();

    fireEvent.click(screen.getByText("test-quality-rubric"));
    expect(screen.getByText("rule")).toBeInTheDocument();

    skills.current = [{ ...skill("sk1", "test-quality-rubric"), body: "- edited elsewhere" }];
    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages, shell: shellMessages, common }}>
        <SkillsListView />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("edited elsewhere")).toBeInTheDocument();
  });

  it("filters the grid by the search box", () => {
    skills.current = [skill("sk1", "test-quality-rubric"), skill("sk2", "api-contract-guard")];
    renderList();

    fireEvent.change(screen.getByPlaceholderText("Search skills…"), {
      target: { value: "contract" },
    });
    expect(screen.getByText("api-contract-guard")).toBeInTheDocument();
    expect(screen.queryByText("test-quality-rubric")).not.toBeInTheDocument();
  });
});
