#!/usr/bin/env node
/**
 * Generates `<package>/INSIGHTS.index.md` from `<package>/INSIGHTS.md`.
 *
 * Why this exists: the insight files have grown past the point where reading one
 * whole is free. `server/INSIGHTS.md` is ~50KB (~13k tokens) and grows every
 * session, and EVERY agent that touches the server pays that before it does any
 * useful work — in one feature it was paid three times over (dispatcher, planner,
 * implementer) for the same text.
 *
 * The index is a derived artifact: one line per entry, carrying the section, the
 * date and the SOURCE LINE NUMBER, so a reader can pull just the entries it needs
 * with `sed -n '<line>p' <package>/INSIGHTS.md` instead of loading the file.
 *
 * READ-ONLY with respect to INSIGHTS.md. This script never opens it for writing.
 * The append-only rule still holds: new entries go in through
 * `append-insight.mjs`, never by hand, and this index is regenerated afterwards.
 * If the index and the source ever disagree, the source wins — delete the index
 * and rebuild it.
 *
 * Usage:
 *   node .claude/skills/engineering-insights/scripts/build-index.mjs            # all packages
 *   node .claude/skills/engineering-insights/scripts/build-index.mjs --package server
 *   node .claude/skills/engineering-insights/scripts/build-index.mjs --check    # exit 1 if stale
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";

const PACKAGES = ["client", "server", "reviewer-core", "e2e", "mcp"];
/** Characters of each entry kept as the hook. Long enough to decide "is this mine?". */
const HOOK_CHARS = 150;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/**
 * One entry = one top-level `- ` bullet under a `## ` heading, possibly wrapped
 * over several lines. `line` is the 1-based line the bullet STARTS on, which is
 * what a reader needs for `sed`.
 */
function parseEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let section = null;
  let current = null;

  const flush = () => {
    if (current) entries.push(current);
    current = null;
  };

  lines.forEach((raw, i) => {
    const heading = raw.match(/^##\s+(.*)$/);
    if (heading) {
      flush();
      section = heading[1].trim();
      return;
    }
    // A new top-level bullet ends the previous entry.
    if (/^-\s+/.test(raw)) {
      flush();
      if (!section) return;
      const body = raw.replace(/^-\s+/, "");
      const dated = body.match(/^\*\*(\d{4}-\d{2}-\d{2})\*\*\s*[—-]\s*(.*)$/);
      current = {
        section,
        line: i + 1,
        endLine: i + 1,
        date: dated ? dated[1] : null,
        text: dated ? dated[2] : body,
      };
      return;
    }
    // Continuation of the current entry (wrapped line, indented or not).
    if (current && raw.trim() !== "") {
      current.text += " " + raw.trim();
      current.endLine = i + 1;
    }
  });
  flush();
  return entries;
}

/** Strip markdown noise so the hook reads as prose, then clip it on a word boundary. */
function hook(text) {
  const flat = text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= HOOK_CHARS) return flat;
  const cut = flat.slice(0, HOOK_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > HOOK_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

function render(pkg, sourceFile, entries, bytes) {
  const bySection = new Map();
  for (const e of entries) {
    if (!bySection.has(e.section)) bySection.set(e.section, []);
    bySection.get(e.section).push(e);
  }

  const out = [];
  out.push(`# Insights index — ${pkg}`);
  out.push("");
  out.push(
    "GENERATED FILE — do not edit by hand, and do not add an insight here. Rebuild with",
  );
  out.push("`node .claude/skills/engineering-insights/scripts/build-index.mjs` after every append.");
  out.push("");
  out.push(
    `Source: \`${sourceFile}\` — ${entries.length} entries, ${bytes.toLocaleString("en-US")} bytes.`,
  );
  out.push("");
  out.push(
    "This index exists so you do not have to load the whole file to find out whether it",
  );
  out.push(
    "has anything to say about your task. Scan it, then read only the entries you need:",
  );
  out.push("");
  out.push("```bash");
  out.push(`sed -n '120,124p' ${sourceFile}`);
  out.push("```");
  out.push("");
  out.push(
    "It is a finding aid, NOT a substitute for the entry — an insight's value is in its",
  );
  out.push(
    "detail, and the hook below is deliberately too short to act on. When the session",
  );
  out.push("protocol says to read this package's insights, the source file is what it means.");
  out.push("");

  for (const [section, list] of bySection) {
    if (list.length === 0) continue;
    out.push(`## ${section}`);
    out.push("");
    for (const e of list) {
      const span = e.endLine > e.line ? `${e.line}-${e.endLine}` : `${e.line}`;
      const date = e.date ?? "—".padEnd(10);
      out.push(`- \`L${span}\` · ${date} · ${hook(e.text)}`);
    }
    out.push("");
  }

  return out.join("\n");
}

const args = parseArgs(process.argv.slice(2));
const targets = args.package ? [args.package] : PACKAGES;
const check = Boolean(args.check);
let stale = 0;
let built = 0;

for (const pkg of targets) {
  if (!PACKAGES.includes(pkg)) {
    console.error(`ERROR: --package must be one of: ${PACKAGES.join(", ")}`);
    process.exit(1);
  }
  const sourceFile = `${pkg}/INSIGHTS.md`;
  const indexFile = `${pkg}/INSIGHTS.index.md`;
  if (!existsSync(sourceFile)) {
    console.log(`skip  ${sourceFile} (does not exist)`);
    continue;
  }
  const text = readFileSync(sourceFile, "utf8");
  const bytes = statSync(sourceFile).size;
  const entries = parseEntries(text);
  const rendered = render(pkg, sourceFile, entries, bytes);

  const existing = existsSync(indexFile) ? readFileSync(indexFile, "utf8") : null;
  if (existing === rendered) {
    console.log(`ok    ${indexFile} (${entries.length} entries, current)`);
    continue;
  }
  if (check) {
    console.error(`STALE ${indexFile} — rebuild it`);
    stale++;
    continue;
  }
  writeFileSync(indexFile, rendered, "utf8");
  built++;
  console.log(
    `built ${indexFile} — ${entries.length} entries from ${bytes.toLocaleString("en-US")} bytes`,
  );
}

if (check && stale > 0) {
  console.error(`\n${stale} index file(s) stale.`);
  process.exit(1);
}
if (!check) console.log(`\ndone: ${built} rebuilt, ${targets.length - built} unchanged/skipped`);
