import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import shellMessages from "../../../../../messages/en/shell.json";

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
    <NextIntlClientProvider locale="en" messages={{ skills: messages, shell: shellMessages }}>
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
  // The card used to open a side drawer that re-rendered the same body and
  // carried an "Edit skill" button to the editor — two steps to one place.
  it("opens the skill's editor instead of a side preview", () => {
    skills.current = [skill("sk1", "test-quality-rubric")];
    renderList();

    fireEvent.click(screen.getByText("test-quality-rubric"));
    expect(push).toHaveBeenCalledWith("/skills/sk1");
    // Nothing from the old drawer is left behind.
    expect(screen.queryByText("Edit skill")).not.toBeInTheDocument();
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
