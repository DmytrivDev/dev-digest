import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  Agent,
  AgentContextDocs,
  ContextAttachment,
  ContextDoc,
  InheritedContextAttachment,
} from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";

const state = vi.hoisted(() => ({
  repoId: "r1" as string | null,
  docs: [] as unknown[],
  attachments: { repo_id: "r1", attached: [], inherited: [] } as unknown,
  listError: false,
  saveError: false,
}));
const mutate = vi.fn();
const refetchList = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: state.repoId, reposLoaded: true }),
}));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () =>
    state.listError
      ? { isError: true, error: new Error("boom"), refetch: refetchList }
      : { data: { repo_id: "r1", branch: "main", total: state.docs.length, truncated: false, docs: state.docs }, isError: false },
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgentContextDocs: () => ({ data: state.attachments, isError: false }),
  useSetAgentContextDocs: () => ({ mutate, isError: state.saveError }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

afterEach(() => {
  cleanup();
  mutate.mockReset();
  refetchList.mockReset();
  state.repoId = "r1";
  state.docs = [];
  state.attachments = { repo_id: "r1", attached: [], inherited: [] };
  state.listError = false;
  state.saveError = false;
});

const doc = (path: string): ContextDoc => ({ path, name: path, folder: "", category: "docs", approx_tokens: 10 });
const att = (path: string, tokens: number | null, present = true): ContextAttachment => ({
  path,
  present,
  approx_tokens: tokens,
});
const inh = (path: string, tokens: number, skill = "Security Rules"): InheritedContextAttachment => ({
  ...att(path, tokens),
  skill_id: "s1",
  skill_name: skill,
});
const setAttachments = (a: ContextAttachment[], i: InheritedContextAttachment[] = []) => {
  const value: AgentContextDocs = { repo_id: "r1", attached: a, inherited: i };
  state.attachments = value;
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, context: contextMessages }}>
      <ContextTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("agent ContextTab", () => {
  it("shows how many of the listed documents are attached (AC-37)", () => {
    state.docs = ["a", "b", "c", "d", "e", "f", "g"].map((n) => doc(`${n}.md`));
    setAttachments([att("a.md", 10), att("b.md", 10)]);
    renderTab();
    expect(screen.getByText("2 of 7 attached")).toBeInTheDocument();
  });

  it("shows the untrusted-block note (AC-44)", () => {
    renderTab();
    expect(
      screen.getByText("Injected as an untrusted block (## Project context) into every run."),
    ).toBeInTheDocument();
  });

  it("shows inherited rows as 'via <skill>' with no checkbox or drag handle (AC-40)", () => {
    state.docs = [doc("a.md"), doc("rules.md")];
    setAttachments([att("a.md", 10)], [inh("rules.md", 50)]);
    renderTab();
    expect(screen.getByText("via Security Rules")).toBeInTheDocument();
    // Only the directly attached row is a checkbox and has a handle.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Drag to reorder/ })).toHaveLength(1);
  });

  it("estimates tokens over distinct documents, leaving out missing ones (AC-42)", () => {
    state.docs = [doc("a.md"), doc("c.md")];
    setAttachments(
      [att("a.md", 100), att("gone.md", null, false)],
      // a.md is inherited as well as attached: counted once.
      [inh("c.md", 50), inh("a.md", 100)],
    );
    renderTab();
    expect(screen.getByText("≈ 150 tokens")).toBeInTheDocument();
  });

  it("saves the complete ordered list for the agent and the active repo when ticking (AC-28, AC-31)", () => {
    state.docs = [doc("a.md"), doc("b.md")];
    setAttachments([att("a.md", 10)]);
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "b.md" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", repoId: "r1", paths: ["a.md", "b.md"] });
  });

  it("shows the save error next to the last saved set (AC-33)", () => {
    state.docs = [doc("a.md"), doc("b.md")];
    setAttachments([att("b.md", 10), att("a.md", 10)]);
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

  it("shows a message with Retry when the list cannot be loaded (A-11)", () => {
    state.listError = true;
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load documents");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchList).toHaveBeenCalledTimes(1);
  });
});
