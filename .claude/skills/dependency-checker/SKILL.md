---
name: dependency-checker
description: "Audit of the repo's dependencies and internal components: per-package install weight (own / closure / exclusive size), Mermaid graphs (package map, heaviest deps, component imports), health findings (unused, undeclared, misplaced, version drift, cycles, optional outdated + vulnerabilities), then a P0–P2 prioritisation and concrete advice. Use on /dependency-checker, or when asked to check, audit, weigh or clean up dependencies, find heavy or unused packages, or draw the dependency graph."
argument-hint: "[--pkg <name>] [--online] [--top <n>]"
---

# /dependency-checker — dependency audit with graphs, sizes and priorities

The repo is NOT a workspace: `client`, `server`, `reviewer-core`, `mcp`, `e2e`, `evals` are
independent installs (pnpm and npm mixed) that share code through tsconfig `paths` aliases.
So every number below is per package, and a dep used by two packages is counted twice.

**Division of labour.** The script measures; you interpret. Never write a size, count or
version that is not in `deps-report.json` / `deps-report.md`.

## Two modes

- **Script mode** (default): you can run `collect.mjs` — follow the Workflow below.
- **Manual mode**: no tools, or the user pasted the data (package.json lists, sizes, grep results)
  instead of a repo. Do NOT ask for more data and do NOT run anything. Build the same report from
  what you were given, following the *Output contract* and the *Manual-mode rules* at the end.

## Workflow

```
- [ ] 1. Scope      — which packages, offline or --online
- [ ] 2. Collect    — run collect.mjs
- [ ] 3. Read       — deps-report.md end to end, then the JSON for detail
- [ ] 4. Verify     — spot-check every P0/P1 item before recommending it
- [ ] 5. Write      — fill section 8, deliver the report (chat + file only if asked)
```

### 1. Scope
- Default: all packages, **offline** (no network, ~5–60 s; the first run on a cold disk is slow).
- `--online` only when the user asks for vulnerabilities / outdated versions. It runs
  `pnpm|npm outdated` and `audit` per package (sends package names and versions to the registry).
- A package without `node_modules` shows `n/a` sizes — say so, do not install it yourself.

### 2. Collect
```bash
node .claude/skills/dependency-checker/scripts/collect.mjs [--pkg <dir|name>]... [--online] [--top 15] --out "<scratchpad>/deps"
```
Writes `deps-report.md` (sections 1–7 and 9 filled, section 8 a placeholder) and
`deps-report.json` (everything, incl. all priority items and per-dependency data).
Exit is non-zero only on bad arguments; findings never fail the run.

### 3. Read
Read `deps-report.md` fully. Use the JSON for what the table cut (`priorities` beyond 30,
`packages[].deps[]`, `components.edges`, `duplicates`).

### 4. Verify before recommending (mandatory)
The scanner is a regex over source text. For each P0/P1 item you will mention:
- **unused** → `Grep` the package (src, tests, configs, scripts, Dockerfile, `.github`) for the
  name, and check how the repo loads it (config string, CLI, dynamic import, a `pnpm`/`npx`
  call in a CI workflow — a dep only CI runs is still used). Also search the
  package `INSIGHTS.md` / `CLAUDE.md` — e.g. server's CLAUDE.md says modules are registered
  statically, which is why `@fastify/autoload` is a real finding.
- **heavy for N files** → look at the import sites. A framework or runtime (`next`, `react-dom`,
  `openai`, `drizzle-orm`) imported from one file is normal, not a finding. A UI lib imported
  once (`mermaid`, `lucide-react`) is a lazy-loading / subpath-import candidate.
- **misplaced / undeclared** → open the importing file; confirm it is runtime code.
- **cycle** → read the cited edges; respect `onion-architecture` §5 *Known debt* — those are
  existing violations, report them as known, not new.
- **version drift** → matters for runtime libs; for `typescript`/`tsx`/`@types/node` it is hygiene (P2).
Drop or downgrade anything that does not survive; say "not verified" for what you did not check.

### 5. Write section 8, the closing takeaways, and deliver
Replace the `<!-- AGENT: … -->` placeholder in `deps-report.md` using Edit. Format, one block per
priority bucket, most important first:

```
### P0 — fix now (correctness / security)
1. **<package> · <dependency>** — <what is wrong, with the number from the report>
   - Evidence: `<file>:<line>` or report section
   - Check first: `<exact grep/command that proves the claim>` (mandatory for every unused / remove / move item)
   - Do: `<exact command in THAT package's manager>`
   - Risk / check after: <what could break, how to verify, e.g. node scripts/verify.mjs <pkg>>
### P1 — plan soon (waste, drift, cycles)
### P2 — opportunistic
### Not recommended
<items the script flagged that you rejected, one line each, with the reason>
```

Close the report with **Key takeaways**: 3–5 one-line actions, ordered by priority, each naming
a package and a dependency or file.

Rules for advice:
- Size is a cost, not a defect: never put something in P0 for weight alone. Quantify the gain
  ("frees 112.9 MB of install, not bundle") and keep install size and bundle size apart —
  the report measures disk, not what ships to the browser.
- Use the package's own manager (`pnpm remove` in `client/`, `server/`, `mcp/`, `evals/`;
  `npm uninstall` in `reviewer-core/`, `e2e/`). Never hand-edit lock files or run `docker compose down -v`.
- The two `vendor/shared` copies, `@devdigest/*` aliases and `reviewer-core ↔ server` are by
  design (see root CLAUDE.md); report them as structure, not as drift to "fix".
- Do NOT change `package.json` or lockfiles as part of this skill. Recommend; the user decides.
- Max ~10 recommendations in total; group the rest ("12 more P2 items in the JSON").

Deliver in chat: the **Summary table**, the **repo map** diagram, the **top 5 heaviest**, the P0/P1
list from section 8 and the path of the report. Mermaid does not render in the terminal — give the
file path, and offer to publish it as an Artifact (or open it in a Markdown preview) if the user
wants to see the diagrams. Save into `docs/` only when asked (one topic per file).

## Output contract (what the report always contains)

The report opens with a one-line **Scope** (packages analysed, offline/online, date) and ends
with **Key takeaways** (3–5 lines). Between them the sections below, always in this order.

| § | Section | Source |
|---|---|---|
| 1 | Summary: counts, total weight, P0/P1/P2, cycles | script |
| 2 | Repository map (Mermaid) + package-level cycles | script |
| 3 | Weight by package (prod / full install, share bars) | script |
| 4 | Heaviest dependencies table, package → deps graph, shared deps | script |
| 5 | Internal components per package (Mermaid, hubs, cycles) | script |
| 6 | Health findings (+ registry data in `--online`) | script |
| 7 | Prioritisation table (P0/P1/P2, mechanical score + reasons) | script |
| 8 | Recommendations | **you** |
| 9 | Method and limits | script |

Terms: **Own** = the package's files · **Closure** = it plus everything it pulls in ·
**Exclusive** = bytes freed if only this dep is removed (shared transitives excluded).
Peer dependencies are not counted into a dep's closure.

## Manual-mode rules

Same sections, same order, same P0/P1/P2 buckets. What changes is where the facts come from.
- **Repo map is always a Mermaid diagram**, never an ASCII tree. Minimum:
  ````
  ```mermaid
  flowchart LR
    server["server · pnpm"] -->|"imports via alias"| core["reviewer-core · npm"]
    client["client · pnpm"] -->|"@shared alias"| server
  ```
  ````
  Nodes are packages (label: name · package manager), arrows are cross-package imports
  (path aliases or relative imports), not npm dependencies. Add a second `flowchart` for the
  heaviest dependencies per package when sizes are given.
- Sizes: only numbers present in the input. Say they are install (disk) sizes, not bundle sizes.
  Never estimate a size you were not given; write `n/a`.
- Count **distinct** versions, not packages: zod@3.23.8 in two packages and 3.22.4 in one is
  *two* versions, drift between client and the other two.
- Every finding carries a tier (P0/P1/P2/Info) and names the package and the dependency or file.
  Size alone is never P0. A framework (`next`, `react-dom`) or test runner (`playwright`) is
  heavy by nature — note it, do not recommend removing it.
- Unused = "not found in the data you were given": propose it as *verify, then remove*
  (name the grep to run), never as an executed change.
- Internal links (path aliases, relative imports across packages) are listed separately from
  npm dependencies; a package that reaches into another by relative path instead of its
  public entry point is a finding. Describe the repo as independent installs linked by path aliases; avoid the words "workspace" and "monorepo".

### Manual mode: no invented numbers, thresholds or savings
- Quote only figures present in the input. Do not add thresholds ("max 500 MB in CI"), targets,
  estimates ("~5–10 MB freed") or percentages that the input does not contain.
- Install size is disk size. Never restate it as "bundle size", "prod bundle" or "shipped weight";
  if you mention the difference, say the input does not measure bundle size.
- Do not invent a P0 bucket. If the input has no P0 item, write "P0: none" and start at P1.
- Every unused / remove / move item has a `Check first:` line with the concrete grep to run
  (for example `grep -rn "@fastify/autoload" server/src server/package.json`), and is phrased
  as "verify, then remove".

### Manual mode: length budget
- Aim for at most ~1200 words. Tables instead of prose; one place per fact — a finding that is in
  section 6 is referenced (not re-explained) in 7 and 8.
- Recommendations: at most 10 items in total; Key takeaways: 3–5 single lines.

## Limits to state when relevant
- Disk size ≠ bundle size; no tree-shaking, no minification.
- Imports are regex-detected (no type-checker); template-built specifiers and non-JS usage are invisible.
- `tooling-only` deps (CLIs, plugins, string-referenced like `pino-pretty`) are counted, not flagged.
- Components are folders under `src/` (one level deeper in `modules/` and `app/`).
- `--online` audit attributes transitive advisories to the direct dep that brings them in; npm's
  format may leave some unmapped (reported as such).
