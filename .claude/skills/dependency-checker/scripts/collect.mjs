#!/usr/bin/env node
/**
 * dependency-checker collector — deterministic facts about the repo's dependencies.
 * Zero npm dependencies (Node >= 22). Read-only: never installs, never edits the repo.
 *
 *   node .claude/skills/dependency-checker/scripts/collect.mjs [options]
 *
 *   --out <dir>     where deps-report.{json,md} go (default: <os tmp>/devdigest-deps)
 *   --pkg <name>    limit to a package dir name or npm name; repeatable (default: all)
 *   --online        also run `outdated` + `audit` per package (hits the registry; opt-in)
 *   --top <n>       rows in "heaviest dependencies" tables (default 15)
 *
 * What it measures, per package:
 *   - declared deps (prod / dev / peer / optional) and the installed version
 *   - disk size of each dep and of its whole transitive closure (node_modules, real paths,
 *     de-duplicated, so pnpm symlinks are not double counted)
 *   - EXCLUSIVE size = bytes that disappear if only this dep is removed
 *   - where each dep is imported from (src / test / tooling) -> unused / undeclared / misplaced
 *   - the internal component graph (module level) with import counts, hubs and cycles
 *   - cross-package edges resolved through tsconfig `paths` aliases
 * Everything is a heuristic over source text, not a type-checker: the report says so.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".next", "out", "coverage", ".turbo", "clones",
  "test-results", "playwright-report", ".git", ".claude", ".devdigest", ".pnpm-store",
]);
const SRC_EXT = /\.(?:[cm]?[jt]sx?)$/;
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
/** Directories whose children are components of their own (grouped one level deeper). */
const CONTAINERS = new Set(["modules", "app"]);
const MB = 1024 * 1024;

// ───────────────────────────── args ─────────────────────────────
const argv = process.argv.slice(2);
const opt = { out: join(tmpdir(), "devdigest-deps"), pkg: [], online: false, top: 15 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--out") opt.out = resolve(argv[++i]);
  else if (a === "--pkg") opt.pkg.push(argv[++i]);
  else if (a === "--online") opt.online = true;
  else if (a === "--top") opt.top = Number(argv[++i]) || 15;
  else { console.error(`unknown argument: ${a}`); process.exit(2); }
}

// ───────────────────────────── helpers ─────────────────────────────
const posix = (p) => p.split(sep).join("/");
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const fmt = (b) => (b == null ? "n/a" : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const bar = (ratio, w = 16) => "█".repeat(Math.round(Math.min(1, Math.max(0, ratio)) * w)).padEnd(w, "░");
const esc = (s) => String(s).replaceAll("|", "\\|");
const mm = (s) => String(s).replaceAll('"', "'"); // mermaid label safe

/**
 * String-aware scanner shared by tsconfig parsing and import extraction.
 * Drops line and block comments; with blankTemplates also empties `template literals`
 * (fixtures inside tests are not real imports). Normal '…' and "…" strings are kept verbatim.
 */
function stripCode(src, { blankTemplates = false } = {}) {
  let out = ""; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let j = i + 1;
      while (j < n && src[j] !== q) { if (src[j] === "\\") j++; if (q !== "`" && src[j] === "\n") break; j++; }
      if (q === "`" && blankTemplates) out += "``"; else out += src.slice(i, j + 1);
      i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}
const stripJsonc = (s) => stripCode(s).replace(/,\s*([}\]])/g, "$1");
function readJsonc(p) { try { return JSON.parse(stripJsonc(readFileSync(p, "utf8"))); } catch { return null; } }

function* walk(dir, depth = 0, maxDepth = 12) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || depth >= maxDepth) continue;
      yield* walk(join(dir, e.name), depth + 1, maxDepth);
    } else if (e.isFile()) yield join(dir, e.name);
  }
}

// ───────────────────────────── discover packages ─────────────────────────────
function discoverPackages() {
  const found = [];
  const scan = (dir, depth) => {
    if (existsSync(join(dir, "package.json"))) found.push(dir);
    if (depth >= 2) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      scan(join(dir, e.name), depth + 1);
    }
  };
  scan(ROOT, 0);
  return found.map((dir) => {
    const manifest = readJson(join(dir, "package.json")) ?? {};
    const pm = existsSync(join(dir, "pnpm-lock.yaml")) ? "pnpm"
      : existsSync(join(dir, "package-lock.json")) ? "npm"
      : existsSync(join(dir, "yarn.lock")) ? "yarn" : "unknown";
    return {
      dir, rel: posix(relative(ROOT, dir)) || ".", name: manifest.name ?? basename(dir), manifest, pm,
      installed: existsSync(join(dir, "node_modules")),
    };
  });
}

// ───────────────────────────── sizes & closure ─────────────────────────────
const ownSizeCache = new Map(); // realDir -> bytes (own files, nested node_modules excluded)
function ownSize(realDir) {
  if (ownSizeCache.has(realDir)) return ownSizeCache.get(realDir);
  let total = 0;
  const stack = [realDir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") stack.push(p); }
      else if (e.isFile()) { try { total += statSync(p).size; } catch { /* broken link */ } }
    }
  }
  ownSizeCache.set(realDir, total);
  return total;
}

/** Node-style resolution of `name` starting at a REAL package dir (works with the pnpm store). */
function resolveInstalled(fromRealDir, name) {
  let dir = fromRealDir;
  for (;;) {
    const cand = basename(dir) === "node_modules" ? join(dir, name) : join(dir, "node_modules", name);
    if (existsSync(join(cand, "package.json"))) { try { return realpathSync(cand); } catch { /* next */ } }
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const nodeInfo = new Map(); // realDir -> {name, version, deps[]}
function infoOf(realDir) {
  if (nodeInfo.has(realDir)) return nodeInfo.get(realDir);
  const m = readJson(join(realDir, "package.json")) ?? {};
  const info = {
    name: m.name ?? basename(realDir), version: m.version ?? "?",
    deps: Object.keys({ ...m.dependencies, ...m.optionalDependencies }),
    peers: Object.keys(m.peerDependencies ?? {}),
    bins: typeof m.bin === "string" ? [m.name] : Object.keys(m.bin ?? {}),
  };
  nodeInfo.set(realDir, info);
  return info;
}

/** Transitive closure (set of real dirs, root included) of one installed dependency. */
function closureOf(rootReal) {
  const seen = new Set();
  const stack = [rootReal];
  while (stack.length) {
    const d = stack.pop();
    if (seen.has(d)) continue;
    seen.add(d);
    for (const dep of infoOf(d).deps) {
      const r = resolveInstalled(d, dep);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}
const sumBytes = (set) => { let t = 0; for (const d of set) t += ownSize(d); return t; };

// ───────────────────────────── source scan ─────────────────────────────
const IMPORT_RE = /(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"\n]+)['"]|\bimport\s*['"]([^'"\n]+)['"]|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)|\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g;

const STRING_RE = /["']((?:@[\w.-]+\/)?[\w.-]+)["']/g;
const SPEC_OK =/^[@\w.~$][\w@./~$:+-]*$/;
function specifiersOf(clean) {
  const out = [];
  for (const m of clean.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (SPEC_OK.test(spec)) out.push(spec);
  }
  return out;
}
const pkgNameOf = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

function classifyFile(pkg, abs) {
  const rel = posix(relative(pkg.dir, abs));
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel) || /(^|\/)(?:test|tests|__tests__|e2e|fixtures)\//.test(rel)) return "test";
  if (!rel.includes("/") || /^(?:scripts|drizzle|\.storybook)\//.test(rel) || /\.config\.[cm]?[jt]s$/.test(rel)) return "tooling";
  return "src";
}

function loadAliases(pkg) {
  const ts = readJsonc(join(pkg.dir, "tsconfig.json"));
  const co = ts?.compilerOptions ?? {};
  const base = resolve(pkg.dir, co.baseUrl ?? ".");
  return Object.entries(co.paths ?? {}).map(([pattern, targets]) => ({
    prefix: pattern.replace(/\*$/, ""), wildcard: pattern.endsWith("*"),
    target: (targets[0] ?? "").replace(/\*$/, ""), base,
  }));
}

function groupOf(pkg, abs) {
  const rel = posix(relative(pkg.dir, abs)).replace(/^src\//, "");
  const segs = rel.split("/");
  if (segs.length <= 1) return "(src root)";
  const head = segs[0];
  if (CONTAINERS.has(head)) return segs.length > 2 ? `${head}/${segs[1]}` : `${head}/(root)`;
  return head;
}

function analyseSources(pkg, allPkgs) {
  const aliases = loadAliases(pkg);
  const ext = new Map(); // dep -> {src:Set,test:Set,tooling:Set}
  const groups = new Map(); // group -> {files, loc}
  const edges = new Map(); // "a>b" -> count
  const cross = new Map(); // other pkg name -> count
  const strings = new Set(); // string literals shaped like package names (e.g. a pino transport target)
  let usesBuiltins = false;
  let files = 0;

  const ownerPkg = (abs) => allPkgs
    .filter((p) => abs === p.dir || abs.startsWith(p.dir + sep))
    .sort((a, b) => b.dir.length - a.dir.length)[0];

  for (const file of walk(pkg.dir)) {
    if (!SRC_EXT.test(file)) continue;
    // Skip nested packages (their own scan handles them).
    const owner = ownerPkg(file);
    if (owner && owner.dir !== pkg.dir) continue;
    let raw; try { raw = readFileSync(file, "utf8"); } catch { continue; }
    const text = stripCode(raw, { blankTemplates: true });
    files++;
    const kind = classifyFile(pkg, file);
    const relFile = posix(relative(pkg.dir, file));
    const from = groupOf(pkg, file);
    if (kind === "src") {
      const g = groups.get(from) ?? { files: 0, loc: 0 };
      g.files++; g.loc += raw.split("\n").length; groups.set(from, g);
    }
    for (const m of text.matchAll(STRING_RE)) strings.add(m[1]);
    for (const spec of specifiersOf(text)) {
      let abs = null;
      if (spec.startsWith(".")) abs = resolve(dirname(file), spec);
      else {
        const al = aliases.find((a) => (a.wildcard ? spec.startsWith(a.prefix) : spec === a.prefix));
        if (al) abs = resolve(al.base, al.target + (al.wildcard ? spec.slice(al.prefix.length) : ""));
        // `"zod": ["./node_modules/zod"]` pins a package to one copy — still an npm import.
        if (abs && posix(relative(pkg.dir, abs)).startsWith("node_modules")) abs = null;
      }
      if (abs) {
        const target = ownerPkg(abs);
        if (target && target.dir !== pkg.dir) {
          cross.set(target.name, (cross.get(target.name) ?? 0) + 1);
        } else if (kind === "src" && !posix(relative(pkg.dir, abs)).startsWith("..")) {
          const to = groupOf(pkg, abs);
          if (to !== from) edges.set(`${from}>${to}`, (edges.get(`${from}>${to}`) ?? 0) + 1);
        }
        continue;
      }
      if (BUILTINS.has(spec) || spec.startsWith("node:")) { usesBuiltins = true; continue; }
      const name = pkgNameOf(spec);
      const u = ext.get(name) ?? { src: new Set(), test: new Set(), tooling: new Set() };
      u[kind].add(relFile); ext.set(name, u);
    }
  }
  return { files, ext, groups, edges, cross, strings, usesBuiltins };
}

function stronglyConnected(nodes, edgeKeys) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const k of edgeKeys) { const [a, b] = k.split(">"); adj.get(a)?.push(b); }
  let idx = 0; const stack = []; const on = new Set(); const index = new Map(); const low = new Map(); const out = [];
  const visit = (v) => {
    index.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = []; let w;
      do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const n of nodes) if (!index.has(n)) visit(n);
  return out;
}

// ───────────────────────────── per-package analysis ─────────────────────────────
function textRefsFor(pkg) {
  // Cheap corpus for "is this dep referenced outside imports": package scripts, root configs, CI, repo scripts.
  const chunks = [JSON.stringify(pkg.manifest.scripts ?? {})];
  for (const f of readdirSync(pkg.dir)) {
    if (/\.(?:json|mjs|cjs|js|ts|ya?ml)$/.test(f) && f !== "package.json" && !/lock/.test(f)) {
      try { chunks.push(readFileSync(join(pkg.dir, f), "utf8")); } catch { /* skip */ }
    }
  }
  for (const extra of [join(ROOT, "scripts"), join(ROOT, ".github")]) {
    if (!existsSync(extra)) continue;
    for (const f of walk(extra, 0, 4)) {
      if (/\.(?:mjs|js|sh|ya?ml|json)$/.test(f)) { try { chunks.push(readFileSync(f, "utf8")); } catch { /* skip */ } }
    }
  }
  return chunks.join("\n");
}

const isTypesDep = (name) => name.startsWith("@types/");

function cssPackageRefs(pkg) {
  const out = new Set();
  for (const f of walk(pkg.dir)) {
    if (!f.endsWith(".css")) continue;
    let t; try { t = readFileSync(f, "utf8"); } catch { continue; }
    for (const m of t.matchAll(/["']((?:@[\w.-]+\/)?[\w.-]+)(?:\/[^"']*)?["']/g)) out.add(m[1]);
  }
  return out;
}

function analysePackage(pkg, allPkgs) {
  const m = pkg.manifest;
  const declared = [];
  for (const [field, kind] of [["dependencies", "prod"], ["devDependencies", "dev"], ["peerDependencies", "peer"], ["optionalDependencies", "optional"]]) {
    for (const [name, range] of Object.entries(m[field] ?? {})) declared.push({ name, range, kind });
  }
  const src = analyseSources(pkg, allPkgs);
  const corpus = textRefsFor(pkg);
  const cssRefs = cssPackageRefs(pkg);
  // a dep that another installed direct dep lists as a peer (postcss for tailwind, react for next, …)
  const peerOfUsed = new Set();
  for (const d of declared) {
    const nm = join(pkg.dir, "node_modules", ...d.name.split("/"));
    try { if (existsSync(join(nm, "package.json"))) for (const p of infoOf(realpathSync(nm)).peers) peerOfUsed.add(p); } catch { /* skip */ }
  }

  const deps = declared.map((d) => {
    const nm = join(pkg.dir, "node_modules", ...d.name.split("/"));
    let real = null;
    try { if (existsSync(join(nm, "package.json"))) real = realpathSync(nm); } catch { /* not installed */ }
    const info = real ? infoOf(real) : null;
    const closure = real ? closureOf(real) : null;
    const use = src.ext.get(d.name) ?? src.ext.get(d.name.replace(/^@types\//, "")) ?? { src: new Set(), test: new Set(), tooling: new Set() };
    const isTypes = d.name.startsWith("@types/");
    const typesTarget = isTypes ? d.name.slice(7).replace("__", "/") : null;
    const typesUsed = isTypes && (typesTarget === "node" ? src.usesBuiltins : (src.ext.has(typesTarget) || src.ext.has(`@${typesTarget}`)));
    const bins = info?.bins ?? [];
    const word = (w) => new RegExp(`(^|[^\\w@/-])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`).test(corpus);
    const referencedInTooling = word(d.name) || bins.some(word) || src.strings.has(d.name) || cssRefs.has(d.name) || peerOfUsed.has(d.name);
    return {
      ...d, installedVersion: info?.version ?? null, installed: !!real,
      ownBytes: real ? ownSize(real) : null,
      closureBytes: real ? sumBytes(closure) : null,
      closureCount: closure ? closure.size : null,
      _closure: closure,
      files: { src: use.src.size, test: use.test.size, tooling: use.tooling.size },
      referencedInTooling, typesUsed: !!typesUsed,
    };
  });

  // EXCLUSIVE size: bytes reachable ONLY through this dep (among this package's direct deps).
  const refCount = new Map();
  for (const d of deps) for (const n of d._closure ?? []) refCount.set(n, (refCount.get(n) ?? 0) + 1);
  for (const d of deps) {
    d.exclusiveBytes = d._closure ? [...d._closure].filter((n) => refCount.get(n) === 1).reduce((t, n) => t + ownSize(n), 0) : null;
  }
  const union = (kinds) => {
    const s = new Set();
    for (const d of deps) if (kinds.includes(d.kind) && d._closure) for (const n of d._closure) s.add(n);
    return s;
  };
  const prodSet = union(["prod", "optional"]);
  const allSet = union(["prod", "optional", "dev", "peer"]);

  // duplicate installed versions of one package inside this package's tree
  const byName = new Map();
  for (const n of allSet) { const i = infoOf(n); (byName.get(i.name) ?? byName.set(i.name, []).get(i.name)).push({ version: i.version, bytes: ownSize(n) }); }
  const duplicates = [...byName].filter(([, v]) => v.length > 1)
    .map(([name, v]) => ({ name, versions: v.map((x) => x.version).sort(), extraBytes: v.slice(1).reduce((t, x) => t + x.bytes, 0) }))
    .sort((a, b) => b.extraBytes - a.extraBytes);

  const declaredNames = new Set(declared.map((d) => d.name));
  const undeclared = [...src.ext].filter(([n]) => !declaredNames.has(n) && n !== m.name)
    .map(([name, u]) => ({ name, src: u.src.size, test: u.test.size, tooling: u.tooling.size, example: [...u.src, ...u.test, ...u.tooling][0] }));

  const findings = [];
  for (const d of deps) {
    const used = d.files.src + d.files.test + d.files.tooling > 0 || d.typesUsed;
    if (d.kind === "peer") continue;
    if (!used && !d.referencedInTooling) findings.push({ type: "unused", pkg: pkg.name, dep: d.name, detail: "declared, no import and no reference in scripts/configs" });
    else if (!used && d.referencedInTooling) findings.push({ type: "tooling-only", pkg: pkg.name, dep: d.name, detail: "referenced only by scripts/configs (CLI or plugin) — verify before touching", info: true });
    if (d.kind === "prod" && used && d.files.src === 0 && !d.referencedInTooling)
      findings.push({ type: "misplaced-prod", pkg: pkg.name, dep: d.name, detail: `imported only from test/tooling files (${d.files.test} test, ${d.files.tooling} tooling) — belongs in devDependencies` });
    if (d.kind === "dev" && d.files.src > 0 && !isTypesDep(d.name))
      findings.push({ type: "misplaced-dev", pkg: pkg.name, dep: d.name, detail: `imported from ${d.files.src} src file(s) but declared in devDependencies — breaks a production-only install` });
    if (d.installed === false && pkg.installed) findings.push({ type: "not-installed", pkg: pkg.name, dep: d.name, detail: "declared but missing from node_modules (install drift)" });
  }
  for (const u of undeclared) {
    findings.push({ type: "undeclared", pkg: pkg.name, dep: u.name, detail: `imported (${u.src} src, ${u.test} test, ${u.tooling} tooling file(s), e.g. ${u.example}) but not in package.json — works only by hoisting luck` });
  }

  // component graph
  const nodes = [...new Set([...src.groups.keys(), ...[...src.edges.keys()].flatMap((k) => k.split(">"))])].sort();
  const fanIn = new Map(); const fanOut = new Map();
  for (const [k, c] of src.edges) { const [a, b] = k.split(">"); fanOut.set(a, (fanOut.get(a) ?? 0) + c); fanIn.set(b, (fanIn.get(b) ?? 0) + c); }
  const isRoot = (n) => n.endsWith("(root)") || n.endsWith("(src root)");
  const cycles = stronglyConnected(nodes.filter((n) => !isRoot(n)), [...src.edges.keys()].filter((k) => !k.split(">").some(isRoot)));
  for (const c of cycles) findings.push({ type: "cycle", pkg: pkg.name, dep: `${c.length} components: ${c.slice(0, 3).join(" ↔ ")}${c.length > 3 ? " ↔ …" : ""}`, detail: `import cycle between ${c.length} components: ${c.join(", ")}` });

  return {
    name: pkg.name, dir: pkg.rel, pm: pkg.pm, installed: pkg.installed,
    counts: {
      prod: deps.filter((d) => d.kind === "prod").length, dev: deps.filter((d) => d.kind === "dev").length,
      peer: deps.filter((d) => d.kind === "peer").length, optional: deps.filter((d) => d.kind === "optional").length,
    },
    bytes: { prodClosure: pkg.installed ? sumBytes(prodSet) : null, allClosure: pkg.installed ? sumBytes(allSet) : null, prodPackages: prodSet.size, allPackages: allSet.size },
    sourceFiles: src.files,
    deps: deps.map(({ _closure, ...rest }) => rest),
    duplicates, undeclared, findings,
    components: {
      nodes: nodes.map((n) => ({ id: n, files: src.groups.get(n)?.files ?? 0, loc: src.groups.get(n)?.loc ?? 0, fanIn: fanIn.get(n) ?? 0, fanOut: fanOut.get(n) ?? 0 })),
      edges: [...src.edges].map(([k, c]) => { const [from, to] = k.split(">"); return { from, to, count: c }; }),
      cycles,
    },
    crossPackage: [...src.cross].map(([to, count]) => ({ to, count })),
  };
}

// ───────────────────────────── online (opt-in) ─────────────────────────────
function runJson(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32", timeout: 90_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { error: String(r.error.message) };
  try { return { data: JSON.parse(r.stdout) }; } catch { return { error: (r.stderr || r.stdout || "no output").trim().slice(0, 200) }; }
}
function enrichOnline(pkgs, analysed) {
  for (const a of analysed) {
    const pkg = pkgs.find((p) => p.name === a.name);
    if (!pkg.installed || !["pnpm", "npm"].includes(pkg.pm)) { a.online = { error: "not installed or unsupported package manager" }; continue; }
    const outdated = pkg.pm === "pnpm" ? runJson("pnpm", ["outdated", "--format", "json"], pkg.dir) : runJson("npm", ["outdated", "--json"], pkg.dir);
    const audit = pkg.pm === "pnpm" ? runJson("pnpm", ["audit", "--json"], pkg.dir) : runJson("npm", ["audit", "--json"], pkg.dir);
    a.online = { outdated: outdated.error ?? null, audit: audit.error ?? null, vulnerabilities: null };
    const major = (v) => Number(String(v ?? "").replace(/^[^\d]*/, "").split(".")[0]);
    for (const [name, o] of Object.entries(outdated.data ?? {})) {
      const d = a.deps.find((x) => x.name === name); if (!d) continue;
      d.latest = o.latest ?? null; d.majorBehind = Number.isFinite(major(o.latest) - major(o.current)) ? major(o.latest) - major(o.current) : 0;
    }
    const meta = audit.data?.metadata?.vulnerabilities;
    if (meta) a.online.vulnerabilities = meta;
    // Normalise both audit shapes to {module, severity, via: direct dependency that brings it in}.
    const direct = new Set(a.deps.map((d) => d.name));
    const advisories = [];
    if (audit.data?.advisories) {
      for (const adv of Object.values(audit.data.advisories)) {
        const path = adv.findings?.[0]?.paths?.[0]?.split(">") ?? [];
        advisories.push({ module: adv.module_name, severity: adv.severity, title: adv.title, via: direct.has(path[1]) ? path[1] : adv.module_name });
      }
    } else if (audit.data?.vulnerabilities) {
      const vs = audit.data.vulnerabilities;
      const roots = (name, seen = new Set()) => {
        if (seen.has(name)) return [];
        seen.add(name);
        if (direct.has(name)) return [name];
        return (vs[name]?.effects ?? []).flatMap((e) => roots(e, seen));
      };
      for (const [name, v] of Object.entries(vs)) for (const via of roots(name).length ? roots(name) : [name]) advisories.push({ module: name, severity: v.severity, via });
    }
    const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
    const worst = new Map(); // direct dep -> {severity, modules:Set}
    for (const v of advisories) {
      const w = worst.get(v.via) ?? { severity: "info", modules: new Set() };
      if ((rank[v.severity] ?? 0) > rank[w.severity]) w.severity = v.severity;
      w.modules.add(v.module); worst.set(v.via, w);
    }
    for (const [name, w] of worst) {
      const d = a.deps.find((x) => x.name === name); if (d) d.vulnerability = w.severity;
      const mods = [...w.modules].filter((m) => m !== name);
      const where = !direct.has(name) ? "transitive package, not mapped to a direct dependency (see `audit` for the path)"
        : mods.length ? `in transitive ${mods.slice(0, 4).join(", ")}${mods.length > 4 ? ` +${mods.length - 4}` : ""}` : "in the package itself";
      a.findings.push({ type: "vulnerability", pkg: a.name, dep: name, severity: w.severity, detail: `${w.severity} — ${where}` });
    }
  }
}

// ───────────────────────────── cross-package analysis ─────────────────────────────
function driftAcrossPackages(analysed) {
  const byName = new Map();
  for (const a of analysed) for (const d of a.deps) {
    if (d.kind === "peer") continue;
    (byName.get(d.name) ?? byName.set(d.name, []).get(d.name)).push({ pkg: a.name, range: d.range, installed: d.installedVersion });
  }
  return [...byName].filter(([, v]) => v.length > 1 && new Set(v.map((x) => x.installed ?? x.range)).size > 1)
    .map(([name, uses]) => ({ name, uses }));
}
function sharedAcrossPackages(analysed) {
  const byName = new Map();
  for (const a of analysed) for (const d of a.deps) {
    if (d.kind === "peer" || d.closureBytes == null) continue;
    const e = byName.get(d.name) ?? { name: d.name, pkgs: [], bytes: 0 };
    e.pkgs.push(a.name); e.bytes = Math.max(e.bytes, d.closureBytes); byName.set(d.name, e);
  }
  return [...byName.values()].filter((e) => e.pkgs.length > 1).sort((a, b) => b.bytes * b.pkgs.length - a.bytes * a.pkgs.length);
}

// ───────────────────────────── scoring / prioritisation ─────────────────────────────
function prioritise(analysed, drift) {
  const driftNames = new Set(drift.map((d) => d.name));
  const items = [];
  for (const a of analysed) {
    for (const d of a.deps) {
      if (d.kind === "peer") continue;
      let score = 0; const why = [];
      const ex = d.exclusiveBytes ?? 0;
      if (ex >= 10 * MB) { score += 3; why.push(`removes ${fmt(ex)}`); } else if (ex >= 3 * MB) { score += 2; why.push(`removes ${fmt(ex)}`); } else if (ex >= MB) { score += 1; why.push(`removes ${fmt(ex)}`); }
      const f = a.findings.filter((x) => x.dep === d.name);
      const has = (t) => f.some((x) => x.type === t);
      if (has("unused")) { score += 3; why.push("unused"); }
      if (has("undeclared")) { score += 4; why.push("undeclared"); }
      if (has("misplaced-prod")) { score += 2; why.push("prod→dev"); }
      if (has("misplaced-dev")) { score += 2; why.push("dev→prod"); }
      if (has("not-installed")) { score += 2; why.push("install drift"); }
      const usedIn = d.files.src + d.files.test + d.files.tooling;
      if (d.kind === "prod" && usedIn > 0 && usedIn <= 2 && ex >= 3 * MB) { score += 2; why.push(`heavy for ${usedIn} file(s)`); }
      if (d.vulnerability === "critical" || d.vulnerability === "high") { score += 5; why.push(`${d.vulnerability} vuln`); }
      else if (d.vulnerability) { score += 2; why.push(`${d.vulnerability} vuln`); }
      if ((d.majorBehind ?? 0) >= 1) { score += 1; why.push(`${d.majorBehind} major behind`); }
      if (driftNames.has(d.name)) { score += 1; why.push("version drift"); }
      // Bucket by CATEGORY, not by score: size alone never makes a P0 (it is a cost, not a defect).
      const sev = d.vulnerability === "critical" || d.vulnerability === "high";
      const priority = has("undeclared") || has("not-installed") || sev ? "P0"
        : has("unused") || has("misplaced-prod") || has("misplaced-dev") || d.vulnerability || (d.majorBehind ?? 0) >= 2
          || (ex >= 10 * MB && d.kind === "prod" && usedIn <= 2) ? "P1" : "P2";
      if (score > 0) items.push({ pkg: a.name, dep: d.name, kind: d.kind, score, why, bytes: ex, priority });
    }
    for (const x of a.findings.filter((x) => x.type === "undeclared" && !a.deps.some((d) => d.name === x.dep)))
      items.push({ pkg: a.name, dep: x.dep, kind: "undeclared", score: 4, why: ["undeclared"], bytes: 0, priority: "P0" });
    for (const x of a.findings.filter((x) => x.type === "vulnerability" && !a.deps.some((d) => d.name === x.dep))) {
      const sev = x.severity === "critical" || x.severity === "high";
      items.push({ pkg: a.name, dep: x.dep, kind: "transitive", score: sev ? 5 : 2, why: [`${x.severity} vuln (transitive)`], bytes: 0, priority: sev ? "P0" : "P1" });
    }
    for (const x of a.findings.filter((x) => x.type === "cycle")) items.push({ pkg: a.name, dep: x.dep, kind: "cycle", score: 2, why: ["import cycle"], bytes: 0, priority: "P1" });
  }
  const rank = { P0: 0, P1: 1, P2: 2 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority] || b.score - a.score || b.bytes - a.bytes);
}

/** Package-level import cycles (e.g. api <-> reviewer-core through tsconfig aliases). */
function packageCycles(analysed) {
  const names = analysed.map((a) => a.name);
  const keys = analysed.flatMap((a) => a.crossPackage.filter((c) => names.includes(c.to)).map((c) => `${a.name}>${c.to}`));
  return stronglyConnected(names, keys);
}

// ───────────────────────────── rendering ─────────────────────────────
// Collision-free mermaid ids: two labels may differ only by punctuation ("a-b" vs "a_b").
const idCache = new Map();
const mmId = (s) => { if (!idCache.has(s)) idCache.set(s, `n${idCache.size}`); return idCache.get(s); };

function renderRepoMap(analysed) {
  const lines = ["```mermaid", "flowchart LR"];
  for (const a of analysed) {
    lines.push(`  ${mmId(a.name)}["${mm(a.name)}<br/>${a.dir} · ${a.pm}<br/>${a.installed ? fmt(a.bytes.allClosure) : "not installed"}"]`);
  }
  for (const a of analysed) for (const c of a.crossPackage) {
    if (analysed.some((x) => x.name === c.to)) lines.push(`  ${mmId(a.name)} -->|"${c.count} imports"| ${mmId(c.to)}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function renderHeavyGraph(analysed, perPkg = 8) {
  const lines = ["```mermaid", "flowchart LR", "  classDef big fill:#fde2e2,stroke:#d33,color:#000", "  classDef mid fill:#fff3cd,stroke:#c90,color:#000", "  classDef small fill:#e8f1ff,stroke:#58a,color:#000"];
  analysed.forEach((a, pi) => {
    const top = a.deps.filter((d) => d.kind === "prod" && d.closureBytes != null).sort((x, y) => y.closureBytes - x.closureBytes).slice(0, perPkg);
    if (!top.length) return;
    lines.push(`  subgraph P${pi}["${mm(a.name)} — prod ${fmt(a.bytes.prodClosure)}"]`, "    direction TB");
    top.forEach((d, di) => {
      const cls = d.closureBytes >= 10 * MB ? "big" : d.closureBytes >= 3 * MB ? "mid" : "small";
      lines.push(`    d${pi}_${di}["${mm(d.name)}<br/>${fmt(d.closureBytes)} · ${d.closureCount} pkgs"]:::${cls}`);
    });
    lines.push("  end");
  });
  lines.push("```");
  return lines.join("\n");
}

function renderComponentGraph(a, maxNodes = 30) {
  const { nodes, edges, cycles } = a.components;
  if (!edges.length) return "_No internal import edges between components found._";
  const keep = nodes.map((n) => ({ ...n, deg: n.fanIn + n.fanOut })).sort((x, y) => y.deg - x.deg).slice(0, maxNodes).map((n) => n.id);
  const ks = new Set(keep);
  const inCycle = new Set(cycles.flatMap((c) => c.flatMap((x, i) => c.map((y) => `${x}>${y}`))));
  const lines = ["```mermaid", "flowchart LR"];
  for (const n of nodes.filter((n) => ks.has(n.id))) lines.push(`  ${mmId(n.id)}["${mm(n.id)}<br/>${n.files} files"]`);
  const shown = edges.filter((e) => ks.has(e.from) && ks.has(e.to));
  const red = [];
  shown.forEach((e, i) => {
    lines.push(`  ${mmId(e.from)} -->|${e.count}| ${mmId(e.to)}`);
    if (inCycle.has(`${e.from}>${e.to}`)) red.push(i);
  });
  if (red.length) lines.push(`  linkStyle ${red.join(",")} stroke:#d33,stroke-width:2px`);
  lines.push("```");
  if (nodes.length > maxNodes) lines.push(`_Showing the ${maxNodes} most connected of ${nodes.length} components; the rest are in the JSON._`);
  return lines.join("\n");
}

function renderReport(ctx) {
  const { analysed, drift, shared, priorities, meta, pkgCycles } = ctx;
  const L = [];
  const installedPkgs = analysed.filter((a) => a.installed);
  const totalAll = analysed.reduce((t, a) => t + (a.bytes.allClosure ?? 0), 0);
  const totalProd = analysed.reduce((t, a) => t + (a.bytes.prodClosure ?? 0), 0);
  const count = (t) => analysed.reduce((n, a) => n + a.findings.filter((f) => f.type === t).length, 0);

  L.push("# Dependencies report", "",
    `> ${meta.date} · commit \`${meta.sha}\` · mode: **${meta.online ? "online (outdated + audit)" : "offline (no registry calls)"}** · ${analysed.length} packages`, "");

  L.push("## 1. Summary", "",
    "| Metric | Value |", "|---|---|",
    `| Packages scanned | ${analysed.length} (${installedPkgs.length} installed) |`,
    `| Direct dependencies | ${analysed.reduce((n, a) => n + a.counts.prod + a.counts.dev + a.counts.optional, 0)} (${analysed.reduce((n, a) => n + a.counts.prod, 0)} prod / ${analysed.reduce((n, a) => n + a.counts.dev, 0)} dev) |`,
    `| Installed weight (all, summed per package) | ${fmt(totalAll)} |`,
    `| Installed weight (prod only) | ${fmt(totalProd)} |`,
    `| Priority items | P0: ${priorities.filter((p) => p.priority === "P0").length} · P1: ${priorities.filter((p) => p.priority === "P1").length} · P2: ${priorities.filter((p) => p.priority === "P2").length} |`,
    `| Unused / undeclared / misplaced | ${count("unused")} / ${count("undeclared")} / ${count("misplaced-prod") + count("misplaced-dev")} |`,
    `| Version drift across packages | ${drift.length} |`,
    `| Component import cycles | ${count("cycle")} (inside packages) · ${pkgCycles.length} (between packages) |`,
    `| Tooling-only dependencies (CLIs/plugins, not flagged) | ${count("tooling-only")} |`, "");

  L.push("## 2. Repository map", "", "Arrows are real source imports resolved through tsconfig `paths` aliases (not npm deps).", "", renderRepoMap(analysed), "",
    ...(pkgCycles.length ? [`⚠ Package-level import cycle: ${pkgCycles.map((c) => c.map((x) => "`" + x + "`").join(" ↔ ")).join("; ")}.`, ""] : []));

  L.push("## 3. Weight by package", "",
    "| Package | PM | Prod / Dev | Prod install | Full install | Share | |", "|---|---|---|---:|---:|---:|---|");
  for (const a of analysed) {
    L.push(`| \`${a.name}\` (${a.dir}) | ${a.pm} | ${a.counts.prod} / ${a.counts.dev} | ${fmt(a.bytes.prodClosure)} | ${fmt(a.bytes.allClosure)} | ${totalAll ? Math.round(((a.bytes.allClosure ?? 0) / totalAll) * 100) : 0}% | \`${bar(totalAll ? (a.bytes.allClosure ?? 0) / totalAll : 0)}\` |`);
  }
  L.push("", "_Prod / Full install = unique bytes of the package's transitive closure in `node_modules` (pnpm symlinks de-duplicated)._", "");

  L.push(`## 4. Heaviest dependencies (top ${opt.top})`, "",
    "`Exclusive` = bytes freed if only this dependency is removed (shared transitive deps do not count). `Closure` = dep + everything it pulls in.", "",
    "| # | Dependency | Package | Type | Version | Own | Closure | Exclusive | Pkgs | Used in (src/test/tool) | |", "|---:|---|---|---|---|---:|---:|---:|---:|---|---|");
  const flat = analysed.flatMap((a) => a.deps.filter((d) => d.closureBytes != null && d.kind !== "peer").map((d) => ({ ...d, pkg: a.name })))
    .sort((x, y) => y.closureBytes - x.closureBytes).slice(0, opt.top);
  const maxC = flat[0]?.closureBytes ?? 1;
  flat.forEach((d, i) => L.push(`| ${i + 1} | \`${d.name}\` | ${d.pkg} | ${d.kind} | ${d.installedVersion} | ${fmt(d.ownBytes)} | ${fmt(d.closureBytes)} | ${fmt(d.exclusiveBytes)} | ${d.closureCount} | ${d.files.src}/${d.files.test}/${d.files.tooling} | \`${bar(d.closureBytes / maxC, 12)}\` |`));
  L.push("");

  L.push("### Dependency graph — package → heaviest prod dependencies", "",
    "Red ≥ 10 MB · amber ≥ 3 MB · blue below. Label = closure size and number of installed packages it brings.", "", renderHeavyGraph(analysed), "");

  if (shared.length) {
    L.push("### Dependencies shared by several packages", "", "| Dependency | Packages | Closure (max) | Note |", "|---|---|---:|---|");
    for (const s of shared.slice(0, 10)) L.push(`| \`${s.name}\` | ${s.pkgs.join(", ")} | ${fmt(s.bytes)} | installed ${s.pkgs.length}× — no workspace, so each package keeps its own copy |`);
    L.push("");
  }

  L.push("## 5. Internal components", "",
    "Nodes = module-level folders (`modules/<name>`, `app/<segment>`, first folder under `src/`). Edge label = import count. Red edges are part of an import cycle.", "");
  for (const a of analysed) {
    if (!a.components.nodes.length) continue;
    const hubs = [...a.components.nodes].sort((x, y) => y.fanIn - x.fanIn).slice(0, 3).filter((n) => n.fanIn > 0);
    L.push(`### \`${a.name}\``, "", renderComponentGraph(a), "");
    if (hubs.length) L.push(`Most depended-on: ${hubs.map((h) => `\`${h.id}\` (${h.fanIn} in)`).join(", ")}.`, "");
    if (a.components.cycles.length) L.push(`⚠ Cycles: ${a.components.cycles.map((c) => `\`${c.join(" ↔ ")}\``).join("; ")}.`, "");
  }

  L.push("## 6. Health findings", "");
  const groupsOf = [
    ["undeclared", "Imported but not declared (P0 — breaks clean installs)"],
    ["misplaced-dev", "Declared in devDependencies but used at runtime"],
    ["misplaced-prod", "Declared in dependencies but used only by tests/tooling"],
    ["unused", "Declared but never referenced"],
    ["not-installed", "Declared but missing from node_modules"],
    ["vulnerability", "Known vulnerabilities (online mode)"],
  ];
  let any = false;
  for (const [type, title] of groupsOf) {
    const rows = analysed.flatMap((a) => a.findings.filter((f) => f.type === type));
    if (!rows.length) continue;
    any = true;
    L.push(`### ${title}`, "", "| Package | Dependency | Detail |", "|---|---|---|");
    for (const r of rows) L.push(`| ${r.pkg} | \`${r.dep}\` | ${esc(r.detail)} |`);
    L.push("");
  }
  if (drift.length) {
    any = true;
    L.push("### Version drift across packages", "", "| Dependency | Versions in use |", "|---|---|");
    for (const d of drift) L.push(`| \`${d.name}\` | ${d.uses.map((u) => `${u.pkg}: ${u.installed ?? u.range}`).join(" · ")} |`);
    L.push("");
  }
  const dupRows = analysed.flatMap((a) => a.duplicates.slice(0, 5).map((d) => ({ ...d, pkg: a.name }))).filter((d) => d.extraBytes >= 100 * 1024);
  if (dupRows.length) {
    any = true;
    L.push("### Several versions of one package inside one install", "", "| Package | Dependency | Versions | Extra weight |", "|---|---|---|---:|");
    for (const d of dupRows) L.push(`| ${d.pkg} | \`${d.name}\` | ${d.versions.join(", ")} | ${fmt(d.extraBytes)} |`);
    L.push("");
  }
  if (!any) L.push("No findings.", "");
  if (meta.online) {
    L.push("### Registry data", "", "| Package | Outdated query | Audit query | Vulnerabilities (info/low/mod/high/crit) |", "|---|---|---|---|");
    for (const a of analysed) {
      const v = a.online?.vulnerabilities;
      L.push(`| ${a.name} | ${a.online?.outdated ? "⚠ " + esc(a.online.outdated) : "ok"} | ${a.online?.audit ? "⚠ " + esc(a.online.audit) : "ok"} | ${v ? [v.info, v.low, v.moderate, v.high, v.critical].map((x) => x ?? 0).join("/") : "n/a"} |`);
    }
    L.push("");
  }

  L.push("## 7. Prioritisation", "",
    "Bucket is decided by **category**, never by size alone: **P0** undeclared import, missing from node_modules, high/critical vulnerability · **P1** unused, misplaced prod/dev, moderate vulnerability, ≥2 majors behind, ≥10 MB freed for ≤2 importing files, import cycle · **P2** everything else with a signal. Within a bucket the order is the mechanical score (size freed 1–3, unused 3, undeclared 4, misplaced 2, install drift 2, heavy-for-light-use 2, vulnerability 2/5, major behind 1, version drift 1, cycle 2).", "");
  if (priorities.length) {
    L.push("| Priority | Score | Package | Item | Type | Why |", "|---|---:|---|---|---|---|");
    for (const p of priorities.slice(0, 30)) L.push(`| **${p.priority}** | ${p.score} | ${p.pkg} | \`${p.dep}\` | ${p.kind} | ${esc(p.why.join("; "))} |`);
    if (priorities.length > 30) L.push("", `_${priorities.length - 30} more items in the JSON._`);
  } else L.push("Nothing to prioritise.");
  L.push("");

  L.push("## 8. Recommendations", "", "<!-- AGENT: written after reading sections 1–7; see SKILL.md step 5. Do not leave this placeholder in the final report. -->", "");

  L.push("## 9. Method and limits", "",
    "- Sizes are bytes on disk in `node_modules` (real paths, nested `node_modules` excluded, optional/peer deps included when installed). They are **not** bundle sizes: tree-shaking, minification and server-only code are not modelled.",
    "- Imports are found with a regex over source text (static `import`/`export … from`, dynamic `import()`, `require()`); no type-checker. Template-built specifiers and non-JS usage (Dockerfiles, YAML) are invisible, so *unused* means \"not found\" — verify before deleting.",
    "- A dependency referenced only in package scripts/config files is reported as *tooling-only*, never as unused.",
    "- Component = folder under `src/` (one level deeper inside `modules/` and `app/`). Edges count import statements, not runtime calls.",
    "- Packages are independent installs (no workspace): a dep used by two packages is installed — and counted — twice.",
    `- Not installed packages show \`n/a\` sizes: run that package's install first.${meta.online ? "" : " Outdated and vulnerability data need `--online`."}`, "");
  return L.join("\n");
}

// ───────────────────────────── main ─────────────────────────────
function gitSha() {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

const all = discoverPackages();
const wanted = opt.pkg.length ? all.filter((p) => opt.pkg.some((w) => w === p.name || w === p.rel || w === basename(p.dir))) : all;
if (!wanted.length) { console.error("no packages matched"); process.exit(2); }

const analysed = wanted.map((p) => analysePackage(p, all));
if (opt.online) enrichOnline(wanted, analysed);
const drift = driftAcrossPackages(analysed);
const shared = sharedAcrossPackages(analysed);
const priorities = prioritise(analysed, drift);
const pkgCycles = packageCycles(analysed);
const meta = { date: new Date().toISOString().slice(0, 10), sha: gitSha(), online: opt.online, root: ROOT };

mkdirSync(opt.out, { recursive: true });
writeFileSync(join(opt.out, "deps-report.json"), JSON.stringify({ meta, packages: analysed, drift, shared, priorities, pkgCycles }, null, 2));
writeFileSync(join(opt.out, "deps-report.md"), renderReport({ analysed, drift, shared, priorities, meta, pkgCycles }));

const c = (p) => priorities.filter((x) => x.priority === p).length;
console.log(`dependency-checker: ${analysed.length} packages · priorities P0=${c("P0")} P1=${c("P1")} P2=${c("P2")}`);
console.log(`report: ${join(opt.out, "deps-report.md")}`);
console.log(`data:   ${join(opt.out, "deps-report.json")}`);
