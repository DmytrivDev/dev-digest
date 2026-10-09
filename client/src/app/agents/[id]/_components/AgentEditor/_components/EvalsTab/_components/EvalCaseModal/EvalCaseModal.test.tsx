import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase, EvalCaseOutcome } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";

const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const createMut = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@/lib/hooks/eval", () => ({
  useUpdateEvalCase: () => update,
  useCreateManualEvalCase: () => createMut,
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
    origin: "finding",
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
    <NextIntlClientProvider locale="en" messages={{ eval: messages, shell: shellMessages }}>
      <EvalCaseModal mode="edit" evalCase={evalCase} agentName="Security Reviewer" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

function renderCreate() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages, shell: shellMessages }}>
      <EvalCaseModal mode="create" agentId="ag1" agentName="Security Reviewer" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  update.mutate.mockReset();
  update.isPending = false;
  createMut.mutate.mockReset();
  createMut.isPending = false;
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

// ---- SPEC-05: create mode and manual cases -----------------------------------

/** First added line is new-side 12; the hunk header starts the new side at 12. */
const PASTE = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,3 +12,4 @@",
  "+first added",
  " ctx line",
  "-removed line",
  "+second added",
  " tail line",
].join("\n");
const PASTE_EXPECTATION = { kind: "must_find", file: "src/a.ts", start_line: 12, end_line: 12 } as const;
const TWO_HUNKS =
  "+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx1\n+add2\n@@ -30,2 +31,2 @@\n ctx31\n+add32\n";
const EVIL = "<img src=x onerror=alert(1)>";

const dialogQueries = () => within(screen.getByRole("dialog"));
const diffBox = () => screen.getByRole("textbox", { name: "Diff" });
const nameBox = () => screen.getByRole("textbox", { name: "Name" });
const skeletonBtn = () => screen.getByRole("button", { name: "Finding skeleton" });
const type = (box: HTMLElement, value: string) => fireEvent.change(box, { target: { value } });
const json = (exp: object) => JSON.stringify(exp);
/** React mirrors a textarea's value into its text node: text queries must skip textareas. */
const NOT_TEXTAREA = { ignore: "textarea, script, style" };

/** Fill a create-mode modal with a valid case. */
function fillValid() {
  type(nameBox(), "my-case");
  type(diffBox(), PASTE);
  type(expectedBox(), json(PASTE_EXPECTATION));
}

describe("EvalCaseModal create mode — parts (SPEC-05 AC-3)", () => {
  it("renders the create parts and none of the absent ones", () => {
    renderCreate();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveStyle({ width: "920px" });
    const d = dialogQueries();
    expect(d.getByText("New eval case")).toBeInTheDocument();
    expect(d.getByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();
    expect(nameBox()).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("");
    expect(d.getByText("Input")).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(d.getByRole("button", { name: "PR meta" })).toBeInTheDocument();
    expect(diffBox()).toHaveValue("");
    expect(expectedBox()).toHaveValue("");
    expect(d.getByText("invalid JSON")).toBeInTheDocument();
    expect(skeletonBtn().querySelector("svg")).not.toBeNull();
    expect(d.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Save" })).toBeInTheDocument();
    for (const gone of [/Files/, /Run case/, /Run on save/, /Last run/, /Never run/, /Created manually/, /PR #/]) {
      expect(d.queryByText(gone)).toBeNull();
      expect(d.queryByRole("button", { name: gone })).toBeNull();
    }
  });
});

describe("EvalCaseModal create mode — diff input and preview (SPEC-05 AC-4..AC-7)", () => {
  it("accepts typing and names the +++ header and the @@ hunk in the placeholder (AC-4)", () => {
    renderCreate();
    expect(diffBox()).toHaveAttribute("placeholder", expect.stringContaining("+++ b/<path>"));
    expect(diffBox()).toHaveAttribute("placeholder", expect.stringContaining("@@"));
    type(diffBox(), "hello");
    expect(diffBox()).toHaveValue("hello");
  });

  it("previews a hunk from +12 with new-side numbers, and shows no '+' affordance (AC-5)", () => {
    renderCreate();
    type(diffBox(), PASTE);
    const gutter = (text: string) => screen.getByText(text).parentElement!.firstElementChild!.textContent;
    expect(gutter("first added")).toBe("12");
    expect(gutter("ctx line")).toBe("13");
    expect(gutter("second added")).toBe("14");
    expect(gutter("tail line")).toBe("15");
    fireEvent.mouseEnter(screen.getByText("second added").parentElement!.parentElement!);
    expect(screen.queryByRole("button", { name: /comment/i })).toBeNull();
  });

  it("previews exactly as many added lines as the hunks hold, never a header line (AC-6)", () => {
    renderCreate();
    type(diffBox(), PASTE);
    expect(dialogQueries().getAllByText("+")).toHaveLength(2);
    expect(dialogQueries().getAllByText("−")).toHaveLength(1);
    for (const header of [/^diff --git/, /^index 111/, /^--- a\//, /^\+\+\+ b\//]) {
      expect(dialogQueries().queryByText(header, NOT_TEXTAREA)).toBeNull();
    }
    expect(dialogQueries().getByText("src/a.ts")).toBeInTheDocument();
  });

  it("opens a large paste past the viewer's auto-collapse (NFR-7)", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const rows = Array.from({ length: 300 }, (_, i) => `+row ${i}`).join("\n");
    renderCreate();
    type(diffBox(), `+++ b/src/a.ts\n@@ -0,0 +1,300 @@\n${rows}\n`);
    expect(screen.getByText("row 299")).toBeInTheDocument();
  });

  it("shows the message of each failing check and no preview (AC-7)", () => {
    renderCreate();
    const alertText = () => screen.getByRole("alert").textContent;
    type(diffBox(), "just some text");
    expect(alertText()).toMatch(/\+\+\+ header naming a file and an @@ hunk/);
    expect(screen.queryByText("src/a.ts")).toBeNull();
    type(diffBox(), "+++ /dev/null\n@@ -1 +0,0 @@\n-x\n");
    expect(alertText()).toMatch(/\+\+\+ header naming a file/);
    type(diffBox(), "+++ b/src/a.ts\n+x\n");
    expect(alertText()).toMatch(/@@ hunk/);
    type(diffBox(), `${PASTE}\n+++ b/src/b.ts\n@@ -1 +1 @@\n+y\n`);
    expect(alertText()).toMatch(/one file only/);
    expect(screen.queryByText("src/a.ts")).toBeNull();
    type(diffBox(), "x".repeat(200 * 1024 + 1));
    expect(alertText()).toMatch(/larger than 200 KB/);
  });

  it("shows only the size message when a paste fails the size and file-count checks (AC-7)", () => {
    renderCreate();
    type(diffBox(), `${PASTE}\n+++ b/src/b.ts\n@@ -1 +1 @@\n+${"x".repeat(200 * 1024)}\n`);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toMatch(/larger than 200 KB/);
  });

  it("shows neither a message nor a preview for empty text (AC-7)", () => {
    renderCreate();
    type(diffBox(), PASTE);
    type(diffBox(), "");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("src/a.ts")).toBeNull();
  });
});

describe("EvalCaseModal create mode — PR meta (SPEC-05 AC-8)", () => {
  it("has editable Title and Body, no PR number and no Linked issue", () => {
    renderCreate();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    const title = screen.getByRole("textbox", { name: "Title" });
    const body = screen.getByRole("textbox", { name: "Body" });
    type(title, "Add Stripe");
    type(body, "Wire up\npayments");
    expect(title).toHaveValue("Add Stripe");
    expect(body).toHaveValue("Wire up\npayments");
    expect(screen.queryByText(/PR number/)).toBeNull();
    expect(screen.queryByText(/Linked issue/)).toBeNull();
  });

  it("keeps the typed diff when the user switches tabs and back", () => {
    renderCreate();
    type(diffBox(), PASTE);
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    expect(diffBox()).toHaveValue(PASTE);
  });
});

describe("EvalCaseModal create mode — Finding skeleton (SPEC-05 AC-9, AC-10)", () => {
  it("writes must_find on the first added line and replaces earlier pane text (AC-9)", () => {
    renderCreate();
    type(expectedBox(), "earlier text");
    type(diffBox(), PASTE);
    fireEvent.click(skeletonBtn());
    expect(expectedBox()).toHaveValue(
      JSON.stringify({ kind: "must_find", file: "src/a.ts", start_line: 12, end_line: 12 }, null, 2),
    );
    expect(dialogQueries().getByText("valid JSON")).toBeInTheDocument();
  });

  it("falls back to the first context line for a diff with no added line (AC-9)", () => {
    renderCreate();
    type(diffBox(), "+++ b/src/a.ts\n@@ -5,3 +5,2 @@\n ctx5\n-gone\n ctx6\n");
    fireEvent.click(skeletonBtn());
    expect(JSON.parse((expectedBox() as HTMLTextAreaElement).value)).toMatchObject({ start_line: 5, end_line: 5 });
  });

  it("is disabled for an empty, an unparseable and a deletion-only paste, enabled for a valid one (AC-10)", () => {
    renderCreate();
    expect(skeletonBtn()).toBeDisabled();
    type(diffBox(), "not a diff");
    expect(skeletonBtn()).toBeDisabled();
    type(diffBox(), "+++ b/src/a.ts\n@@ -4,2 +4,0 @@\n-a\n-b\n");
    expect(skeletonBtn()).toBeDisabled();
    type(diffBox(), PASTE);
    expect(skeletonBtn()).toBeEnabled();
  });
});

describe("EvalCaseModal create mode — expectation against the diff (SPEC-05 AC-11)", () => {
  const messageFor = {
    file: "The expected output must point at the same file as the diff.",
    range: "The expected line range must touch lines inside a hunk, as its @@ header declares them.",
  };

  it("names a wrong file under the pane", () => {
    renderCreate();
    type(diffBox(), PASTE);
    type(expectedBox(), json({ ...PASTE_EXPECTATION, file: "src/other.ts" }));
    expect(screen.getByText(messageFor.file)).toBeInTheDocument();
  });

  it("names a range between two hunks under the pane", () => {
    renderCreate();
    type(diffBox(), TWO_HUNKS);
    type(expectedBox(), json({ ...PASTE_EXPECTATION, start_line: 10, end_line: 10 }));
    expect(screen.getByText(messageFor.range)).toBeInTheDocument();
  });

  it("shows no message for a valid pair, nor for a context-line range", () => {
    renderCreate();
    type(diffBox(), PASTE);
    type(expectedBox(), json(PASTE_EXPECTATION));
    expect(screen.queryByText(messageFor.file)).toBeNull();
    expect(screen.queryByText(messageFor.range)).toBeNull();
    type(expectedBox(), json({ ...PASTE_EXPECTATION, start_line: 13, end_line: 13 }));
    expect(screen.queryByText(messageFor.range)).toBeNull();
  });
});

describe("EvalCaseModal create mode — Save gate (SPEC-05 AC-13)", () => {
  it("is disabled until the name, diff and expectation are all valid", () => {
    renderCreate();
    expect(save()).toBeDisabled();
    fillValid();
    expect(save()).toBeEnabled();
  });

  it("is disabled for a blank name and for a name over 60 characters", () => {
    renderCreate();
    fillValid();
    type(nameBox(), "   ");
    expect(save()).toBeDisabled();
    type(nameBox(), "a".repeat(61));
    expect(save()).toBeDisabled();
    type(nameBox(), "a".repeat(60));
    expect(save()).toBeEnabled();
  });

  it("is disabled for an empty or invalid diff", () => {
    renderCreate();
    fillValid();
    type(diffBox(), "");
    expect(save()).toBeDisabled();
    type(diffBox(), "not a diff");
    expect(save()).toBeDisabled();
  });

  it("is disabled for an invalid expectation and for one that fails a diff check", () => {
    renderCreate();
    fillValid();
    type(expectedBox(), "{ nope");
    expect(save()).toBeDisabled();
    type(expectedBox(), json({ ...PASTE_EXPECTATION, file: "src/other.ts" }));
    expect(save()).toBeDisabled();
    type(expectedBox(), json({ ...PASTE_EXPECTATION, start_line: 99, end_line: 99 }));
    expect(save()).toBeDisabled();
  });

  it("is disabled while a request is pending, and says 'Saving…'", () => {
    createMut.isPending = true;
    renderCreate();
    fillValid();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("EvalCaseModal create mode — saving and closing (SPEC-05 AC-14, AC-18)", () => {
  it("sends the trimmed name and the pasted text, leaving out empty notes and PR meta", () => {
    renderCreate();
    fillValid();
    type(nameBox(), "  my-case  ");
    fireEvent.click(save());
    expect(createMut.mutate).toHaveBeenCalledTimes(1);
    expect(createMut.mutate.mock.calls[0]![0]).toEqual({
      name: "my-case",
      input_diff: PASTE,
      expectation: PASTE_EXPECTATION,
    });
  });

  it("sends notes and the PR title and body together when they are filled", () => {
    renderCreate();
    fillValid();
    type(screen.getByRole("textbox", { name: "Notes" }), "why");
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    type(screen.getByRole("textbox", { name: "Title" }), "T");
    fireEvent.click(save());
    expect(createMut.mutate.mock.calls[0]![0]).toMatchObject({
      notes: "why",
      input_meta: { title: "T", body: null },
    });
  });

  it("issues one create request on a double click", () => {
    renderCreate();
    fillValid();
    fireEvent.click(save());
    fireEvent.click(save());
    expect(createMut.mutate).toHaveBeenCalledTimes(1);
  });

  it("closes once the create succeeds", () => {
    renderCreate();
    fillValid();
    fireEvent.click(save());
    (createMut.mutate.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lets the user save again after a failed create", () => {
    renderCreate();
    fillValid();
    fireEvent.click(save());
    (createMut.mutate.mock.calls[0]![1] as { onSettled: () => void }).onSettled();
    fireEvent.click(save());
    expect(createMut.mutate).toHaveBeenCalledTimes(2);
  });

  it("Cancel and Escape close with no request and no confirmation (AC-18)", () => {
    renderCreate();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(createMut.mutate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

describe("EvalCaseModal — text is never HTML (SPEC-05 NFR-3)", () => {
  it("renders markup typed into every create-mode field as text", () => {
    renderCreate();
    type(nameBox(), EVIL);
    type(screen.getByRole("textbox", { name: "Notes" }), EVIL);
    type(diffBox(), `+++ b/src/a.ts\n@@ -1 +1 @@\n+${EVIL}\n`);
    expect(screen.getByText(EVIL, NOT_TEXTAREA)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    type(screen.getByRole("textbox", { name: "Title" }), EVIL);
    type(screen.getByRole("textbox", { name: "Body" }), EVIL);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("EvalCaseModal — keyboard (SPEC-05 NFR-2)", () => {
  it("makes every create-mode control a native, focusable element", () => {
    renderCreate();
    fillValid(); // a disabled button cannot take focus: enable Finding skeleton and Save
    const controls = [
      ...screen.getAllByRole("textbox"),
      ...within(screen.getByRole("dialog")).getAllByRole("button"),
    ];
    expect(controls.length).toBeGreaterThanOrEqual(8);
    for (const control of controls) {
      expect(control.getAttribute("tabindex")).not.toBe("-1");
      control.focus();
      expect(document.activeElement).toBe(control);
    }
  });
});

describe("EvalCaseModal — editing a manual case (SPEC-05 AC-31..AC-34)", () => {
  const manual = (over: Partial<EvalCase> = {}) =>
    makeCase({
      origin: "manual",
      labels: null,
      source: null,
      input_meta: { pr_number: null, title: "Add Stripe", body: "Wire up payments." },
      ...over,
    });

  it("opens with an editable diff, a preview and an enabled skeleton button (AC-31)", () => {
    renderModal(manual());
    expect(diffBox()).toHaveValue(DIFF);
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(skeletonBtn()).toBeEnabled();
    expect(save()).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Add Stripe");
    expect(screen.getByRole("textbox", { name: "Body" })).toHaveValue("Wire up payments.");
    expect(screen.queryByText(/PR number/)).toBeNull();
  });

  it("opens a finding-born case with no editable input and no skeleton button (AC-32)", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: "Finding skeleton" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Diff" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Body" })).toBeNull();
  });

  it("shows 'Created manually' instead of the PR line, and keeps the PR line for a finding case (AC-33)", () => {
    const { unmount } = renderModal(manual());
    expect(screen.getByText("Created manually")).toBeInTheDocument();
    expect(screen.queryByText(/^PR #/)).toBeNull();
    unmount();
    renderModal();
    expect(screen.queryByText("Created manually")).toBeNull();
    expect(screen.getByText("PR #483 · src/config.ts:12–12")).toBeInTheDocument();
  });

  it("sends input_meta alone when only the body changed (AC-34)", () => {
    renderModal(manual());
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    type(screen.getByRole("textbox", { name: "Body" }), "A new body");
    fireEvent.click(save());
    expect(update.mutate.mock.calls[0]![0]).toEqual({
      id: "c1",
      patch: { input_meta: { title: "Add Stripe", body: "A new body" } },
    });
  });

  it("sends input_diff alone when only the diff changed (AC-34)", () => {
    renderModal(manual());
    type(diffBox(), `${DIFF}\n+  extra: 1,`);
    fireEvent.click(save());
    expect(update.mutate.mock.calls[0]![0]).toEqual({
      id: "c1",
      patch: { input_diff: `${DIFF}\n+  extra: 1,` },
    });
  });

  it("sends a null body when the body was emptied (AC-34)", () => {
    renderModal(manual());
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    type(screen.getByRole("textbox", { name: "Body" }), "");
    fireEvent.click(save());
    expect(update.mutate.mock.calls[0]![0].patch).toEqual({ input_meta: { title: "Add Stripe", body: null } });
  });

  it("closes without a request when nothing changed (AC-34)", () => {
    renderModal(manual());
    fireEvent.click(save());
    expect(update.mutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Save when the edited diff is no longer valid (AC-13)", () => {
    renderModal(manual());
    type(diffBox(), "not a diff");
    expect(save()).toBeDisabled();
  });

  it("never sends input fields for a finding-born case, and disables Save over 60 characters", () => {
    renderModal();
    type(nameBox(), "renamed");
    fireEvent.click(save());
    expect(update.mutate.mock.calls[0]![0]).toEqual({ id: "c1", patch: { name: "renamed" } });
    type(nameBox(), "a".repeat(61));
    expect(save()).toBeDisabled();
  });
});
