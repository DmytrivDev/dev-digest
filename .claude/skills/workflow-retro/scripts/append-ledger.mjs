#!/usr/bin/env node
// Appends ONE retro entry to docs/retro/ledger.md — append-only, like the INSIGHTS script.
// Creates the ledger (with its header) if it does not exist; refuses any write that would
// change a byte of the existing content.
//
// Usage:
//   node .claude/skills/workflow-retro/scripts/append-ledger.mjs --entry <path-to-entry.md>
//     [--ledger docs/retro/ledger.md]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];

const ledger = args.ledger ?? 'docs/retro/ledger.md';
if (!args.entry || !existsSync(args.entry)) fail('pass --entry <file> with the entry markdown');

const entry = readFileSync(args.entry, 'utf8').trim();
if (!/^## \d{4}-\d{2}-\d{2} — /.test(entry)) fail('an entry must start with "## YYYY-MM-DD — <workflow>"');

const HEADER = `# Workflow retro ledger

Append-only log of \`/workflow-retro\` runs — one \`##\` entry per reviewed workflow, newest at
the bottom. Written ONLY through \`.claude/skills/workflow-retro/scripts/append-ledger.mjs\`;
never edit or reorder past entries. A later entry may supersede an earlier one by saying so.
`;

const before = existsSync(ledger) ? readFileSync(ledger, 'utf8') : HEADER;
const firstLine = entry.split('\n')[0];
if (before.includes(firstLine)) {
  console.log(`SKIPPED (duplicate) — the ledger already has "${firstLine}"`);
  process.exit(0);
}
const after = `${before.replace(/\s*$/, '')}\n\n${entry}\n`;
if (!after.startsWith(before.replace(/\s*$/, ''))) fail('refusing: the write would change existing content');

mkdirSync(dirname(ledger), { recursive: true });
writeFileSync(ledger, after);
console.log(`APPENDED to ${ledger}: ${firstLine}`);

function fail(msg) {
  console.error(`append-ledger: ${msg}`);
  process.exit(1);
}
