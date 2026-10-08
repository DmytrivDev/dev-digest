import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../messages/en/context.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useAgentContextDocs: () => ({
    data: { repo_id: "r1", attached: [], inherited: [] },
    isError: false,
  }),
  useSetAgentContextDocs: () => ({ mutate: vi.fn(), isError: false }),
}));
vi.mock("../../../../../lib/hooks/core", () => ({
  useContextFiles: () => ({
    data: { repo_id: "r1", branch: "main", total: 0, truncated: false, docs: [] },
    isError: false,
  }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false }),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useEvalCases: () => ({ data: [], isLoading: false, isError: false }),
  useEvalRuns: () => ({ data: [], isLoading: false, isError: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useStartEvalRun: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/agents/ag1",
  useSearchParams: () => new URLSearchParams("tab=evals"),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", reposLoaded: true }),
}));

import { AgentEditor } from "./AgentEditor";
import { VALID_TABS } from "./constants";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, context: contextMessages, eval: evalMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });
});

describe("AgentEditor — tabs (AC-22, AC-26)", () => {
  it("orders the tabs Config · Skills · Context · Evals", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const order = ["Config", "Skills", "Context", "Evals"].map((name) => screen.getByRole("button", { name }));
    for (let i = 1; i < order.length; i++) {
      const rel = order[i - 1]!.compareDocumentPosition(order[i]!);
      expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("accepts ?tab=context and ?tab=evals as valid tabs", () => {
    expect(VALID_TABS).toContain("context");
    expect(VALID_TABS).toContain("evals");
  });

  it("renders the Context tab for tab=context", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).not.toBeInTheDocument();
  });

  it("renders the Evals tab for tab=evals (AC-26)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Eval cases" })).toBeInTheDocument();
    expect(screen.getByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).not.toBeInTheDocument();
  });
});
