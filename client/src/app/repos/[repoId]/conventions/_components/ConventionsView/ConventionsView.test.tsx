import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionScanReport, Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../messages/en/conventions.json";

const replace = vi.fn();
const mutateExtract = vi.fn();
const mutateUpdate = vi.fn();
const mutateDelete = vi.fn();
const createSkill = vi.fn();

const state = vi.hoisted(() => ({
  search: "",
  candidates: [] as unknown[],
  listLoading: false,
  listError: false,
  extract: { isPending: false, isError: false, error: null as unknown, data: null as unknown },
  draft: { name: "repo-conventions", description: "House rules", body: "# repo-conventions" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
// next/link needs the App Router context this test deliberately does not mount.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));
// The draft modal reads the skills list to warn about a name already in use.
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: { candidates: state.candidates },
    isLoading: state.listLoading,
    isError: state.listError,
    refetch: vi.fn(),
  }),
  useExtractConventions: () => ({ ...state.extract, mutate: mutateExtract }),
  useUpdateConvention: () => ({ mutate: mutateUpdate, isPending: false, variables: undefined }),
  useDeleteConvention: () => ({ mutate: mutateDelete, isPending: false }),
  useConventionSkillDraft: () => ({ data: state.draft, isLoading: false, isError: false }),
  useCreateConventionSkill: () => ({ mutateAsync: createSkill, isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

const candidate = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  category: "naming",
  rule: "Name every service file service.ts.",
  evidence_path: "src/modules/skills/service.ts",
  evidence_line: 12,
  evidence_snippet: "export class SkillsService {",
  evidence_url: "https://github.com/acme/api/blob/9c4f1ab/src/modules/skills/service.ts#L12",
  confidence: 0.8,
  status: "pending",
  created_at: "2026-09-19T12:00:00.000Z",
  ...over,
});

const REPORT: ConventionScanReport = {
  head_sha: "9c4f1ab",
  provider: "openai",
  model: "gpt-5.4",
  config_samples: ["tsconfig.json"],
  code_samples: ["src/modules/skills/service.ts"],
  proposed: 7,
  kept: 3,
  dropped: [{ rule: "Colocate every test.", reason: "line_out_of_range" }],
  created: 3,
  tokens_in: 8421,
  tokens_out: 612,
  cost_usd: 0.0031,
};

const SKILL: Skill = {
  id: "s1",
  name: "repo-conventions",
  description: "House rules",
  type: "convention",
  source: "extracted",
  body: "# repo-conventions",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.search = "";
  state.candidates = [];
  state.listLoading = false;
  state.listError = false;
  state.extract = { isPending: false, isError: false, error: null, data: null };
});

describe("ConventionsView", () => {
  it("offers the scan when nothing has been extracted yet", () => {
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Run Scan" })[0]!);
    expect(mutateExtract).toHaveBeenCalled();
  });

  it("names the repo it is scanning", () => {
    renderView();
    expect(screen.getByText("acme/api")).toBeInTheDocument();
  });

  it("reports a failed load with a retry", () => {
    state.listError = true;
    renderView();
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  // The rate limit and the 422s ("no clone", "no index") are ANSWERS, so they
  // are shown in place with their cause rather than as a system failure.
  it("explains a rate-limited scan in place", () => {
    state.extract = {
      isPending: false,
      isError: true,
      error: new ApiError("429 Too Many Requests", 429),
      data: null,
    };
    renderView();
    expect(screen.getByText(/this repo allows 5 per minute/i)).toBeInTheDocument();
  });

  it("shows the scan report so a thin result is explainable", () => {
    state.candidates = [candidate()];
    state.extract = { isPending: false, isError: false, error: null, data: { scan: REPORT } };
    renderView();
    expect(screen.getByText("7 proposed · 3 kept · 3 new")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("line outside the sampled range")).toBeInTheDocument();
  });

  it("swaps Run Scan for ReScan once candidates exist", () => {
    state.candidates = [candidate()];
    renderView();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
  });

  // Criterion 50: nothing to assemble until at least one rule is accepted.
  it("offers Create skill only after something is accepted", () => {
    state.candidates = [candidate()];
    const { unmount } = renderView();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
    unmount();

    state.candidates = [candidate({ status: "accepted" })];
    state.search = "status=accepted";
    renderView();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeInTheDocument();
  });

  it("triages a card through the shared update route", () => {
    state.candidates = [candidate()];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(mutateUpdate).toHaveBeenCalledWith({ id: "c1", patch: { status: "rejected" } });
  });

  // Criterion 48, the UI half: a rejected candidate leaves the triage view but
  // stays reachable, so it is visibly kept rather than silently gone.
  it("keeps a rejected candidate out of Pending and in Rejected", () => {
    state.candidates = [candidate({ status: "rejected" })];
    const { unmount } = renderView();
    expect(screen.getByText("Nothing in this view")).toBeInTheDocument();
    unmount();

    state.search = "status=rejected";
    renderView();
    expect(screen.getByText("Name every service file service.ts.")).toBeInTheDocument();
  });

  it("puts the chosen view in the URL so a reload returns to it", () => {
    state.candidates = [candidate()];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Rejected/ }));
    expect(replace).toHaveBeenCalledWith("/repos/r1/conventions?status=rejected");
  });

  // Criteria 50–52 end to end: accept → modal → save → the new skill is
  // announced with a link to where /skills will show it.
  it("saves the skill and points at it", async () => {
    createSkill.mockResolvedValue(SKILL);
    state.candidates = [candidate({ status: "accepted" })];
    state.search = "status=accepted";
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByText(/Merged from 1 accepted convention/)).toBeInTheDocument();

    // Two buttons carry that label now — the toolbar one that opened the modal
    // and the modal's own save. Scope to the dialog.
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(createSkill).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Open in Skills" })).toHaveAttribute(
        "href",
        "/skills/s1",
      ),
    );
  });
});
