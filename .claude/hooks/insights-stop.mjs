#!/usr/bin/env node
/**
 * Stop hook: forces the wrap-up half of the engineering-insights loop.
 *
 * Blocks the stop ONCE per session so the model must run the capture check
 * before finishing. Three guards keep that from becoming a nuisance:
 *   1. stop_hook_active — the stop we ourselves blocked; never block twice in a row.
 *   2. per-session marker — at most one block per session_id.
 *   3. clean worktree — a session that changed nothing has nothing to capture.
 */
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const allow = () => process.exit(0);

let input = "";
try {
  input = readFileSync(0, "utf8");
} catch {
  /* no stdin — treat as empty payload */
}

let payload = {};
try {
  payload = JSON.parse(input || "{}");
} catch {
  allow();
}

// Guard 1: this stop is the one we already blocked.
if (payload.stop_hook_active) allow();

// Guard 3: nothing changed in the worktree → nothing worth capturing.
let dirty = "";
try {
  dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
} catch {
  allow(); // not a git repo, or git unavailable — never block on infrastructure failure
}
if (!dirty) allow();

// Guard 2: one block per session.
const markerDir = join(tmpdir(), "claude-engineering-insights");
const marker = join(markerDir, `${payload.session_id ?? "unknown"}.done`);
if (existsSync(marker)) allow();
try {
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(marker, new Date().toISOString());
} catch {
  allow(); // cannot record the marker → would block every turn; don't
}

process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason:
      "Before finishing: run the engineering-insights capture. Read the touched package's " +
      "INSIGHTS.md, then append any substantial, non-duplicate, file-grounded insight with " +
      ".claude/skills/engineering-insights/scripts/append-insight.mjs. If nothing this session " +
      "clears that bar, say so in one line and stop — writing nothing is a valid outcome, " +
      "skipping the check is not.",
  })
);
