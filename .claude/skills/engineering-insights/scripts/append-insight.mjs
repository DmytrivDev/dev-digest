#!/usr/bin/env node
/**
 * Appends ONE insight to a package's INSIGHTS.md.
 *
 * Append-only by construction: it splices a single line into one section and
 * rewrites nothing else. Every pre-existing line is verified to still be present
 * after the write; if verification fails the original file is restored.
 *
 * Usage:
 *   node .claude/skills/engineering-insights/scripts/append-insight.mjs \
 *     --package server --section "Codebase Patterns" --text "..." [--date YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from "node:fs";

const PACKAGES = ["client", "server", "reviewer-core", "e2e", "mcp"];
const SECTIONS = [
  "What Works",
  "What Doesn't Work",
  "Codebase Patterns",
  "Tool & Library Notes",
  "Recurring Errors & Fixes",
  "Session Notes",
  "Open Questions",
];
// Two entries count as "the same insight" at >=0.8 content-token overlap. Below that,
// near-misses are usually genuinely different facts about the same file.
const DUPLICATE_THRESHOLD = 0.8;
// Overlap ratios are meaningless on very short entries ("did a thing" vs "did
// another thing" scores 1.0), so below this many tokens only an exact match counts.
const MIN_TOKENS_FOR_FUZZY = 5;

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) die(`expected a --flag, got "${argv[i]}"`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const pkg = args.package;
const section = args.section;
const text = (args.text ?? "").trim();
const date = args.date ?? new Date().toISOString().slice(0, 10);

if (!PACKAGES.includes(pkg)) die(`--package must be one of: ${PACKAGES.join(", ")}`);
if (!SECTIONS.includes(section)) die(`--section must be one of: ${SECTIONS.join(" | ")}`);
if (!text) die("--text is required and must be non-empty");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die("--date must be YYYY-MM-DD");

const file = `${pkg}/INSIGHTS.md`;
if (!existsSync(file)) die(`${file} does not exist — create it from an existing package's file first`);

const original = readFileSync(file, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
const lines = original.split(/\r?\n/);

/** Reduce an entry to comparable content tokens: drop the date, markdown, punctuation. */
function tokens(s) {
  return new Set(
    s
      .replace(/\*\*\d{4}-\d{2}-\d{2}\*\*/g, " ")
      .toLowerCase()
      .replace(/[^a-z0-9./:_-]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 2)
  );
}

function isDuplicate(candidate, existing) {
  const a = tokens(candidate);
  const b = tokens(existing);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  if (Math.min(a.size, b.size) < MIN_TOKENS_FOR_FUZZY) {
    return a.size === b.size && shared === a.size;
  }
  return shared / Math.min(a.size, b.size) >= DUPLICATE_THRESHOLD;
}

// Duplicate check spans the WHOLE file: the same fact filed under a different
// section is still a duplicate, and re-filing it would be a silent restatement.
const existingEntries = lines.filter((l) => l.trimStart().startsWith("- "));
const clash = existingEntries.find((l) => isDuplicate(text, l));
if (clash) {
  console.log(`SKIPPED (duplicate) — ${file} already carries this insight:`);
  console.log(`  ${clash.trim()}`);
  process.exit(0);
}

const headingIdx = lines.findIndex((l) => l.trim() === `## ${section}`);
if (headingIdx === -1) die(`${file} has no "## ${section}" heading`);
let endIdx = lines.findIndex((l, i) => i > headingIdx && l.startsWith("## "));
if (endIdx === -1) endIdx = lines.length;

const entry =
  section === "Session Notes" ? `- ${text}` : `- **${date}** — ${text}`;

let body = lines.slice(headingIdx + 1, endIdx);
while (body.length && body[body.length - 1].trim() === "") body.pop();

if (section === "Session Notes") {
  // Group under a dated ### subheading, creating it only if this date is new.
  const dateIdx = body.findIndex((l) => l.trim() === `### ${date}`);
  if (dateIdx === -1) {
    body = body.length ? [...body, "", `### ${date}`, entry] : ["", `### ${date}`, entry];
  } else {
    let sub = body.findIndex((l, i) => i > dateIdx && (l.startsWith("### ") || l.startsWith("## ")));
    if (sub === -1) sub = body.length;
    body.splice(sub, 0, entry);
  }
} else {
  body = body.length ? [...body, entry] : ["", entry];
}

const updated = [...lines.slice(0, headingIdx + 1), ...body, "", ...lines.slice(endIdx)];
const rendered = updated.join(eol);

// Verify BEFORE committing the write: every original line must survive, and the
// only growth may be the lines we meant to add.
const before = lines.filter((l) => l.trim() !== "");
const after = updated.filter((l) => l.trim() !== "");
const missing = (() => {
  const pool = [...after];
  for (const l of before) {
    const at = pool.indexOf(l);
    if (at === -1) return l;
    pool.splice(at, 1);
  }
  return null;
})();
if (missing !== null) die(`refusing to write — this edit would drop an existing line: ${missing.trim()}`);
if (after.length - before.length > 2) die(`refusing to write — unexpected growth of ${after.length - before.length} lines`);

const tmp = `${file}.tmp`;
try {
  writeFileSync(tmp, rendered, "utf8");
  renameSync(tmp, file);
} catch (err) {
  if (existsSync(tmp)) unlinkSync(tmp);
  die(`write failed, ${file} left untouched: ${err.message}`);
}

console.log(`APPENDED to ${file} under "${section}":`);
console.log(`  ${entry}`);
