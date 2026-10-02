import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import type { OnboardingUsage } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { NOW_MS, makeTour } from "./fixtures";
import {
  reasonText,
  relativeTime,
  subtitleLine,
  subtitleParts,
  tourToMarkdown,
  usageLine,
} from "./helpers";

const t = createTranslator({ locale: "en", messages }) as unknown as (
  key: string,
  values?: Record<string, string | number>,
) => string;

const usage = (over: Partial<OnboardingUsage> = {}): OnboardingUsage => ({
  llm_calls: 1,
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 5000,
  tokens_out: 214,
  cost_usd: 0.0003,
  duration_ms: 9000,
  ...over,
});

describe("relativeTime (AC-31)", () => {
  const ago = (ms: number) => relativeTime(new Date(NOW_MS - ms).toISOString(), NOW_MS, t);

  it("renders 30 s / 5 min / 2 h / 3 d as the four formats", () => {
    expect(ago(30_000)).toBe("just now");
    expect(ago(5 * 60_000)).toBe("5m ago");
    expect(ago(2 * 3_600_000)).toBe("2h ago");
    expect(ago(3 * 86_400_000)).toBe("3d ago");
  });

  it("floors rather than rounds", () => {
    expect(ago(59_999)).toBe("just now");
    expect(ago(119_999)).toBe("1m ago");
    expect(ago(3_600_000 * 23.99)).toBe("23h ago");
  });

  it("reads a time in the future as just now", () => {
    expect(ago(-60_000)).toBe("just now");
  });
});

describe("subtitleLine (AC-29, AC-30)", () => {
  it("renders files, branch @ short SHA and the relative refresh time", () => {
    expect(subtitleLine(makeTour(), NOW_MS, t)).toBe(
      "Generated from 4,812 indexed source files · branch main @ a1e59f2 · last refreshed 2h ago",
    );
  });

  it("adds the truncated part only when the walk found more files", () => {
    const line = subtitleLine(makeTour({ indexed_files: 5000, walk_total: 8214 }), NOW_MS, t);
    expect(line).toContain("5,000 indexed source files (first 5,000 of 8,214) ·");
    expect(subtitleParts(makeTour()).truncated).toBeNull();
  });
});

describe("tourToMarkdown (AC-35)", () => {
  const md = tourToMarkdown(makeTour(), "payments-api", t, NOW_MS);

  it("starts with the title line and the subtitle line", () => {
    const [title, , subtitle] = md.split("\n");
    expect(title).toBe("# Onboarding for payments-api");
    expect(subtitle).toBe(subtitleLine(makeTour(), NOW_MS, t));
  });

  it("has the five section headings in order", () => {
    const headings = md.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual([
      "## Architecture overview",
      "## Critical paths",
      "## How to run locally",
      "## Guided reading path",
      "## First tasks",
    ]);
  });

  it("lists every path, command and task title, and fences the diagram", () => {
    expect(md).toContain("- src/config/loader.ts");
    expect(md).toContain("- `pnpm install`");
    expect(md).toContain("- `cp .env.example .env`");
    expect(md).toContain("- src/server.ts");
    expect(md).toContain("- Add a health route");
    expect(md).toContain("```mermaid\ngraph TD\n  A --> B\n```");
  });

  it("writes an empty section's sentence in place of its rows", () => {
    const tour = makeTour();
    const sections = [...tour.sections] as typeof tour.sections;
    sections[1] = { ...sections[1], items: [], empty_reason: "no_import_graph" };
    const out = tourToMarkdown({ ...tour, sections }, "x", t, NOW_MS);
    expect(out).toContain("The index holds no import edges, so critical paths are unavailable.");
    expect(out).not.toContain("src/config/loader.ts");
  });
});

describe("usageLine (AC-36)", () => {
  it("joins calls, tokens, cost and model", () => {
    expect(usageLine(usage(), t)).toBe(
      "1 model call · 5,214 tokens · $0.0003 · deepseek/deepseek-v4-flash",
    );
  });

  it("says no model call when none was made", () => {
    expect(usageLine(usage({ llm_calls: 0, model: null, tokens_in: null }), t)).toBe(
      "No model call",
    );
  });

  it("pluralises and names what is unknown", () => {
    expect(usageLine(usage({ llm_calls: 2, tokens_out: null, cost_usd: null }), t)).toBe(
      "2 model calls · tokens unknown · cost unknown · deepseek/deepseek-v4-flash",
    );
  });

  it("keeps a real zero cost distinct from an unknown one", () => {
    expect(usageLine(usage({ cost_usd: 0 }), t)).toContain("$0.00");
  });
});

describe("reasonText", () => {
  it("names the provider for llm_not_configured", () => {
    expect(reasonText("llm_not_configured", "openrouter", t)).toBe(
      "No API key is configured for OpenRouter.",
    );
  });

  it("shows an unlabelled provider as its raw id, never as a key path", () => {
    expect(reasonText("llm_not_configured", "acme-llm", t)).toBe(
      "No API key is configured for acme-llm.",
    );
  });

  it("uses the sentence as it is for other reasons", () => {
    expect(reasonText("llm_failed", null, t)).toBe("The model call failed.");
  });
});
