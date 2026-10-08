import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase, EvalCaseOutcome } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/eval.json";

const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@/lib/hooks/eval", () => ({
  useUpdateEvalCase: () => update,
}));

import { EvalCaseModal } from "./EvalCaseModal";

const DIFF = [
  "diff --git a/src/config.ts b/src/config.ts",
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "@@ -10,6 +10,7 @@",
  " export const config = {",
  '+  stripeKey: "sk_live_xxx",',
  "-  legacy: true,",
  " };",
].join("\n");

const EXPECTATION = { kind: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 } as const;

function outcome(over: Partial<EvalCaseOutcome> = {}): EvalCaseOutcome {
  return {
    case_id: "c1",
    case_name: "stripe-key-leak",
    kind: "must_find",
    expectation: EXPECTATION,
    status: "scored",
    pass: true,
    error_reason: null,
    findings_matched: 1,
    findings_total: 1,
    grounding_kept: 1,
    grounding_total: 1,
    duration_ms: 1800,
    cost_usd: 0.02,
    actual: [],
    ...over,
  };
}

function makeCase(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "c1",
    agent_id: "ag1",
    name: "stripe-key-leak",
    notes: "Catches a committed live key",
    input_diff: DIFF,
    input_meta: { pr_number: 483, title: "Add Stripe integration", body: "Wire up payments." },
    expectation: EXPECTATION,
    labels: { severity: "CRITICAL", category: "security", title: "Hardcoded Stripe secret key" },
    source: { finding_id: "f1", pr_number: 483, repo: "acme/payments-api", available: true },
    created_at: "2026-10-01T10:00:00.000Z",
    last_outcome: null,
    ...over,
  };
}

const onClose = vi.fn();

function renderModal(evalCase: EvalCase = makeCase()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalCaseModal evalCase={evalCase} agentName="Security Reviewer" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  update.mutate.mockReset();
  update.isPending = false;
  onClose.mockReset();
});
afterEach(cleanup);

const save = () => screen.getByRole("button", { name: "Save" });
const expectedBox = () => screen.getByRole("textbox", { name: /Expected output/ });

describe("EvalCaseModal — parts (AC-36)", () => {
  it("renders the title, subtitle, fields, tabs, expected output, last run and footer", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveStyle({ width: "920px" });
    expect(screen.getByText("Eval case · stripe-key-leak")).toBeInTheDocument();
    expect(
      screen.getByText("Security Reviewer · simulate a PR and assert the expected output"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("stripe-key-leak");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Catches a committed live key");
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PR meta" })).toBeInTheDocument();
    expect(expectedBox()).toHaveValue(JSON.stringify(EXPECTATION, null, 2));
    expect(screen.getByText("Never run")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
  });

  it("has no Files tab, Finding skeleton, Run case or Run on save", () => {
    renderModal();
    for (const gone of [/Files/, /Finding skeleton/, /Run case/, /Run on save/]) {
      expect(screen.queryByText(gone)).toBeNull();
      expect(screen.queryByRole("button", { name: gone })).toBeNull();
    }
  });
});

describe("EvalCaseModal — read-only input (AC-37, AC-38)", () => {
  it("has no editable control inside the Diff tab", () => {
    renderModal();
    const pre = screen.getByText(/stripeKey/).closest("pre")!;
    expect(within(pre).queryAllByRole("textbox")).toHaveLength(0);
    // The only editable controls of the dialog are Name, Notes and Expected output.
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("has no editable control inside the PR meta tab, and shows number, title and body", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("#483")).toBeInTheDocument();
    expect(screen.getByText("Add Stripe integration")).toBeInTheDocument();
    expect(screen.getByText("Wire up payments.")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("says so when the PR has no description", () => {
    renderModal(makeCase({ input_meta: { pr_number: 483, title: "T", body: null } }));
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("colours added, removed and hunk lines with the mock's tokens", () => {
    renderModal();
    const line = (text: RegExp) => screen.getByText(text) as HTMLElement;
    expect(line(/stripeKey/).style.backgroundColor).toBe("var(--code-add)");
    expect(line(/legacy/).style.backgroundColor).toBe("var(--code-del)");
    expect(line(/@@ -10,6/).style.color).toBe("var(--accent-text)");
    // File headers are not additions or removals.
    expect(line(/\+\+\+ b\/src/).style.backgroundColor).toBe("transparent");
    expect(line(/--- a\/src/).style.backgroundColor).toBe("transparent");
  });
});

describe("EvalCaseModal — expected output validation (AC-39, AC-40)", () => {
  it("shows 'valid JSON' with Save enabled for a valid expectation", () => {
    renderModal();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it("shows 'invalid JSON' and disables Save for malformed JSON", () => {
    renderModal();
    fireEvent.change(expectedBox(), { target: { value: "{ not json" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("shows 'invalid JSON' and disables Save when the shape misses a field", () => {
    renderModal();
    fireEvent.change(expectedBox(), {
      target: { value: JSON.stringify({ kind: "must_find", start_line: 1, end_line: 2 }) },
    });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("disables Save for a blank name", () => {
    renderModal();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "  " } });
    expect(save()).toBeDisabled();
  });
});

describe("EvalCaseModal — saving", () => {
  it("sends only the changed fields", () => {
    renderModal();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "stripe-key" } });
    fireEvent.change(expectedBox(), {
      target: { value: JSON.stringify({ ...EXPECTATION, start_line: 11, end_line: 13 }) },
    });
    fireEvent.click(save());
    expect(update.mutate).toHaveBeenCalledTimes(1);
    const [vars] = update.mutate.mock.calls[0]!;
    expect(vars).toEqual({
      id: "c1",
      patch: { name: "stripe-key", expectation: { ...EXPECTATION, start_line: 11, end_line: 13 } },
    });
  });

  it("sends cleared notes as null", () => {
    renderModal();
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "" } });
    fireEvent.click(save());
    expect(update.mutate.mock.calls[0]![0]).toEqual({ id: "c1", patch: { notes: null } });
  });

  it("just closes when nothing changed", () => {
    renderModal();
    fireEvent.click(save());
    expect(update.mutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes once the update succeeds", () => {
    renderModal();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "renamed" } });
    fireEvent.click(save());
    const opts = update.mutate.mock.calls[0]![1] as { onSuccess: () => void };
    opts.onSuccess();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("EvalCaseModal — last run (AC-44)", () => {
  it("renders a passed run with seconds and formatted cost", () => {
    renderModal(makeCase({ last_outcome: outcome() }));
    expect(
      screen.getByText("Last run passed · expected a finding at src/config.ts:12–12, got 1 · 1.8s · $0.02"),
    ).toBeInTheDocument();
  });

  it("renders a failed run", () => {
    renderModal(
      makeCase({ last_outcome: outcome({ pass: false, findings_matched: 0, duration_ms: 2500 }) }),
    );
    expect(
      screen.getByText("Last run failed · expected a finding at src/config.ts:12–12, got 0 · 2.5s · $0.02"),
    ).toBeInTheDocument();
  });

  it("renders a null cost as the em dash", () => {
    renderModal(makeCase({ last_outcome: outcome({ cost_usd: null }) }));
    expect(
      screen.getByText("Last run passed · expected a finding at src/config.ts:12–12, got 1 · 1.8s · —"),
    ).toBeInTheDocument();
  });

  it("renders an errored run with its reason", () => {
    renderModal(
      makeCase({
        last_outcome: outcome({ status: "errored", pass: null, error_reason: "timeout" }),
      }),
    );
    expect(screen.getByText("Last run errored · timeout")).toBeInTheDocument();
  });
});

describe("EvalCaseModal — source (AC-45)", () => {
  it("shows the PR number and location when the source finding exists", () => {
    renderModal();
    expect(screen.getByText("PR #483 · src/config.ts:12–12")).toBeInTheDocument();
    expect(screen.queryByText("source removed")).toBeNull();
  });

  it("shows 'source removed' when the finding is gone", () => {
    renderModal(
      makeCase({ source: { finding_id: null, pr_number: 483, repo: "acme/payments-api", available: false } }),
    );
    expect(screen.getByText("source removed")).toBeInTheDocument();
    expect(screen.queryByText(/^PR #483/)).toBeNull();
  });
});

describe("EvalCaseModal — closing and untrusted text (NFR-3, NFR-4)", () => {
  it("closes on Escape", () => {
    renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a diff line, PR title and body containing markup as literal text", () => {
    const evil = "<img src=x onerror=alert(1)>";
    renderModal(
      makeCase({
        input_diff: `${DIFF}\n+${evil}`,
        input_meta: { pr_number: 1, title: evil, body: evil },
      }),
    );
    expect(screen.getByText(`+${evil}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getAllByText(evil)).toHaveLength(2);
    expect(document.querySelector("img")).toBeNull();
  });
});
