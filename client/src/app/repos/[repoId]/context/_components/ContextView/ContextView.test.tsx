import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDoc, ContextDocList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "r1", owner: "acme", name: "api", full_name: "acme/api" },
  }),
  useRepoNotFound: () => false,
}));

import { ContextView } from "./ContextView";

const REPO_ID = "00000000-0000-4000-8000-000000000001";

const doc = (path: string): ContextDoc => {
  const i = path.lastIndexOf("/");
  return {
    path,
    name: path.slice(i + 1),
    folder: i < 0 ? "" : path.slice(0, i),
    category: "docs",
    approx_tokens: 10,
  };
};

const list = (paths: string[], over: Partial<ContextDocList> = {}): ContextDocList => ({
  repo_id: REPO_ID,
  branch: "main",
  total: paths.length,
  truncated: false,
  docs: paths.map(doc),
  ...over,
});

type Reply = { status?: number; body: unknown };
const requests: string[] = [];
/** Replies handed out per URL prefix, in order; the last one repeats. */
let replies: Record<string, Reply[]> = {};
let pending = false;

function respond(url: string): Reply {
  const key = Object.keys(replies).find((k) => url.includes(k));
  if (!key) return { status: 404, body: { error: { code: "not_found", message: "no route" } } };
  const queue = replies[key]!;
  return queue.length > 1 ? queue.shift()! : queue[0]!;
}

beforeEach(() => {
  requests.length = 0;
  replies = {};
  pending = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      requests.push(String(input));
      if (pending) return new Promise(() => {});
      const r = respond(String(input));
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        json: async () => r.body,
      };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const docReply = (path: string, content = "# Title", used = 0): Reply => ({
  body: { path, content, used_by_agents: used },
});
const listRequests = () => requests.filter((u) => /\/repos\/r1\/context$/.test(u));
const docRequests = () => requests.filter((u) => u.includes("/context/doc?path="));

describe("ContextView", () => {
  it("shows a loading state while the list is in flight", () => {
    pending = true;
    replies = { "/context": [{ body: list([]) }] };
    renderView();
    expect(screen.getByRole("status", { name: "Loading documents…" })).toBeInTheDocument();
  });

  it("shows the truncation notice with the total", async () => {
    const paths = Array.from({ length: 500 }, (_, i) => `docs/f${String(i).padStart(3, "0")}.md`);
    replies = {
      "/context/doc": [docReply(paths[0]!)],
      "/context": [{ body: list(paths, { total: 501, truncated: true }) }],
    };
    renderView();
    expect(await screen.findByText("Showing 500 of 501 documents")).toBeInTheDocument();
    // 500 rows render slowly when the whole suite runs in parallel.
  }, 30_000);

  it("does not show the notice when the list is complete", async () => {
    replies = {
      "/context/doc": [docReply("a.md")],
      "/context": [{ body: list(["a.md"]) }],
    };
    renderView();
    await screen.findByRole("button", { name: "a.md" });
    await screen.findByRole("heading", { name: "Title" }); // let the preview settle
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("renders two README.md in different folders as two distinguishable rows", async () => {
    replies = {
      "/context/doc": [docReply("README.md")],
      "/context": [{ body: list(["README.md", "docs/README.md"]) }],
    };
    renderView();
    const rows = await screen.findAllByRole("button", { name: /README\.md/ });
    expect(rows.map((r) => r.textContent)).toEqual(["README.md", "docs/README.md"]);
  });

  it("filters by path, case-insensitively", async () => {
    replies = {
      "/context/doc": [docReply("specs/public-api.md")],
      "/context": [{ body: list(["docs/deploy.md", "specs/public-api.md"]) }],
    };
    renderView();
    await screen.findByRole("button", { name: "specs/public-api.md" });
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents by path" }), {
      target: { value: "API" },
    });
    expect(screen.getByRole("button", { name: "specs/public-api.md" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "docs/deploy.md" })).not.toBeInTheDocument();
  });

  it("selects the first document and requests its content", async () => {
    replies = {
      "/context/doc": [docReply("a.md")],
      "/context": [{ body: list(["a.md", "b.md"]) }],
    };
    renderView();
    const first = await screen.findByRole("button", { name: "a.md" });
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "b.md" })).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(docRequests()).toHaveLength(1));
    expect(docRequests()[0]).toContain("path=a.md");
  });

  it("selects the row the user clicks and requests that document", async () => {
    replies = {
      "/context/doc": [docReply("a.md"), docReply("b.md", "# Second")],
      "/context": [{ body: list(["a.md", "b.md"]) }],
    };
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "b.md" }));
    expect(screen.getByRole("button", { name: "b.md" })).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(docRequests().some((u) => u.includes("path=b.md"))).toBe(true));
  });

  it("leaves the global focus ring visible on every control of the page (NFR-3)", async () => {
    replies = {
      "/context/doc": [docReply("a.md")],
      "/context": [{ body: list(["a.md", "b.md"]) }],
    };
    renderView();
    await screen.findByRole("button", { name: "a.md" });
    const link = await screen.findByRole("link", { name: /Open on GitHub/ });
    const controls = [
      screen.getByRole("textbox", { name: "Filter documents by path" }),
      screen.getByRole("button", { name: "Refresh" }),
      screen.getByRole("button", { name: "a.md" }),
      screen.getByRole("button", { name: "b.md" }),
      link,
    ];
    for (const el of controls) {
      // jsdom paints no focus ring; assert the cause of a missing one instead: an
      // inline outline suppression overriding the global :focus-visible rule.
      expect(el.style.outlineStyle).not.toBe("none");
      expect(el.style.outline).not.toMatch(/none|^0/);
    }
  });

  it("requests the list again on Refresh and renders the new result", async () => {
    replies = {
      "/context/doc": [docReply("a.md")],
      "/context": [{ body: list(["a.md"]) }, { body: list(["a.md", "new.md"]) }],
    };
    renderView();
    await screen.findByRole("button", { name: "a.md" });
    expect(listRequests()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("button", { name: "new.md" })).toBeInTheDocument();
    expect(listRequests()).toHaveLength(2);
  });

  it("shows the empty state with owner/name@branch and a Refresh button", async () => {
    replies = { "/context": [{ body: list([], { branch: "trunk" }) }] };
    renderView();
    expect(
      await screen.findByText("No markdown documents found in acme/api@trunk"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listRequests()).toHaveLength(2));
  });

  it.each([
    [409, "Repository is not cloned"],
    [500, "Internal Server Error"],
  ])("shows the message of a %i and Retry issues a new request", async (status, message) => {
    replies = { "/context": [{ status, body: { error: { code: "x", message } } }] };
    renderView();
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(listRequests()).toHaveLength(2));
  });

  it("offers no Edit, New file, New folder or Upload control", async () => {
    replies = {
      "/context/doc": [docReply("a.md")],
      "/context": [{ body: list(["a.md"]) }],
    };
    renderView();
    await screen.findByRole("button", { name: "a.md" });
    for (const name of [/edit/i, /new file/i, /new folder/i, /upload/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("renders no raw message key", async () => {
    replies = {
      "/context/doc": [docReply("a.md", "# T", 2)],
      "/context": [{ body: list(["a.md"], { total: 600, truncated: true }) }],
    };
    renderView();
    await screen.findByText("Used by 2 agents");
    expect(document.body.textContent).not.toMatch(
      /\b(?:context|list|filter|preview|picker|empty)\.[a-zA-Z]/,
    );
  });

  it("keeps every control reachable by Tab", async () => {
    replies = {
      "/context/doc": [docReply("a.md")],
      "/context": [{ body: list(["a.md", "b.md"]) }],
    };
    renderView();
    const first = await screen.findByRole("button", { name: "a.md" });
    const rows = within(first.closest("ul") as HTMLElement);
    for (const el of [
      ...rows.getAllByRole("button"),
      screen.getByRole("textbox", { name: "Filter documents by path" }),
      screen.getByRole("button", { name: "Refresh" }),
    ]) {
      expect(["BUTTON", "INPUT"]).toContain(el.tagName);
      expect(el.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});
