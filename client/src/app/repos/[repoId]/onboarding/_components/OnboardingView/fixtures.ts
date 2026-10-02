/** Test fixtures for OnboardingView and its children — imported by tests only. */

import type { OnboardingTour } from "@devdigest/shared";

export const SHA = "a1e59f2c0d4b7e8f9a1b2c3d4e5f60718293a4b5";
export const GENERATED_AT = "2026-10-02T10:00:00.000Z";
/** Two hours after `GENERATED_AT`. */
export const NOW_MS = Date.parse("2026-10-02T12:00:00.000Z");

/** A full narrative tour; `over` shallow-merges onto the tour itself. */
export function makeTour(over: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    repo_id: "7b0b8f6e-6e0b-4a53-9a3e-2d2c9b1f0a11",
    status: "narrative",
    reasons: [],
    generated_at: GENERATED_AT,
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
      tokens_in: 5000,
      tokens_out: 214,
      cost_usd: 0.0003,
      duration_ms: 9000,
    },
    sections: [
      {
        kind: "architecture_overview",
        title: "Architecture overview",
        empty_reason: null,
        body: "The API entry is server entry.",
        diagram: "graph TD\n  A --> B",
        facts: {
          package_manager: "pnpm",
          package_dirs: ["server", "client"],
          top_folders: [{ path: "server/src", files: 1204 }],
          compose_services: ["postgres"],
          extensions: [{ extension: ".ts", files: 3100 }],
        },
      },
      {
        kind: "critical_paths",
        title: "Critical paths",
        empty_reason: null,
        items: [{ path: "src/config/loader.ts", imported_by: 3, reason: "Shared config loader" }],
      },
      {
        kind: "how_to_run",
        title: "How to run locally",
        empty_reason: null,
        steps: [
          { command: "pnpm install", note: null },
          { command: "cp .env.example .env", note: "set OPENAI_API_KEY" },
        ],
      },
      {
        kind: "guided_reading",
        title: "Guided reading path",
        empty_reason: null,
        items: [{ path: "src/server.ts", why: "Start here" }],
      },
      {
        kind: "first_tasks",
        title: "First tasks",
        empty_reason: null,
        items: [{ title: "Add a health route", scope: "src/routes", complexity: "Low" }],
      },
    ],
    ...over,
  };
}
