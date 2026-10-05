#!/usr/bin/env node
/**
 * One-call verification for agents: typecheck + tests (+ arch:check) for one package,
 * with colour off and output cut to what a reader needs — one line per step on success,
 * the tail of the output on failure.
 *
 *   node scripts/verify.mjs <server|client|reviewer-core|mcp|specs> [files...] [--it] [--no-arch]
 *
 * files   paths relative to the package (or repo root). Test files run as-is; source
 *         files run the tests that import them (`vitest related`). No files = full unit suite.
 * --it    server only: run the DB-backed `*.it.test.ts` lane instead (needs Docker).
 * --no-arch  skip arch:check.
 * specs   pseudo-package (no package.json): runs the spec marker guard + its tests from the
 *         repo root; files and flags are ignored.
 *
 * Exit code 0 only if every step passed.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PKGS = {
  server: { pm: "pnpm", arch: true },
  client: { pm: "pnpm", arch: false },
  "reviewer-core": { pm: "npm", arch: false },
  mcp: { pm: "pnpm", arch: true },
};

const args = process.argv.slice(2);
const pkg = args.shift();
const SPECS = "specs";
if (!PKGS[pkg] && pkg !== SPECS) {
  console.error(`usage: node scripts/verify.mjs <${[...Object.keys(PKGS), SPECS].join("|")}> [files...] [--it] [--no-arch]`);
  process.exit(2);
}
const flags = new Set(args.filter((a) => a.startsWith("--")));
const cwd = pkg === SPECS ? ROOT : join(ROOT, pkg);
// Accept repo-root paths (`server/src/x.ts`) as well as package-relative ones.
const files = args
  .filter((a) => a && !a.startsWith("--"))
  .map((f) => relative(cwd, resolve(existsSync(resolve(ROOT, f)) ? ROOT : cwd, f)).replaceAll("\\", "/"));

const { pm, arch } = PKGS[pkg] ?? { pm: "npm", arch: false };
const exec = pm === "npm" ? "npx" : "pnpm exec";
const run = (script) => (pm === "npm" ? `npm run ${script}` : `pnpm ${script}`);
const q = (s) => `"${s}"`;

const isTest = (f) => /\.test\.tsx?$/.test(f);
const testFiles = files.filter(isTest);
const sourceFiles = files.filter((f) => !isTest(f));
const unitOnly = pkg === "server" && !flags.has("--it") ? ` --exclude ${q("**/*.it.test.ts")}` : "";

const steps = pkg === SPECS ? [] : [["typecheck", run("typecheck")]];
if (pkg === SPECS) {
  steps.push(["check-specs", "node scripts/check-specs.mjs"]);
  steps.push(["check-specs tests", "node --test scripts/check-specs.test.mjs"]);
} else if (flags.has("--it")) {
  steps.push(["integration", `${exec} vitest run .it.test`]);
} else {
  if (testFiles.length) steps.push(["tests", `${exec} vitest run ${testFiles.map(q).join(" ")}`]);
  if (sourceFiles.length)
    steps.push(["related tests", `${exec} vitest related ${sourceFiles.map(q).join(" ")} --run --passWithNoTests${unitOnly}`]);
  if (!files.length) steps.push(["unit tests", `${exec} vitest run${unitOnly}`]);
}
if (pkg !== SPECS && arch && !flags.has("--no-arch")) steps.push(["arch:check", run("arch:check")]);

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const summary = (out) =>
  out
    .split("\n")
    .filter((l) => /^\s*(Test Files|Tests)\s/.test(l))
    .map((l) => l.trim().replace(/\s+/g, " "))
    .join(" · ");

let failed = 0;
for (const [label, cmd] of steps) {
  const t0 = Date.now();
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = strip(`${r.stdout ?? ""}${r.stderr ?? ""}`);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === 0) {
    const s = summary(out);
    console.log(`PASS ${label} (${secs}s)${s ? ` — ${s}` : ""}`);
  } else {
    failed++;
    console.log(`FAIL ${label} (${secs}s) — ${cmd}`);
    console.log(out.trimEnd().split("\n").slice(-40).join("\n"));
    console.log("---");
  }
}
process.exit(failed ? 1 : 0);
