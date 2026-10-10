/* EvalCaseModal with the REAL hooks and a mocked `fetch`: the requests it sends,
   the "Saving…" state, and the toast a failed save raises (SPEC-05 AC-14, AC-15,
   AC-17), plus the request sequences of "Run case" (SPEC-07 AC-4..AC-12, AC-16,
   AC-17). `EvalCaseModal.test.tsx` mocks the hooks and covers the form itself. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { act, render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalCaseOutcome, EvalSuiteRun } from "@devdigest/shared";
import { ApiError, describeApiError } from "@/lib/api";
import { useEvalCases } from "@/lib/hooks/eval";
import { ToastProvider, notify } from "@/lib/toast";
import messages from "../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";
import { EvalCaseModal } from "./EvalCaseModal";

const PASTE = "+++ b/src/a.ts\n@@ -10,2 +12,3 @@\n+first added\n ctx\n+more\n";
const EXPECTATION = { kind: "must_find", file: "src/a.ts", start_line: 12, end_line: 12 } as const;

const fetchMock = vi.fn();
const onClose = vi.fn();
const onCreated = vi.fn();

/** A client wired like `Providers`: the global mutation handler toasts unless `quietError`. */
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      onError: (err, _v, _c, mutation) => {
        if (mutation.meta?.quietError) return;
        notify.error(describeApiError(err));
      },
    }),
  });
}

function shell(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages, shell: shellMessages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const renderCreate = () =>
  shell(
    <EvalCaseModal
      mode="create"
      agentId="ag1"
      agentName="Security Reviewer"
      onClose={onClose}
      onCreated={onCreated}
    />,
  );

const type = (box: HTMLElement, value: string) => fireEvent.change(box, { target: { value } });
const save = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });
const runCase = () => screen.getByRole("button", { name: "Run case" });
const toasts = () => screen.queryAllByRole("button", { name: "Dismiss" });

function fillValid() {
  type(screen.getByRole("textbox", { name: "Name" }), "my-case");
  type(screen.getByRole("textbox", { name: "Diff" }), PASTE);
  type(screen.getByRole("textbox", { name: /Expected output/ }), JSON.stringify(EXPECTATION));
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const pathOf = (url: unknown) => String(url).replace(/^https?:\/\/[^/]+/, "");
const methodOf = (init: unknown) => (init as RequestInit | undefined)?.method ?? "GET";
const posts = () => fetchMock.mock.calls.filter(([, init]) => methodOf(init) === "POST");
/** Every request that is not a read, as "METHOD /path", in the order sent. */
const mutating = () =>
  fetchMock.mock.calls
    .filter(([, init]) => methodOf(init) !== "GET")
    .map(([url, init]) => `${methodOf(init)} ${pathOf(url)}`);

/** What the server holds: the reads the modal's hooks make while it is open. */
let casesList: EvalCase[] = [];
let runsList: EvalSuiteRun[] = [];
const runById: Record<string, EvalSuiteRun> = {};

/** `handler` answers the writes (and may take over any read); a read it skips gets the state above. */
function mockApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) {
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const taken = handler(pathOf(url), init);
    if (taken) return taken;
    const path = pathOf(url);
    if (methodOf(init) === "GET") {
      if (/\/agents\/ag1\/eval\/runs$/.test(path)) return reply(200, runsList);
      if (/\/agents\/ag1\/eval\/cases$/.test(path)) return reply(200, casesList);
      const run = /\/eval\/runs\/([^/]+)$/.exec(path);
      if (run && runById[run[1]!]) return reply(200, runById[run[1]!]);
    }
    return reply(404, { error: { code: "not_found", message: "no" } });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  onClose.mockReset();
  onCreated.mockReset();
  casesList = [];
  runsList = [];
  for (const k of Object.keys(runById)) delete runById[k];
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EvalCaseModal create — requests (SPEC-05 AC-14, AC-15)", () => {
  it("sends one create request on a double click, shows 'Saving…', and closes after the 201", async () => {
    let finish!: (r: Response) => void;
    mockApi((_path, init) =>
      methodOf(init) === "POST" ? new Promise<Response>((resolve) => (finish = resolve)) : undefined,
    );
    renderCreate();
    fillValid();
    fireEvent.click(save());
    fireEvent.click(save());
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(String(posts()[0]![0])).toMatch(/\/agents\/ag1\/eval\/cases$/);
    expect(JSON.parse((posts()[0]![1] as RequestInit).body as string)).toEqual({
      name: "my-case",
      input_diff: PASTE,
      expectation: EXPECTATION,
    });
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    finish(reply(201, { id: "c9" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("EvalCaseModal — a failed save (SPEC-05 AC-17)", () => {
  const E = messages.errors;
  const cases: Array<[string, number, string, string]> = [
    ["diff_unparseable", 422, "diff_unparseable", E.diff_unparseable],
    ["multi_file_diff", 422, "multi_file_diff", E.multi_file_diff],
    ["diff_too_large", 422, "diff_too_large", E.diff_too_large],
    ["file_mismatch", 422, "file_mismatch", E.file_mismatch],
    ["range_outside_hunks", 422, "range_outside_hunks", E.range_outside_hunks],
    ["diff_frozen", 422, "diff_frozen", E.diff_frozen],
    ["validation_error", 422, "validation_error", E.validation_error],
    ["a 404", 404, "not_found", E.generic],
    ["an unknown code", 500, "boom", E.generic],
  ];

  for (const [label, status, code, text] of cases) {
    it(`shows one mapped toast for ${label} and keeps every field`, async () => {
      mockApi((_path, init) =>
        methodOf(init) === "POST"
          ? reply(status, { error: { code, message: "raw server words" } })
          : undefined,
      );
      renderCreate();
      fillValid();
      type(screen.getByRole("textbox", { name: "Notes" }), "a note");
      fireEvent.click(save());
      await waitFor(() => expect(toasts()).toHaveLength(1));
      const toast = toasts()[0]!.parentElement!;
      expect(within(toast).getByText(text)).toBeInTheDocument();
      expect(toast.textContent).not.toMatch(new RegExp(`${code}|errors\\.|raw server words`));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("my-case");
      expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("a note");
      expect(screen.getByRole("textbox", { name: "Diff" })).toHaveValue(PASTE);
      expect(screen.getByRole("textbox", { name: /Expected output/ })).toHaveValue(JSON.stringify(EXPECTATION));
      // The guard is released: the user can save again.
      await waitFor(() => expect(save()).toBeEnabled());
    });
  }

  it("shows one mapped toast for a failed update of a manual case, fields kept", async () => {
    mockApi((_path, init) =>
      methodOf(init) === "PATCH" ? reply(422, { error: { code: "diff_frozen", message: "x" } }) : undefined,
    );
    const manual: EvalCase = {
      id: "c1",
      agent_id: "ag1",
      name: "manual-one",
      notes: null,
      input_diff: `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${PASTE.split("\n").slice(1).join("\n")}`,
      input_meta: { pr_number: null, title: "", body: null },
      expectation: EXPECTATION,
      origin: "manual",
      labels: null,
      source: null,
      created_at: "2026-10-01T10:00:00.000Z",
      last_outcome: null,
    };
    shell(<EvalCaseModal mode="edit" evalCase={manual} agentName="Security Reviewer" onClose={onClose} />);
    type(screen.getByRole("textbox", { name: "Name" }), "renamed");
    fireEvent.click(save());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(screen.getByText(messages.errors.diff_frozen)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("renamed");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps ApiError importable for the mapping (sanity)", () => {
    expect(new ApiError("x", 422, "diff_frozen").code).toBe("diff_frozen");
  });
});

// ---- SPEC-07: Run case ---------------------------------------------------------

const MANUAL_DIFF = `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${PASTE.split("\n").slice(1).join("\n")}`;

function outcomeOf(over: Partial<EvalCaseOutcome> = {}): EvalCaseOutcome {
  return {
    case_id: "c1",
    case_name: "manual-one",
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

function caseOf(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "c1",
    agent_id: "ag1",
    name: "manual-one",
    notes: null,
    input_diff: MANUAL_DIFF,
    input_meta: { pr_number: null, title: "", body: null },
    expectation: EXPECTATION,
    origin: "manual",
    labels: null,
    source: null,
    created_at: "2026-10-01T10:00:00.000Z",
    last_outcome: null,
    ...over,
  };
}

function caseRunOf(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "r1",
    agent_id: "ag1",
    agent_version: 1,
    status: "running",
    error_reason: null,
    started_at: "2026-10-09T10:00:00.000Z",
    finished_at: null,
    cases_total: 1,
    cases_done: 0,
    cases_passed: 0,
    cases_scored: 0,
    cases_errored: 0,
    recall: null,
    precision: null,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    config: { system_prompt: "p", model: "gpt-4.1", provider: "openai", strategy: "single-pass", skills: [] },
    scope: "case",
    case_id: "c1",
    ...over,
  };
}

/** The tab's role for the modal: it hands the modal the case the list cache holds. */
function Harness({ caseId }: { caseId: string }) {
  const list = useEvalCases("ag1");
  const found = list.data?.find((c) => c.id === caseId);
  return found ? (
    <EvalCaseModal key={found.id} mode="edit" evalCase={found} agentName="Security Reviewer" onClose={onClose} />
  ) : null;
}

/** An edit modal over a server that answers the writes below; `startReply` is the run-start answer. */
async function renderEdit(
  c: EvalCase,
  opts: { startReply?: () => Response; onWrite?: (path: string, init?: RequestInit) => Response | undefined } = {},
) {
  casesList = [c];
  const startReply =
    opts.startReply ??
    (() => {
      // An accepted start: the server now holds a running case run, listed and readable by id.
      runsList = [caseRunOf()];
      runById.r1 = caseRunOf();
      return reply(202, { run_id: "r1", status: "running", cases_total: 1 });
    });
  mockApi((path, init) => {
    const custom = opts.onWrite?.(path, init);
    if (custom) return custom;
    const method = methodOf(init);
    if (method === "PATCH" && /\/eval\/cases\/c1$/.test(path)) {
      const updated = { ...casesList[0]!, ...(JSON.parse(init!.body as string) as Partial<EvalCase>) };
      casesList = [updated];
      return reply(200, updated);
    }
    if (method === "POST" && /\/eval\/cases\/c1\/runs$/.test(path)) return startReply();
    return undefined;
  });
  shell(<Harness caseId="c1" />);
  await screen.findByRole("dialog");
}

const RUN_POST = "POST /eval/cases/c1/runs";
const PATCH_C1 = "PATCH /eval/cases/c1";
const E = messages.errors;

describe("EvalCaseModal — Run case, edit mode (SPEC-07 AC-4, AC-5, AC-9, AC-12)", () => {
  it("a changed case sends the PATCH, then the run POST, in that order, and stays open (AC-4, AC-12)", async () => {
    await renderEdit(caseOf());
    type(screen.getByRole("textbox", { name: "Name" }), "renamed");
    fireEvent.click(runCase());
    await waitFor(() => expect(mutating()).toEqual([PATCH_C1, RUN_POST]));
    expect(JSON.parse((fetchMock.mock.calls.find(([, i]) => methodOf(i) === "PATCH")![1] as RequestInit).body as string)).toEqual({
      name: "renamed",
    });
    // The 202 does not close the dialog.
    expect(await screen.findByText("Running…")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(toasts()).toHaveLength(0);
  });

  it("an unchanged case sends exactly one request: the run POST (AC-5)", async () => {
    await renderEdit(caseOf());
    fireEvent.click(runCase());
    await waitFor(() => expect(mutating()).toEqual([RUN_POST]));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("starts no run when the PATCH fails: one toast, the dialog open, the fields kept (AC-9)", async () => {
    await renderEdit(caseOf(), {
      onWrite: (_p, init) =>
        methodOf(init) === "PATCH" ? reply(422, { error: { code: "diff_frozen", message: "raw" } }) : undefined,
    });
    type(screen.getByRole("textbox", { name: "Name" }), "renamed");
    fireEvent.click(runCase());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(within(toasts()[0]!.parentElement!).getByText(E.diff_frozen)).toBeInTheDocument();
    expect(mutating()).toEqual([PATCH_C1]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("renamed");
    await waitFor(() => expect(runCase()).toBeEnabled());
  });

  it("a double click sends one PATCH and one run POST (AC-8)", async () => {
    await renderEdit(caseOf());
    type(screen.getByRole("textbox", { name: "Name" }), "renamed");
    const run = runCase();
    fireEvent.click(run);
    fireEvent.click(run);
    await waitFor(() => expect(mutating()).toEqual([PATCH_C1, RUN_POST]));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mutating()).toEqual([PATCH_C1, RUN_POST]);
  });
});

describe("EvalCaseModal — a refused run start (SPEC-07 AC-10)", () => {
  const REFUSALS: [string, number, string | undefined, string][] = [
    ["409 run_in_progress", 409, "run_in_progress", E.run_in_progress],
    ["422 provider_key_missing", 422, "provider_key_missing", E.provider_key_missing],
    ["429", 429, undefined, E.rateLimited],
  ];

  it.each(REFUSALS)("after a save, %s is one 'Case saved; not run: …' toast", async (_n, status, code, text) => {
    await renderEdit(caseOf(), { startReply: () => reply(status, { error: { code, message: "server wording" } }) });
    type(screen.getByRole("textbox", { name: "Name" }), "renamed");
    fireEvent.click(runCase());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    const toast = toasts()[0]!.parentElement!;
    expect(toast.textContent).toContain(`Case saved; not run: ${text}`);
    expect(toast.textContent).not.toMatch(/server wording|errors\.|run_in_progress|provider_key_missing/);
    expect(mutating()).toEqual([PATCH_C1, RUN_POST]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("renamed");
  });

  it("with nothing saved, the toast is the plain mapped text, without the prefix", async () => {
    await renderEdit(caseOf(), {
      startReply: () => reply(409, { error: { code: "run_in_progress", message: "server wording" } }),
    });
    fireEvent.click(runCase());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    const toast = toasts()[0]!.parentElement!;
    expect(within(toast).getByText(E.run_in_progress)).toBeInTheDocument();
    expect(toast.textContent).not.toMatch(/Case saved/);
    expect(mutating()).toEqual([RUN_POST]);
  });
});

describe("EvalCaseModal — following the run (SPEC-07 AC-16, AC-17)", () => {
  /** Click Run case on an unchanged case, then let the server's answers move on after the 202. */
  async function startRun() {
    await renderEdit(caseOf(), {
      onWrite: (path, init) => {
        if (methodOf(init) === "POST" && /\/runs$/.test(path)) {
          runsList = [caseRunOf()];
          runById.r1 = caseRunOf();
          return reply(202, { run_id: "r1", status: "running", cases_total: 1 });
        }
        return undefined;
      },
    });
    fireEvent.click(runCase());
    expect(await screen.findByText("Running…")).toBeInTheDocument();
    expect(runCase()).toBeDisabled();
  }

  const poll = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(3100); // the runs list and the run both poll every 3 s
    });

  it("the Last run line reads the new outcome at the first poll after the run is final (AC-16)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await startRun();
      // The run finished: finished case runs leave the list, and the case carries the outcome.
      runsList = [];
      runById.r1 = caseRunOf({ status: "completed", finished_at: "2026-10-09T10:00:02.000Z", cases_done: 1 });
      casesList = [caseOf({ last_outcome: outcomeOf() })];
      await poll();
      expect(
        await screen.findByText("Last run passed · expected a finding at src/a.ts:12–12, got 1 · 1.8s · $0.02"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Running…")).toBeNull();
      await waitFor(() => expect(runCase()).toBeEnabled());
      expect(toasts()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an errored case reads 'Last run errored · timeout' (AC-16)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await startRun();
      runsList = [];
      runById.r1 = caseRunOf({ status: "failed", error_reason: "all_cases_errored", cases_done: 1 });
      casesList = [caseOf({ last_outcome: outcomeOf({ status: "errored", pass: null, error_reason: "timeout" }) })];
      await poll();
      expect(await screen.findByText("Last run errored · timeout")).toBeInTheDocument();
      expect(screen.queryByText("Run interrupted — try again")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a run already final on its first read (no read ever saw it running) still updates the Last run line (AC-16)", async () => {
    await renderEdit(caseOf(), {
      onWrite: (path, init) => {
        if (methodOf(init) === "POST" && /\/runs$/.test(path)) {
          // An instant provider error: the run is over before the first read of it.
          runsList = [];
          runById.r1 = caseRunOf({ status: "failed", error_reason: "all_cases_errored", cases_done: 1 });
          casesList = [caseOf({ last_outcome: outcomeOf({ status: "errored", pass: null, error_reason: "timeout" }) })];
          return reply(202, { run_id: "r1", status: "running", cases_total: 1 });
        }
        return undefined;
      },
    });
    expect(screen.getByText("Never run")).toBeInTheDocument();
    fireEvent.click(runCase());
    expect(await screen.findByText("Last run errored · timeout")).toBeInTheDocument();
    expect(screen.queryByText("Running…")).toBeNull();
    await waitFor(() => expect(runCase()).toBeEnabled());
  });

  it("a run that failed as interrupted shows 'Run interrupted — try again' and Run case works again (AC-17)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await startRun();
      runsList = [];
      runById.r1 = caseRunOf({ status: "failed", error_reason: "interrupted", finished_at: "2026-10-09T10:20:00.000Z" });
      await poll();
      expect(await screen.findByText("Run interrupted — try again")).toBeInTheDocument();
      expect(screen.queryByText("Running…")).toBeNull();
      await waitFor(() => expect(runCase()).toBeEnabled());
      // Try again: the start is accepted again, and the interruption message gives way to "Running…".
      fireEvent.click(runCase());
      expect(await screen.findByText("Running…")).toBeInTheDocument();
      expect(screen.queryByText("Run interrupted — try again")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("EvalCaseModal — Run case, create mode (SPEC-07 AC-6, AC-8, AC-9, AC-11)", () => {
  const CREATE = "POST /agents/ag1/eval/cases";

  function serverFor(startReply: () => Response) {
    mockApi((path, init) => {
      if (methodOf(init) !== "POST") return undefined;
      if (/\/agents\/ag1\/eval\/cases$/.test(path)) return reply(201, caseOf({ id: "new1", name: "my-case" }));
      if (/\/eval\/cases\/new1\/runs$/.test(path)) return startReply();
      return undefined;
    });
  }
  const accepted = () => reply(202, { run_id: "r1", status: "running", cases_total: 1 });

  it("creates, then starts a run for the id of the 201, then hands over to the edit modal (AC-6)", async () => {
    serverFor(accepted);
    renderCreate();
    fillValid();
    fireEvent.click(runCase());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new1"));
    expect(mutating()).toEqual([CREATE, "POST /eval/cases/new1/runs"]);
    expect(onClose).not.toHaveBeenCalled();
    expect(toasts()).toHaveLength(0);
  });

  it("a double click sends one create and one run POST (AC-8)", async () => {
    serverFor(accepted);
    renderCreate();
    fillValid();
    const run = runCase();
    fireEvent.click(run);
    fireEvent.click(run);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mutating()).toEqual([CREATE, "POST /eval/cases/new1/runs"]);
  });

  it("a Save click during Run case sends no second create (AC-8)", async () => {
    serverFor(accepted);
    renderCreate();
    fillValid();
    fireEvent.click(runCase());
    fireEvent.click(save());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mutating().filter((m) => m === CREATE)).toHaveLength(1);
  });

  it("a rejected create starts no run: one toast, fields kept, no hand-over (AC-9)", async () => {
    mockApi((path, init) =>
      methodOf(init) === "POST" && /\/agents\/ag1\/eval\/cases$/.test(path)
        ? reply(422, { error: { code: "file_mismatch", message: "raw" } })
        : undefined,
    );
    renderCreate();
    fillValid();
    fireEvent.click(runCase());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(within(toasts()[0]!.parentElement!).getByText(E.file_mismatch)).toBeInTheDocument();
    expect(mutating()).toEqual([CREATE]);
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("my-case");
    expect(screen.getByRole("textbox", { name: "Diff" })).toHaveValue(PASTE);
    await waitFor(() => expect(runCase()).toBeEnabled());
  });

  it("a refused start after the create is one 'Case saved; not run' toast, and the hand-over still happens (AC-11)", async () => {
    serverFor(() => reply(409, { error: { code: "run_in_progress", message: "server wording" } }));
    renderCreate();
    fillValid();
    fireEvent.click(runCase());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new1"));
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]!.parentElement!.textContent).toContain(`Case saved; not run: ${E.run_in_progress}`);
    expect(mutating()).toEqual([CREATE, "POST /eval/cases/new1/runs"]);
  });
});
