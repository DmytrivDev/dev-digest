/* EvalCaseModal with the REAL hooks and a mocked `fetch`: the requests it sends,
   the "Saving…" state, and the toast a failed save raises (SPEC-05 AC-14, AC-15,
   AC-17). `EvalCaseModal.test.tsx` mocks the hooks and covers the form itself. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase } from "@devdigest/shared";
import { ApiError, describeApiError } from "@/lib/api";
import { ToastProvider, notify } from "@/lib/toast";
import messages from "../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";
import { EvalCaseModal } from "./EvalCaseModal";

const PASTE = "+++ b/src/a.ts\n@@ -10,2 +12,3 @@\n+first added\n ctx\n+more\n";
const EXPECTATION = { kind: "must_find", file: "src/a.ts", start_line: 12, end_line: 12 } as const;

const fetchMock = vi.fn();
const onClose = vi.fn();

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
  shell(<EvalCaseModal mode="create" agentId="ag1" agentName="Security Reviewer" onClose={onClose} />);

const type = (box: HTMLElement, value: string) => fireEvent.change(box, { target: { value } });
const save = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });
const toasts = () => screen.queryAllByRole("button", { name: "Dismiss" });

function fillValid() {
  type(screen.getByRole("textbox", { name: "Name" }), "my-case");
  type(screen.getByRole("textbox", { name: "Diff" }), PASTE);
  type(screen.getByRole("textbox", { name: /Expected output/ }), JSON.stringify(EXPECTATION));
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  fetchMock.mockReset();
  onClose.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EvalCaseModal create — requests (SPEC-05 AC-14, AC-15)", () => {
  it("sends one create request on a double click, shows 'Saving…', and closes after the 201", async () => {
    let finish!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)));
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
      fetchMock.mockResolvedValue(reply(status, { error: { code, message: "raw server words" } }));
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
    fetchMock.mockResolvedValue(reply(422, { error: { code: "diff_frozen", message: "x" } }));
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
