import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

// mermaid cannot lay out under jsdom — only the component's contract with it is tested.
vi.mock("mermaid", () => ({ default: mermaid }));

import { TourSections } from "./TourSections";

const SHA = "a1e59f2c0d4b7e8f9a1b2c3d4e5f60718293a4b5";
const REPO = "acme/api";

type Sections = OnboardingTour["sections"];

function makeTour(over: { [K in 0 | 1 | 2 | 3 | 4]?: Partial<Sections[K]> } = {}): OnboardingTour {
  const sections: Sections = [
    {
      kind: "architecture_overview",
      title: "Architecture overview",
      empty_reason: null,
      body: "The API entry is [`src/server.ts`](https://example.com/x).",
      diagram: "graph TD\n  A --> B",
      facts: {
        package_manager: "pnpm",
        package_dirs: ["server", "client"],
        top_folders: [{ path: "server/src", files: 1204 }],
        compose_services: ["postgres"],
        extensions: [{ extension: ".ts", files: 3100 }],
      },
      ...over[0],
    },
    {
      kind: "critical_paths",
      title: "Critical paths",
      empty_reason: null,
      items: [{ path: "src/a b.ts", imported_by: 3, reason: "Shared config loader" }],
      ...over[1],
    },
    {
      kind: "how_to_run",
      title: "How to run locally",
      empty_reason: null,
      steps: [
        { command: "pnpm install", note: null },
        { command: "cp .env.example .env", note: "set OPENAI_API_KEY" },
      ],
      ...over[2],
    },
    {
      kind: "guided_reading",
      title: "Guided reading path",
      empty_reason: null,
      items: [{ path: "src/a b.ts", why: "Start here" }],
      ...over[3],
    },
    {
      kind: "first_tasks",
      title: "First tasks",
      empty_reason: null,
      items: [{ title: "Add a health route", scope: "src/routes", complexity: "Low" }],
      ...over[4],
    },
  ] as Sections;
  return {
    repo_id: "7b0b8f6e-6e0b-4a53-9a3e-2d2c9b1f0a11",
    status: "narrative",
    reasons: [],
    generated_at: "2026-10-02T10:00:00.000Z",
    branch: "main",
    indexed_sha: SHA,
    indexed_files: 4812,
    walk_total: null,
    stale: false,
    last_failure: null,
    usage: {
      llm_calls: 1,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
      tokens_in: 4000,
      tokens_out: 1214,
      cost_usd: 0.0003,
      duration_ms: 9000,
    },
    sections,
  };
}

function renderSections(tour: OnboardingTour = makeTour()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourSections tour={tour} repoFullName={REPO} />
    </NextIntlClientProvider>,
  );
}

const region = (name: string) => within(screen.getByRole("region", { name }));

const writeText = vi.fn();

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: "<svg></svg>" });
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(cleanup);

describe("TourSections", () => {
  it("renders the five sections as expanded cards in tuple order (AC-90)", () => {
    renderSections();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    for (const name of headings) {
      expect(screen.getByRole("button", { name: name ?? "" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
  });

  it("shows the empty-reason sentence in place of the rows (AC-43)", () => {
    renderSections(makeTour({ 1: { empty_reason: "no_import_graph", items: [] } }));
    const critical = region("Critical paths");
    expect(
      critical.getByText("The index holds no import edges, so critical paths are unavailable."),
    ).toBeInTheDocument();
    expect(critical.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
  });

  it("links Open and the reading path to the indexed commit, encoded, in a new tab (AC-67)", () => {
    renderSections();
    const expected = `https://github.com/${REPO}/blob/${SHA}/src/a%20b.ts`;

    const open = region("Critical paths").getByRole("link", { name: "Open" });
    expect(open).toHaveAttribute("href", expected);
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");

    const reading = region("Guided reading path").getByRole("link", { name: "src/a b.ts" });
    expect(reading).toHaveAttribute("href", expected);
    expect(reading).toHaveAttribute("target", "_blank");
    expect(reading).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows how many files import a critical path", () => {
    renderSections();
    expect(region("Critical paths").getByText("imported by 3")).toBeInTheDocument();
  });

  it("copies only the command, never its note (AC-75)", () => {
    renderSections();
    const run = region("How to run locally");
    expect(run.getByText("set OPENAI_API_KEY")).toBeInTheDocument();

    const copyButtons = run.getAllByRole("button", { name: "Copy command" });
    expect(copyButtons).toHaveLength(2);
    fireEvent.click(copyButtons[1] as HTMLElement);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("cp .env.example .env");
    expect(run.getByText("Copied")).toBeInTheDocument();
  });

  it("keeps the copy button's box and content when it shows 'Copied' (no row jump)", () => {
    renderSections();
    const run = region("How to run locally");
    const button = run.getAllByRole("button", { name: "Copy command" })[0] as HTMLElement;
    const before = { width: button.style.width, height: button.style.height };
    expect(before.width).not.toBe("");

    fireEvent.click(button);

    expect(run.getByText("Copied")).toBeInTheDocument();
    expect({ width: button.style.width, height: button.style.height }).toEqual(before);
    // The confirmation floats outside the button rather than growing it.
    expect(button).not.toHaveTextContent("Copied");
    expect(getComputedStyle(run.getByText("Copied").parentElement as HTMLElement).position).toBe("absolute");
  });

  it("labels the first tasks as the model's suggestion (AC-86)", () => {
    renderSections();
    const tasks = region("First tasks");
    expect(tasks.getByText("Suggested by the model")).toBeInTheDocument();
    expect(tasks.getByText("Add a health route")).toBeInTheDocument();
    expect(tasks.getByText("src/routes")).toBeInTheDocument();
    expect(tasks.getByText("Low")).toBeInTheDocument();
  });

  it("renders a link in the architecture body as inert text, keeping the code (AC-83)", () => {
    renderSections();
    const section = screen.getByRole("region", { name: "Architecture overview" });
    const code = within(section).getByText("src/server.ts");
    expect(code.tagName).toBe("CODE");
    expect(section.querySelector("a")).toBeNull();
  });

  it("puts no script, image or event handler from the model's prose in the DOM (NFR-5)", () => {
    renderSections(
      makeTour({
        0: {
          body: 'Hi <script>alert(1)</script> <img src=x onerror="alert(1)"> ![x](https://e.com/a.png)',
        },
      }),
    );
    const section = screen.getByRole("region", { name: "Architecture overview" });
    expect(section.querySelector("script")).toBeNull();
    expect(section.querySelector("img")).toBeNull();
    for (const el of Array.from(section.querySelectorAll("*"))) {
      expect(el.getAttributeNames().filter((n) => n.startsWith("on"))).toEqual([]);
    }
  });

  it("falls back to 'Diagram unavailable' and still shows the body when the diagram is rejected (AC-79)", async () => {
    mermaid.parse.mockResolvedValue(false);
    renderSections();
    const section = region("Architecture overview");
    expect(await section.findByText("Diagram unavailable")).toBeInTheDocument();
    expect(section.getByText("src/server.ts")).toBeInTheDocument();
  });

  it("renders the diagram when mermaid accepts it", async () => {
    renderSections();
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Diagram unavailable")).not.toBeInTheDocument();
  });

  it("shows the measured facts of a skeleton tour with its empty-reason sentence (AC-81)", () => {
    renderSections(
      makeTour({ 0: { body: null, diagram: null, empty_reason: "needs_model" } }),
    );
    const section = region("Architecture overview");
    expect(
      section.getByText("Needs the model — regenerate when the model is available."),
    ).toBeInTheDocument();
    expect(section.getByText("Package manager")).toBeInTheDocument();
    expect(section.getByText("pnpm")).toBeInTheDocument();
    expect(section.getByText("server")).toBeInTheDocument();
    expect(section.getByText("server/src · 1,204 files")).toBeInTheDocument();
    expect(section.getByText("postgres")).toBeInTheDocument();
    expect(section.getByText(".ts · 3,100 files")).toBeInTheDocument();
  });
});
