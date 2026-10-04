import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingReadiness, OnboardingTour, OnboardingTourResponse } from "@devdigest/shared";
import { ONBOARDING_POLL_MS } from "@/lib/hooks/onboarding";
import messages from "../../../../../../../messages/en/onboarding.json";
import { makeTour } from "./fixtures";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

// mermaid cannot lay out under jsdom — only the component's contract with it matters here.
vi.mock("mermaid", () => ({ default: mermaid }));
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

import { OnboardingView } from "./OnboardingView";

type Reply = { status?: number; body: unknown };

const reply = (
  readiness: OnboardingReadiness,
  tour: OnboardingTour | null = null,
  generating = false,
): Reply => ({ body: { readiness, generating, tour } satisfies OnboardingTourResponse });

const requests: string[] = [];
/** GET replies handed out in order; the last one repeats. */
let getReplies: Reply[] = [];
let postReply: Reply | "pending" = reply("ready");

beforeEach(() => {
  requests.length = 0;
  getReplies = [reply("ready")];
  postReply = reply("ready");
  mermaid.initialize.mockReset();
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: "<svg></svg>" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push(`${method} ${input}`);
      let r: Reply;
      if (method === "POST") {
        if (postReply === "pending") return new Promise(() => {});
        r = postReply;
      } else {
        r = getReplies.length > 1 ? getReplies.shift()! : getReplies[0]!;
      }
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const NOT_CLONED = "This repository has no local clone yet — the tour needs one. Cloning may still be running or may have failed.";
const NOT_INDEXED = "Indexing in progress or not run yet";
const GENERATING = "Generating… up to 2 minutes";
const GENERATE = "Generate onboarding tour";
const SECTION_TITLES = [
  "Architecture overview",
  "Critical paths",
  "How to run locally",
  "Guided reading path",
  "First tasks",
];

const getRequests = () => requests.filter((r) => r.startsWith("GET "));
const generateButtons = () => screen.queryAllByRole("button", { name: /generate/i });
const sectionHeadings = () =>
  screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("OnboardingView readiness states", () => {
  it("not cloned: shows the message and Check again, and no generate control (AC-7)", async () => {
    getReplies = [reply("not_cloned")];
    renderView();
    expect(await screen.findByText(NOT_CLONED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(generateButtons()).toHaveLength(0);

    const before = getRequests().length;
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await vi.waitFor(() => expect(getRequests().length).toBe(before + 1));
  });

  it("not indexed: shows a disabled Generate and the message (AC-8)", async () => {
    getReplies = [reply("not_indexed")];
    renderView();
    expect(await screen.findByText(NOT_INDEXED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GENERATE })).toBeDisabled();
  });

  it("not indexed, then ready: Generate is enabled within 5 s of the ready reply (AC-9)", async () => {
    vi.useFakeTimers();
    getReplies = [reply("not_indexed"), reply("ready")];
    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(NOT_INDEXED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GENERATE })).toBeDisabled();

    expect(ONBOARDING_POLL_MS).toBeLessThanOrEqual(5000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ONBOARDING_POLL_MS + 50);
    });
    expect(screen.queryByText(NOT_INDEXED)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: GENERATE })).toBeEnabled();
  });

  it("not cloned with a stored tour: the message and the five sections, no generate control (AC-10)", async () => {
    getReplies = [reply("not_cloned", makeTour())];
    renderView();
    expect(await screen.findByText(NOT_CLONED)).toBeInTheDocument();
    expect(sectionHeadings()).toEqual(SECTION_TITLES);
    expect(generateButtons()).toHaveLength(0);
  });

  it("ready with no tour: the empty state with its title, body and call to action (AC-11)", async () => {
    renderView();
    const cta = await screen.findByRole("button", { name: GENERATE });
    expect(cta).toBeEnabled();
    expect(
      screen.getAllByText(GENERATE).some((el) => el.tagName === "DIV"),
    ).toBe(true);
    expect(
      screen.getByText(
        "DevDigest reads the repository index and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes up to 2 minutes · one model call.",
      ),
    ).toBeInTheDocument();
  });

  it("ready with a stored tour: header, sections and usage footer, Regenerate enabled", async () => {
    getReplies = [reply("ready", makeTour())];
    renderView();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Onboarding for api");
    expect(sectionHeadings()).toEqual(SECTION_TITLES);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(
      screen.getByText("1 model call · 5,214 tokens · $0.0003 · deepseek/deepseek-v4-flash"),
    ).toBeInTheDocument();
  });

  it("shows an error state with Retry when the tour cannot be loaded", async () => {
    getReplies = [{ status: 500, body: { error: { code: "internal", message: "boom" } } }, reply("ready")];
    renderView();
    expect(await screen.findByText("Couldn’t load the onboarding tour")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: GENERATE })).toBeInTheDocument();
  });
});

describe("OnboardingView generating (AC-17)", () => {
  it("a pending request of its own: the wait message, Generate disabled", async () => {
    postReply = "pending";
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: GENERATE }));
    expect(await screen.findByText(GENERATING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GENERATE })).toBeDisabled();
    expect(requests).toContain("POST http://localhost:3001/repos/r1/onboarding/generate");
  });

  it("a pending request of its own over a stored tour: Regenerate disabled", async () => {
    getReplies = [reply("ready", makeTour())];
    postReply = "pending";
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText(GENERATING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("a generating reply from the server and no tour: the wait message, Generate disabled", async () => {
    getReplies = [reply("ready", null, true)];
    renderView();
    expect(await screen.findByText(GENERATING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GENERATE })).toBeDisabled();
  });

  it("a generating reply from the server over a stored tour: Regenerate disabled", async () => {
    getReplies = [reply("ready", makeTour(), true)];
    renderView();
    expect(await screen.findByText(GENERATING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("shows the tour once the generate request answers", async () => {
    getReplies = [reply("ready"), reply("ready", makeTour())];
    postReply = reply("ready", makeTour());
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: GENERATE }));
    expect(await screen.findByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(sectionHeadings()).toEqual(SECTION_TITLES);
  });
});

describe("OnboardingView text (NFR-3)", () => {
  /** A raw next-intl key path of this namespace, e.g. `reasons.llm_failed`. */
  const RAW_KEY = /\b(header|readiness|reasons|emptyReasons|sections|usage|banner|empty|time|providers|loadError)\.[a-zA-Z_.]+/;

  const allReasons = makeTour({
    reasons: [
      "index_partial",
      "index_truncated",
      "unsupported_language",
      "no_import_graph",
      "no_history",
      "facts_truncated",
      "llm_not_configured",
      "llm_timeout",
      "llm_failed",
      "llm_invalid_output",
    ],
    last_failure: { reason: "llm_failed", at: "2026-10-02T11:00:00.000Z" },
    stale: true,
    walk_total: 8214,
  });

  const scenarios: [string, () => void, () => Promise<unknown>][] = [
    ["not cloned", () => (getReplies = [reply("not_cloned")]), () => screen.findByText(NOT_CLONED)],
    ["not indexed", () => (getReplies = [reply("not_indexed")]), () => screen.findByText(NOT_INDEXED)],
    ["empty", () => (getReplies = [reply("ready")]), () => screen.findByRole("button", { name: GENERATE })],
    ["generating", () => (getReplies = [reply("ready", null, true)]), () => screen.findByText(GENERATING)],
    [
      "a narrative with every reason and a failure",
      () => (getReplies = [reply("ready", allReasons)]),
      () => screen.findByRole("alert"),
    ],
    ["the load error", () => (getReplies = [{ status: 500, body: {} }]), () => screen.findByRole("alert")],
  ];

  /** Every text node on the page — a sentence ending in "time." must not be
      glued to the next node's first word and mistaken for a key path. */
  const rawKeyNodes = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      if (RAW_KEY.test(text)) found.push(text);
    }
    return found;
  };

  it.each(scenarios)("renders no raw key path: %s", async (_name, arrange, settled) => {
    arrange();
    renderView();
    await settled();
    expect(rawKeyNodes()).toEqual([]);
  });

  it("renders no raw key path while loading", () => {
    renderView();
    expect(rawKeyNodes()).toEqual([]);
  });
});
