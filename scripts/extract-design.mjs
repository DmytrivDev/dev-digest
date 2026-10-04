#!/usr/bin/env node
// Unpacks the standalone design mock into readable files so agents (spec-creator,
// planner, implementer) can grep and Read the design without running code.
//
//   node scripts/extract-design.mjs [mock.html] [outDir]
//
// Defaults: "DevDigest Design (standalone) (3).html" -> docs/design/extracted/.
// Re-run whenever the mock is replaced; the output is committed and regenerated
// wholesale (every file in outDir is owned by this script).
//
// Bundle layout (see client/INSIGHTS.md 2026-09-16 / 2026-09-22):
//   <script type="__bundler/manifest">  JSON { uuid: { mime, compressed, data } }
//   <script type="__bundler/template">  JSON string: the host HTML, whose inline
//                                       <script type="text/babel"> is the canvas —
//                                       the registry of sections and artboards.
// Each screen chunk's first line is `/* <name>.jsx — <description>`.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const input = resolve(process.argv[2] ?? "DevDigest Design (standalone) (3).html");
const outDir = resolve(process.argv[3] ?? "docs/design/extracted");

const html = readFileSync(input, "utf8");

function bundlerBlock(type) {
  const match = html.match(new RegExp(`<script type="__bundler/${type}"[^>]*>([\\s\\S]*?)</script>`));
  if (!match) throw new Error(`no __bundler/${type} block in ${input}`);
  return match[1];
}

function decode(entry) {
  const buf = Buffer.from(entry.data, "base64");
  return (entry.compressed ? gunzipSync(buf) : buf).toString("utf8");
}

// Chunks that are runtime, not design: React, ReactDOM, Babel, and the canvas /
// tweaks-panel tooling that only frames the artboards.
function skipReason(source) {
  if (source.includes("@license React")) return "React runtime";
  if (source.startsWith("!function(e,t)") && source.includes(".Babel=")) return "Babel standalone";
  if (source.includes("/* BEGIN USAGE */")) {
    const name = source.match(/^\/\/\s*([\w.-]+\.jsx)/m)?.[1] ?? "canvas tooling";
    return `canvas tooling (${name})`;
  }
  return null;
}

const manifest = JSON.parse(bundlerBlock("manifest"));
const screens = [];
const skipped = [];

for (const [id, entry] of Object.entries(manifest)) {
  if (entry.mime.startsWith("font/")) {
    skipped.push({ id, reason: entry.mime });
    continue;
  }
  const source = decode(entry);
  const reason = skipReason(source);
  if (reason) {
    skipped.push({ id, reason });
    continue;
  }
  const header = source.match(/^\/\*\s*([\w.-]+\.jsx)\s*[—–-]\s*(.*?)\s*(?:\*\/)?\s*$/m);
  if (!header) {
    skipped.push({ id, reason: "no `/* name.jsx — …` header" });
    continue;
  }
  screens.push({ file: header[1], description: header[2], source });
}

const template = JSON.parse(bundlerBlock("template"));
const canvas = template.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)?.[1];
if (!canvas) throw new Error("no inline text/babel canvas script in the template");

const styles = [...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1].replace(/@font-face\s*\{[^}]*\}/g, "").replace(/\/\*[^*]*?(latin|cyrillic|greek|vietnamese)[^*]*?\*\//g, ""))
  .map((css) => css.replace(/\n{3,}/g, "\n\n").trim())
  .filter(Boolean)
  .join("\n\n");

// Artboard registry: walk the canvas in document order.
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
const sections = [];
const tokenRe = /<DCSection\b[^>]*>|<DCArtboard\b[^>]*>\s*<([\w.]+)([^>]*?)\/?>|<DCPostIt\b[^>]*>([\s\S]*?)<\/DCPostIt>/g;
for (const m of canvas.matchAll(tokenRe)) {
  const tag = m[0];
  if (tag.startsWith("<DCSection")) {
    sections.push({ id: attr(tag, "id"), title: attr(tag, "title"), subtitle: attr(tag, "subtitle"), artboards: [], notes: [] });
  } else if (tag.startsWith("<DCArtboard")) {
    const props = m[2].replace(/\s+/g, " ").trim();
    sections.at(-1)?.artboards.push({ id: attr(tag, "id"), label: attr(tag, "label"), render: `<${m[1]}${props ? " " + props : ""} />` });
  } else {
    sections.at(-1)?.notes.push(m[3].replace(/\s+/g, " ").trim());
  }
}

// Which extracted file defines each window.* component the artboards render.
const definedIn = new Map();
for (const s of screens) {
  for (const d of s.source.matchAll(/window\.(\w+)\s*=|Object\.assign\(window,\s*\{([^}]*)\}/g)) {
    const names = d[1] ? [d[1]] : d[2].split(",").map((n) => n.split(":")[0].trim());
    for (const n of names) if (n && !definedIn.has(n)) definedIn.set(n, s.file);
  }
}

if (existsSync(outDir)) for (const f of readdirSync(outDir)) rmSync(join(outDir, f), { recursive: true });
mkdirSync(outDir, { recursive: true });

screens.sort((a, b) => a.file.localeCompare(b.file));
for (const s of screens) writeFileSync(join(outDir, s.file), s.source);
writeFileSync(join(outDir, "canvas.jsx"), canvas.trim() + "\n");
writeFileSync(join(outDir, "styles.css"), styles + "\n");

const esc = (s) => s.replace(/\|/g, "\\|");
const lines = [
  "# Design mock — extracted",
  "",
  `Generated by \`scripts/extract-design.mjs\` from \`${input.split(/[\\/]/).pop()}\`. **Do not edit** —`,
  "re-run the script when the mock changes. Every file in this folder is regenerated wholesale.",
  "",
  "Mock data is illustrative: field names in `data*.jsx` show what a screen expects, not the",
  "real contract (`server/src/vendor/shared/`). The shipped UI deliberately departs from the mock",
  "in places — check the relevant spec before treating a mock element as a missing feature.",
  "",
  "## Artboards",
  "",
];
for (const s of sections) {
  lines.push(`### ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ""}`, "");
  lines.push("| Artboard | Renders | Defined in |", "|---|---|---|");
  for (const a of s.artboards) {
    const component = a.render.match(/^<(?:window\.)?(\w+)/)?.[1] ?? "";
    lines.push(`| ${esc(a.label)} (\`${a.id}\`) | \`${esc(a.render)}\` | ${definedIn.has(component) ? `\`${definedIn.get(component)}\`` : "`canvas.jsx`"} |`);
  }
  for (const n of s.notes) lines.push("", `> Designer note: ${n}`);
  lines.push("");
}
lines.push("## Files", "", "| File | What it is |", "|---|---|");
for (const s of screens) lines.push(`| \`${s.file}\` | ${esc(s.description)} |`);
lines.push("| `canvas.jsx` | The canvas itself: sections, artboards and the props each screen variant is rendered with |");
lines.push("| `styles.css` | Design tokens and global styles from the mock's host page (fonts stripped) |");
lines.push("", `Skipped ${skipped.length} runtime chunks: ${[...new Set(skipped.map((s) => s.reason))].join(", ")}.`, "");
writeFileSync(join(outDir, "INDEX.md"), lines.join("\n"));

console.log(`extracted ${screens.length} design files + canvas.jsx + styles.css -> ${outDir}`);
console.log(`artboards: ${sections.reduce((n, s) => n + s.artboards.length, 0)} in ${sections.length} sections; skipped ${skipped.length} chunks`);
