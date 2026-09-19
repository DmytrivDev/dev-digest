import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json
import skillMessages from "../../../../../../../../messages/en/skills.json";

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: "### skill",
    memory: null,
    specs: null,
    user: "Review PR #482",
    token_counts: { system: 5, skills: 1234, user: 4 },
  },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  skills_used: [
    {
      id: "sk-1",
      name: "api-contract-guard",
      type: "convention",
      source: "manual",
      version: 2,
      order: 0,
      enabled: true,
      untrusted: false,
      // Deliberately NOT the 1,234 the skills prompt slot reports: two cells
      // rendering the same string would make getByText ambiguous.
      tokens: 890,
    },
  ],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages, skills: skillMessages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("attributes tokens to each prompt slot that reported them", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    // Grouped with the app locale, never the machine's.
    expect(screen.getByText("1,234 tokens")).toBeInTheDocument();
    // `memory` and `specs` are absent from the prompt AND from token_counts —
    // an omitted slot must not render a "0 tokens" badge.
    expect(screen.queryByText("0 tokens")).not.toBeInTheDocument();
  });

  it("names the skills the run carried, not just the assembled text", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Skills used")).toBeInTheDocument();
    expect(screen.getByText("api-contract-guard")).toBeInTheDocument();
    expect(screen.getByText("890 tokens")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});
