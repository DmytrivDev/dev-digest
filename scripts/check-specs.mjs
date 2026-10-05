#!/usr/bin/env node
/**
 * Spec guard: no unresolved `[NEEDS CLARIFICATION: OQ-<n> — <question>]` marker may sit in
 * an approved or implemented spec, a spec carries at most 3 markers, and every marker is
 * mirrored under `## Open questions`.
 *
 *   node scripts/check-specs.mjs [--dir <path>]
 *
 * Scans only top-level `SPEC-*.md` files of the dir (default: <repo root>/specs). Fenced
 * code blocks (``` and ~~~) are skipped; inline code is not. Zero dependencies, read-only.
 *
 * Exit: 0 clean · 1 at least one violation · 2 usage or IO error.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_MARKERS = 3;
const STATUSES = new Set(["draft", "approved", "implemented"]);
const MARKER_PREFIX = "[NEEDS CLARIFICATION";
// Grammar: [NEEDS CLARIFICATION: OQ-<n> <sep> <question>] with sep one of — - :
const MARKER_ID = /^\[NEEDS CLARIFICATION: OQ-(\d+)\s*[—:-]/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const SPEC_FILE = /^SPEC-\d+.*\.md$/;

/** Split text into lines, each flagged `fenced` when it sits inside (or delimits) a code fence. */
function scanLines(text) {
  const out = [];
  let fence = null; // { ch, len }
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.ch === "`" ? "`" : "~"}{${fence.len},}\\s*$`);
      out.push({ raw, line, fenced: true });
      if (close.test(raw)) fence = null;
      return;
    }
    const m = FENCE_OPEN.exec(raw);
    if (m) {
      fence = { ch: m[1][0], len: m[1].length };
      out.push({ raw, line, fenced: true });
      return;
    }
    out.push({ raw, line, fenced: false });
  });
  return out;
}

/** Pure check of one spec's text. */
export function checkSpec(text, displayPath) {
  const lines = scanLines(text).filter((l) => !l.fenced);
  const violations = [];
  const add = (line, message) => violations.push({ file: displayPath, line, message });

  let status = null;
  let statusLine = 1;
  for (const l of lines) {
    const m = /^Status:\s*(\S+)/.exec(l.raw);
    if (m) {
      status = m[1];
      statusLine = l.line;
      break;
    }
  }
  if (status === null || !STATUSES.has(status)) {
    add(status === null ? 1 : statusLine, `missing or unknown Status (${status ?? "none"})`);
  }

  const markers = [];
  for (const l of lines) {
    let from = 0;
    for (;;) {
      const at = l.raw.indexOf(MARKER_PREFIX, from);
      if (at === -1) break;
      const id = MARKER_ID.exec(l.raw.slice(at));
      markers.push({ line: l.line, id: id ? `OQ-${id[1]}` : null });
      if (!id) add(l.line, "marker without an OQ id");
      from = at + MARKER_PREFIX.length;
    }
  }

  // Rule 1: approved / implemented may not hold a marker.
  if (status === "approved" || status === "implemented") {
    for (const mk of markers) {
      add(mk.line, `marker in a spec with Status: ${status} — resolve it or set Status: draft`);
    }
  }

  // Rule 2: cap, reported once at the first marker past the limit.
  if (markers.length > MAX_MARKERS) {
    add(markers[MAX_MARKERS].line, `${markers.length} markers (max ${MAX_MARKERS})`);
  }

  // Rule 3: every marker id is mirrored (whole word) under `## Open questions`.
  let section = "";
  let inSection = false;
  for (const l of lines) {
    if (/^## /.test(l.raw)) inSection = /^##\s+Open questions\b/i.test(l.raw);
    else if (inSection) section += `${l.raw}\n`;
  }
  const seen = new Set();
  for (const mk of markers) {
    if (!mk.id || seen.has(mk.id)) continue;
    seen.add(mk.id);
    if (!new RegExp(`\\b${mk.id}\\b`).test(section)) {
      add(mk.line, `${mk.id} is not mirrored under Open questions`);
    }
  }

  violations.sort((a, b) => a.line - b.line);
  return { status, markers, violations };
}

/** Check every top-level SPEC-*.md in `dir`. Paths are reported relative to cwd. */
export function checkDir(dir) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && SPEC_FILE.test(e.name))
    .map((e) => e.name)
    .sort();
  const violations = [];
  let markers = 0;
  for (const name of files) {
    const abs = join(dir, name);
    const shown = relative(process.cwd(), abs).replaceAll("\\", "/");
    const res = checkSpec(readFileSync(abs, "utf8"), shown);
    markers += res.markers.length;
    violations.push(...res.violations);
  }
  return { specs: files.length, markers, violations };
}

function main(argv) {
  let dir = resolve(import.meta.dirname, "..", "specs");
  if (argv.length === 0) {
    // default dir
  } else if (argv.length === 2 && argv[0] === "--dir") {
    dir = resolve(argv[1]);
  } else {
    console.error("usage: node scripts/check-specs.mjs [--dir <path>]");
    return 2;
  }
  try {
    if (!statSync(dir).isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(`check-specs: cannot read directory ${dir}`);
    return 2;
  }
  let res;
  try {
    res = checkDir(dir);
  } catch (err) {
    console.error(`check-specs: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  for (const v of res.violations) console.log(`${v.file}:${v.line}: ${v.message}`);
  console.log(
    `check-specs: ${res.specs} spec(s), ${res.markers} marker(s), ${res.violations.length} violation(s)`,
  );
  return res.violations.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
