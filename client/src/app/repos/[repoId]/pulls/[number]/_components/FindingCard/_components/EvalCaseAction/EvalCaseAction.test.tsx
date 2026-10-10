import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, FindingRecord } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import messages from "../../../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import { EvalCaseAction } from "./EvalCaseAction";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "A live key is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: "2026-10-08T10:00:00.000Z",
  dismissed_at: null,
  eval_case_id: null,
  eval_ineligible_reason: null,
};

const CREATED = { id: "c1", agent_id: "a1" } as EvalCase;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderAction(finding: FindingRecord, props: { agentId?: string | null; prId?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ToastProvider>
          <EvalCaseAction finding={finding} agentId={props.agentId ?? null} prId={props.prId} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...utils, client };
}

const TURN_INTO = { name: "Turn into eval case" };

describe("EvalCaseAction — visibility (AC-1…AC-4)", () => {
  it("shows the button for an accepted and for a dismissed finding", () => {
    renderAction(FINDING);
    expect(screen.getByRole("button", TURN_INTO)).toBeEnabled();
    cleanup();
    renderAction({ ...FINDING, accepted_at: null, dismissed_at: "2026-10-08T10:00:00.000Z" });
    expect(screen.getByRole("button", TURN_INTO)).toBeEnabled();
  });

  it("renders nothing for an untriaged finding", () => {
    renderAction({
      ...FINDING,
      accepted_at: null,
      dismissed_at: null,
      eval_ineligible_reason: "not_triaged",
    });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing when no triage timestamp exists, whatever the reason says", () => {
    renderAction({ ...FINDING, accepted_at: null, dismissed_at: null, eval_ineligible_reason: null });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for a finding that no agent produced", () => {
    renderAction({ ...FINDING, eval_ineligible_reason: "not_agent_finding" });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is disabled, with the tooltip, when the agent no longer exists", () => {
    renderAction({ ...FINDING, eval_ineligible_reason: "agent_missing" });
    expect(screen.getByRole("button", TURN_INTO)).toBeDisabled();
    expect(screen.getByTitle("Agent no longer exists")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", TURN_INTO));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("EvalCaseAction — creating (AC-6, AC-7)", () => {
  it("a double click sends exactly one create request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    renderAction(FINDING, { agentId: "a1", prId: "pr1" });
    const button = screen.getByRole("button", TURN_INTO);
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole("button", { name: "In eval suite" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/findings\/f1\/eval-case$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("switches to 'In eval suite' after a 201, without a reload", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    renderAction(FINDING, { agentId: "a1" });
    fireEvent.click(screen.getByRole("button", TURN_INTO));
    expect(await screen.findByRole("button", { name: "In eval suite" })).toBeEnabled();
    expect(screen.queryByRole("button", TURN_INTO)).toBeNull();
  });

  it("writes the new case id into the cached PR reviews", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    const { client } = renderAction(FINDING, { agentId: "a1", prId: "pr1" });
    client.setQueryData(["reviews", "pr1"], [{ id: "r1", findings: [{ ...FINDING }] }]);
    fireEvent.click(screen.getByRole("button", TURN_INTO));
    await screen.findByRole("button", { name: "In eval suite" });
    const cached = client.getQueryData<{ findings: FindingRecord[] }[]>(["reviews", "pr1"]);
    expect(cached?.[0]?.findings[0]?.eval_case_id).toBe("c1");
  });

  it("opts out of the global toast, so a failure is announced exactly once", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    const { client } = renderAction(FINDING);
    fireEvent.click(screen.getByRole("button", TURN_INTO));
    await screen.findByRole("button", { name: "In eval suite" });
    expect(client.getMutationCache().getAll()[0]?.meta).toEqual({ quietError: true });
  });
});

describe("EvalCaseAction — failures (AC-8)", () => {
  const CASES: [string, string][] = [
    ["finding_not_triaged", messages.finding.evalCase.errors.finding_not_triaged],
    ["not_agent_finding", messages.finding.evalCase.errors.not_agent_finding],
    ["agent_missing", messages.finding.evalCase.errors.agent_missing],
    ["patch_missing", messages.finding.evalCase.errors.patch_missing],
    ["range_outside_hunks", messages.finding.evalCase.errors.range_outside_hunks],
    ["diff_too_large", messages.finding.evalCase.errors.diff_too_large],
  ];

  it.each(CASES)("a 422 %s shows one toast with the human message", async (code, text) => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code, message: `server says ${code}` } }, 422),
    );
    renderAction(FINDING);
    fireEvent.click(screen.getByRole("button", TURN_INTO));
    const toasts = await screen.findByRole("status");
    await waitFor(() => expect(within(toasts).getAllByText(text)).toHaveLength(1));
    // One toast: one Dismiss button, and neither the raw code nor the server text.
    expect(within(toasts).getAllByRole("button", { name: "Dismiss" })).toHaveLength(1);
    expect(screen.queryByText(code)).toBeNull();
    expect(screen.queryByText(`server says ${code}`)).toBeNull();
    // The button is usable again so the user can retry.
    expect(screen.getByRole("button", TURN_INTO)).toBeEnabled();
  });

  it("an unknown failure falls back to the generic message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "boom", message: "x" } }, 500));
    renderAction(FINDING);
    fireEvent.click(screen.getByRole("button", TURN_INTO));
    expect(await screen.findByText(messages.finding.evalCase.errors.generic)).toBeInTheDocument();
  });
});

describe("EvalCaseAction — an existing case (AC-5)", () => {
  it("reads 'In eval suite' and opens the case in the agent's Evals tab", () => {
    renderAction({ ...FINDING, eval_case_id: "c1" }, { agentId: "a1" });
    expect(screen.queryByRole("button", TURN_INTO)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "In eval suite" }));
    expect(push).toHaveBeenCalledWith("/agents/a1?tab=evals&case=c1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
