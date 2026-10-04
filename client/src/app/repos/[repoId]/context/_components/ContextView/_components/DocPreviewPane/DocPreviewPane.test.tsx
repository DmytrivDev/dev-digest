import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../../messages/en/context.json";
import { DocPreviewPane } from "./DocPreviewPane";

type Reply = { status?: number; body: unknown };
let reply: Reply = { body: {} };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const status = reply.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        json: async () => reply.body,
      };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPane(path: string | null, branch = "main") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <DocPreviewPane
          repoId="r1"
          repo={{ owner: "acme", name: "api" }}
          branch={branch}
          path={path}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("DocPreviewPane", () => {
  it("renders the document as markdown", async () => {
    reply = { body: { path: "a.md", content: "# Title\n\nbody", used_by_agents: 0 } };
    renderPane("a.md");
    expect(await screen.findByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
  });

  it("shows how many agents use the document", async () => {
    reply = { body: { path: "a.md", content: "x", used_by_agents: 2 } };
    renderPane("a.md");
    expect(await screen.findByText("Used by 2 agents")).toBeInTheDocument();
  });

  it("links to the file on GitHub in a new tab, with encoded segments", async () => {
    reply = { body: { path: "docs/a b.md", content: "x", used_by_agents: 0 } };
    renderPane("docs/a b.md");
    const link = await screen.findByRole("link", { name: /Open on GitHub/ });
    expect(link.getAttribute("href")).toBe("https://github.com/acme/api/blob/main/docs/a%20b.md");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no image or script from the document", async () => {
    reply = {
      body: {
        path: "a.md",
        content: "# T\n\n![x](https://example.com/a.png)\n\n<script>alert(1)</script>",
        used_by_agents: 0,
      },
    };
    const { container } = renderPane("a.md");
    await screen.findByRole("heading", { name: "T" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("shows the API message when the document cannot be read", async () => {
    reply = {
      status: 404,
      body: { error: { code: "doc_not_found", message: "Document not found" } },
    };
    renderPane("gone.md");
    expect(await screen.findByText("Document not found")).toBeInTheDocument();
  });

  it("asks for a selection when there is no path", () => {
    renderPane(null);
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();
  });
});
