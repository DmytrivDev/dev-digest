import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, ContextDoc, Skill } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { serializePreview, skillTokenEstimate } from "./helpers";

const state = vi.hoisted(() => ({
  repoId: "r1" as string | null,
  docs: [] as unknown[],
  attached: [] as unknown[],
  saveError: false,
}));
const mutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: state.repoId, reposLoaded: true }),
}));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => ({
    data: { repo_id: "r1", branch: "main", total: state.docs.length, truncated: false, docs: state.docs },
    isError: false,
  }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkillContextDocs: () => ({ data: { repo_id: "r1", attached: state.attached }, isError: false }),
  useSetSkillContextDocs: () => ({ mutate, isError: state.saveError }),
}));

import { ContextTab } from "./ContextTab";

const SKILL = { id: "sk1", name: "security-rules" } as Skill;

afterEach(() => {
  cleanup();
  mutate.mockReset();
  state.repoId = "r1";
  state.docs = [];
  state.attached = [];
  state.saveError = false;
});

const doc = (path: string, category: ContextDoc["category"] = "docs"): ContextDoc => ({
  path,
  name: path,
  folder: "",
  category,
  approx_tokens: 10,
});
const att = (path: string, tokens: number | null, present = true): ContextAttachment => ({
  path,
  present,
  approx_tokens: tokens,
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillMessages, context: contextMessages }}>
      <ContextTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("skill ContextTab", () => {
  it("shows how many documents are attached (AC-38)", () => {
    state.docs = [doc("a.md"), doc("b.md")];
    state.attached = [att("a.md", 10)];
    renderTab();
    expect(screen.getByText("1 attached")).toBeInTheDocument();
  });

  it("shows the inheritance note (AC-39)", () => {
    renderTab();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
  });

  it("sums the tokens of the present attachments (AC-43)", () => {
    state.docs = [doc("a.md"), doc("b.md"), doc("c.md")];
    state.attached = [att("a.md", 40), att("b.md", 60), att("gone.md", null, false)];
    renderTab();
    expect(screen.getByText("≈ 100 tokens")).toBeInTheDocument();
  });

  it("shows the Serializes-as box for the attached documents (AC-45)", () => {
    state.docs = [doc("specs/public-api.md", "specs")];
    state.attached = [att("specs/public-api.md", 10)];
    renderTab();
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    const box = screen.getByText(/## Project context/);
    expect(box).toHaveTextContent("### specs/public-api.md");
    expect(box).toHaveTextContent("<untrusted …>…</untrusted>");
  });

  it("leaves out the Serializes-as box when nothing is attached", () => {
    state.docs = [doc("a.md")];
    renderTab();
    expect(screen.queryByText("Serializes as")).not.toBeInTheDocument();
  });

  it("saves the complete ordered list for the skill and the active repo (AC-28, AC-31)", () => {
    state.docs = [doc("a.md"), doc("b.md")];
    state.attached = [att("a.md", 10)];
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "b.md" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ skillId: "sk1", repoId: "r1", paths: ["a.md", "b.md"] });
  });

  it("shows the save error and the last saved order (AC-33)", () => {
    state.docs = [doc("a.md"), doc("b.md")];
    state.attached = [att("b.md", 10), att("a.md", 10)];
    state.saveError = true;
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save the attached documents");
    expect(
      screen.getAllByRole("checkbox").map((el) => el.closest("label")?.textContent),
    ).toEqual(["b.md", "a.md"]);
  });

  it("asks for a repository when none is active (AC-26)", () => {
    state.repoId = null;
    renderTab();
    expect(screen.getByText("Select a repository to attach its documents")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("skill ContextTab helpers", () => {
  it("serializePreview lists the heading, each path line and an elided block, in order", () => {
    expect(serializePreview(["specs/a.md", "docs/b.md"])).toBe(
      "## Project context\n### specs/a.md\n<untrusted …>…</untrusted>\n\n### docs/b.md\n<untrusted …>…</untrusted>",
    );
    expect(serializePreview([])).toBe("");
  });

  it("skillTokenEstimate ignores missing and unreadable attachments", () => {
    expect(skillTokenEstimate([att("a.md", 40), att("b.md", 60), att("c.md", null), att("d.md", 5, false)])).toBe(100);
  });
});
