import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../messages/en/context.json";
import { ToastProvider } from "../../../../../lib/toast";

const mutate = vi.fn();

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillContextDocs: () => ({
    data: { repo_id: "r1", attached: [] },
    isError: false,
  }),
  useSetSkillContextDocs: () => ({ mutate: vi.fn(), isError: false }),
}));
vi.mock("../../../../../lib/hooks/core", () => ({
  useContextFiles: () => ({
    data: { repo_id: "r1", branch: "main", total: 0, truncated: false, docs: [] },
    isError: false,
  }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false }),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", reposLoaded: true }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SkillEditor } from "./SkillEditor";
import { DEFAULT_TAB, VALID_TABS } from "./constants";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const SKILL: Skill = {
  id: "sk1",
  name: "test-quality-rubric",
  description: "Use when the diff adds or changes tests.",
  type: "rubric",
  source: "manual",
  body: "# Rubric\n\nFlag uncovered branches.",
  enabled: true,
  version: 3,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, context: contextMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

const typeInto = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });

/**
 * The body textarea. Queried by role rather than by display value because RTL
 * collapses whitespace when matching, and a skill body is multi-line markdown —
 * `getByDisplayValue(body)` silently never matches.
 */
const bodyField = (): HTMLTextAreaElement =>
  screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;

describe("SkillEditor — tab strip", () => {
  // Config is both the first tab and the landing tab (`DEFAULT_TAB` is
  // `TABS[0].key`) — SPEC-01 D-18 / AC-23, reversing the earlier Preview-first
  // order of L02 R3. A strip whose first tab is not the one that opened reads
  // as a wrong turn.
  it("orders the tabs Config · Context · Preview · Stats · Versions (AC-23)", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    // Compare DOM order rather than indices into a container, so the assertion
    // survives however the Tabs primitive wraps its items.
    // By role: a TAB and its own <h2> can share their text.
    const order = ["Config", "Context", "Preview", "Stats", "Versioning"].map((name) =>
      screen.getByRole("button", { name }),
    );
    for (let i = 1; i < order.length; i++) {
      const rel = order[i - 1]!.compareDocumentPosition(order[i]!);
      expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("lands on Config when no ?tab is given, and accepts ?tab=context (AC-24)", () => {
    // The page falls back to DEFAULT_TAB for an absent or unknown `?tab`.
    expect(DEFAULT_TAB).toBe("config");
    expect(VALID_TABS).toContain("context");
  });

  it("renders the Context tab for tab=context (AC-23)", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="context" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.queryByText("Save skill")).not.toBeInTheDocument();
  });
});

describe("SkillEditor — Config tab", () => {
  it("renders the four editable fields and the current version", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByDisplayValue("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Use when the diff adds or changes tests.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("rubric")).toBeInTheDocument();
    expect(bodyField()).toHaveValue(SKILL.body);
    expect(screen.getAllByText("v3").length).toBeGreaterThan(0);
  });

  it("keeps Save disabled until something actually changes", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    const save = screen.getByRole("button", { name: "Save skill" });
    expect(save).toBeDisabled();

    typeInto(bodyField(), `${SKILL.body}\nAnd corner cases.`);
    expect(save).toBeEnabled();
  });

  it("announces the next version only when the BODY changed", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);

    // A metadata edit is not versioned, so it must not promise a v4.
    typeInto(screen.getByDisplayValue("test-quality-rubric"), "renamed");
    expect(screen.queryByText(/snapshots it as v4/)).not.toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    typeInto(bodyField(), `${SKILL.body}!`);
    expect(screen.getByText(/snapshots it as v4/)).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("reverts every field back to the saved skill", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    typeInto(screen.getByDisplayValue("test-quality-rubric"), "edited");
    expect(screen.getByDisplayValue("edited")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(screen.getByDisplayValue("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("sends every field in one patch on save", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    typeInto(bodyField(), `${SKILL.body}!`);
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      id: "sk1",
      patch: {
        name: SKILL.name,
        description: SKILL.description,
        type: SKILL.type,
        body: `${SKILL.body}!`,
        enabled: true,
      },
    });
  });
});

describe("SkillEditor — Preview tab", () => {
  it("renders the body as markdown, not as raw text", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Rubric" })).toBeInTheDocument();
    expect(screen.getByText("Flag uncovered branches.")).toBeInTheDocument();
  });

  it("warns about an imported body, and stays quiet about a hand-written one", () => {
    const { unmount } = renderWithIntl(
      <SkillEditor
        skill={{ ...SKILL, source: "imported_url", enabled: false }}
        tab="preview"
        onTab={() => {}}
      />,
    );
    expect(screen.getByText(/read it before you enable it/)).toBeInTheDocument();
    unmount();

    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={() => {}} />);
    expect(screen.queryByText(/read it before you enable it/)).not.toBeInTheDocument();
  });

  it("says so when the body is empty instead of rendering a blank card", () => {
    renderWithIntl(<SkillEditor skill={{ ...SKILL, body: "   " }} tab="preview" onTab={() => {}} />);
    expect(screen.getByText("This skill has no body yet.")).toBeInTheDocument();
  });
});
