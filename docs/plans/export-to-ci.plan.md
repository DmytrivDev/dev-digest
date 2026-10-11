# Implementation plan: Export to CI (MVP) — wizard, generated GHA workflow, runner, CI Runs

**Route** — A (spec-driven).

**Requirements source** — `specs/SPEC-09-export-to-ci.md` (Status: approved, 0 `[NEEDS CLARIFICATION]` markers, `node scripts/check-specs.mjs` clean). The spec file is still **untracked** in this worktree (`?? specs/SPEC-09-export-to-ci.md`). Commit it with the feature. This plan implements those requirements. It does not define or change them.

**Execution mode** — multi-agent lanes, chosen by the user on 2026-10-10:
- **4 build implementers** (L1–L4), within the user's cap of 5 for writing the implementation.
- A **separately capped fix loop of at most 2 `implementer` fix-mode dispatches** (F1, F2).

**User decisions (2026-10-10, explicit)**:
1. **No test writing in this workflow.** No implementer creates a test file or adds a test case, neither the build lanes nor fix mode.
   - Implementers still run the EXISTING checks and keep them green: typecheck, the existing unit and integration suites, `arch:check`, client `pnpm build`, and agent-runner typecheck/test/build.
   - An implementer may **minimally update an EXISTING test only when its own change breaks it**. Examples: a `vi.mock` factory that lacks a new hook export (`client/INSIGHTS.md:62`), or a contract fixture that needs a new required field (`server/INSIGHTS.md:103`). Each such edit must be named in the lane report.
   - The ACs' unit and integration Verify hints that this leaves uncovered are listed under **Test debt**, for a later `test-writer` pass.
2. **Fix loop cap: at most 2 iterations.**
   - F1 takes the merged architecture and security findings.
   - F2 runs only if needed. It takes the plan-verifier findings, or whatever F1 left open.
   - Anything still open after F2 goes to the user. There are no further dispatches.

**Out of scope**:
- Everything under the spec's *Non-goals* and *Deferred*: CircleCI/Jenkins/CLI targets, `review-action@v1`, an inbound ingest endpoint, `pr_id` linking, Stats tab, the GitHub-App merge toggle, secret-existence checks, auto-refresh, lifecycle and "Out of date" states, removing an installation, CI Runs filters, pagination and skeleton, wider workflow validation, runner wrapping of imported skills.
- **No change** to the multi-run review service (`server/src/modules/reviews/**`) or to the PR feed (`server/src/modules/pulls/**`).
- No seed data.
- No new tests (decision 1).
- Architecture and security review are done by separate agents (see the pipeline section).

**Design inputs for the client lane**:
- `docs/design/extracted/screen_export.jsx` (wizard).
- `screen_cizruns.jsx:18-53` (CI Runs and its empty state).
- `screen_agents.jsx` `CITab`.
- `chrome.jsx:15-20` (sidebar GLOBAL section).

⚠ **The user's five screenshots are NOT in the repository.** `docs/design/screenshots/` has only `eval-pipeline/` and `pr-brief/`. The ACs transcribe them: AC-3 is screenshot 1, AC-9 is screenshot 3, AC-10 is screenshot 4. Build from the **AC text first, then the mock**. On a conflict the AC wins (spec DR-18). If possible, add the screenshots to `docs/design/screenshots/export-to-ci/` before wave 2. NFR-2's side-by-side check is manual, done by the user.

---

## Requirements traceability

How each AC is checked in this iteration:
- **CR** — code reading against the AC, done by the lane at completion and by plan-verifier.
- **TC** — typecheck.
- **ES** — the existing suites stay green.
- **B** — `pnpm build` (client or agent-runner).
- **M** — a manual or runtime check described in the work item.

The spec's automated Verify hints that are not met this iteration are in **Test debt**.

| Req | Requirement (short) | Source | Work items | Checked by (this iteration) |
|---|---|---|---|---|
| AC-1 | CI tab after Evals with "Fail CI on" persisting `ci_fail_on`; Config tab loses "CI gate" | spec:58-62 | W11, W12 | CR + TC + M (W12) |
| AC-2 | No installation → EmptyState + CTA opens wizard | spec:64-67 | W12 | CR + M |
| AC-3 | ≥1 installation → screenshot-1 layout + runs table filtered by agent | spec:69-75 | W10, W12 | CR + M |
| AC-4 | Modal 720, steps, footer, Esc closes without side effect | spec:79-83 | W13 | CR + M |
| AC-5 | Step 1 repo picker, single GHA card, preselection/prefill, Continue disabled | spec:85-90 | W6, W13 | CR + M |
| AC-6 | Non-openrouter → 422 `provider_not_supported` (preview + export); Step 1 message | spec:92-95 | W6, W7, W13 | CR + M (curl) |
| AC-7 | Preview returns exactly manifest, enabled skills, memory, runner files, workflow; stored slug kept | spec:97-104 | W5, W6, W7 | CR + M (curl) |
| AC-8 | 409 `slug_conflict` {path}, no suffixing | spec:106-110 | W5, W6 | CR |
| AC-9 | Step 2 layout; only workflow editable; runner shows size | spec:112-116 | W13 | CR + M |
| AC-10 | Step 3 triggers (synchronize locked), static secrets, keyboard radio, info box, regenerate + notice | spec:118-126 | W13 | CR + M |
| AC-11 | 422 `workflow_invalid` {reason} | spec:128-132 | W5, W7 | CR + M (curl) |
| AC-12 | Step 4 cards, docs link, Installing…, single request, PR link | spec:134-141 | W13 | CR + M |
| AC-13 | PR install on `devdigest/ci`, reuse/recreate from GitHub default head, never write default ref | spec:143-149 | W2, W6 | CR |
| AC-14 | Upsert installation per (agent, repo), slug frozen | spec:151-155 | W3, W6 | CR |
| AC-15 | Zip with exactly the previewed files + submitted workflow | spec:157-160 | W5, W7 | CR + M (curl + unzip) |
| AC-16 | 502 `github_error` / 500 `runner_bundle_missing`; wizard keeps state | spec:162-166 | W4, W6, W13 | CR + M (missing dist) |
| AC-17 | Foreign-workspace ids → 404 | spec:168-170 | W6, W8 | CR |
| AC-18..AC-26 | Generated workflow rules | spec:174-217 | W5 | CR of the template + M (generated YAML inspected from a preview) |
| AC-27 | Runner loads only `DEVDIGEST_MANIFEST`; exit 1 without post/artifact | spec:221-224 | W15 | CR + TC + ES (+ M) |
| AC-28 | Trusted task slot = fixed words + PR number | spec:226-228 | W16 | CR + ES |
| AC-29 | Artifact strict `CiResultArtifact` with identity fields | spec:230-233 | W1, W17 | CR + TC + B |
| AC-30..AC-34 | Refresh ingest, identity from GitHub, rejection rules, status mapping, `source='ci'` + `pr_id` null | spec:237-261 | W2, W3, W8 | CR (+ M with a real repo when available) |
| AC-35 | Refresh error inline + earlier runs listed | spec:263-265 | W8, W11 | CR + M |
| AC-36 | List only this workspace's runs, ≤50, newest first | spec:267-269 | W8 | CR |
| AC-37 | `/ci-runs` page and table | spec:273-280 | W10, W11 | CR + B + M |
| AC-38 | Empty `/ci-runs` → EmptyState + CTA to `/agents` | spec:282-286 | W11 | CR + M |
| NFR-1 | Strings in `ci` (tab label in `agents`); old keys removed | spec:312-314 | W10 | CR + `grep` + M |
| NFR-2 | Vendored primitives; CSS-var colours; matches design | spec:316-320 | W10–W13 | CR + `grep` for hex/`rgb(` + M (user) |
| NFR-3 | Secrets never in studio req/resp/DB/log, nor runner output | spec:322-325 | W1, W8, W17 | CR (+ M sentinel run of the runner) |

Every work item W0–W17 appears above. W0 is an enabling preflight.

## Test debt (not covered by automated tests this iteration — for a later `test-writer` pass)

The spec's Verify hints for the following are **not** automated now. A later pass should cover them, in the shapes the spec states:

- **Server unit:**
  - AC-11: each violation → 422 + reason; the generated workflow passes.
  - AC-18–AC-26: parse the generated YAML and assert each rule.
  - NFR-3: CI schemas have no secret field.
  - Contract strictness of `CiResultArtifact` / `CiPreviewInput`.
  - The pure ingest helpers (64 KB, strict parse, identity, status mapping).
- **Server integration (`*.it.test.ts`, mocked GitHub port):**
  - AC-1: PUT `ci_fail_on` then GET.
  - AC-6, AC-7, AC-8, AC-13 (default branch `develop`, open-PR and no-PR cases, no ref write to `develop`), AC-14, AC-15, AC-16, AC-17.
  - AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36.
  - NFR-3: export + ingest leave no sentinel in DB rows or log.
- **agent-runner unit:**
  - AC-27: named manifest used; each failure exits 1 without post or write.
  - AC-28: hostile title stays out of the task line.
  - AC-29: fixture env → strict artifact with identity.
  - NFR-3: sentinel secrets absent from stdout, stderr, artifact and posted body.
- **Client unit:**
  - AC-1: ConfigTab has no "CI gate"; the CI tab select persists.
  - AC-2, AC-3, AC-4, AC-5, AC-6, AC-9, AC-10, AC-12, AC-16, AC-35, AC-37 (incl. `<img src=x onerror=alert(1)>` as literal text), AC-38.
  - NFR-1: no raw `ci.` or `agents.` key with real messages.
  - NFR-2: no hex or `rgb(` in new components.

## Spec follow-ups (addressed to `spec-creator` and the user — NOT applied; the plan implements the spec as written)

1. **AC-19 vs the runner's diff fetch — RESOLVED 2026-10-10 (user):** `post_as: none` now grants `contents: read` + `pull-requests: read` (spec AC-19 updated). Original note: with `post_as: none` only `contents: read` was granted. The runner fetches the PR diff via `GET /repos/{o}/{r}/pulls/{n}` (`agent-runner/src/github.ts:35`, `run.ts:108`). On a private repo that likely needs `pull-requests: read`. This is unverified.
2. **Fork PR number (AC-31 / EC-3).** `pull_requests` may be empty or null for fork runs (weak source: github/docs#22501). The plan falls back to `GET /commits/{sha}/pulls`, which is unverified for forks. When neither works it stores `pr_number: null` and shows "—". The spec contract does not mark `pr_number` nullable.
3. **AC-4 "no request sent".** The repo list (`GET /repos`) is already cached by the shell. The plan guarantees no POST (preview or export) on Esc.
4. **AC-11** does not cover a deleted `permissions:` block, which falls back to the default token permissions. That case is deferred under "wider validation".
5. **Duplicate skill slugs inside one agent** get the AC-8 409 (Assumption A5).
6. **Runner bundle availability.** `agent-runner/dist/` is git-ignored (`agent-runner/.gitignore:2`) while the root `.gitignore:3-6` un-ignores it. A demo needs `cd agent-runner && pnpm build`.

---

## Affected surface

Skills come from `.claude/skill-routing.md`. OA = onion-architecture, FUA = frontend-ui-architecture. **No new test files appear anywhere in this table.** Existing tests are touched only under the decision-1 exception.

### Wave 1 — Lane L1 (contracts, ports, DB, config)

| File | New/Mod | Pkg | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/vendor/shared/contracts/eval-ci.ts` | Mod | shared | Ring 2 | zod | Section order is load-bearing; a TDZ crash happens at import, not at typecheck (`server/INSIGHTS.md:56`). |
| `client/src/vendor/shared/contracts/eval-ci.ts` | Mod | shared | Ring 2 | zod | Must be byte-identical to the server copy; the existing sync tests enforce it (`server/INSIGHTS.md:50`). |
| `server/src/vendor/shared/adapters.ts` | Mod | shared | Ring 2 (GitHubClient port) | zod | The port names the conversation, with no Octokit types (onion §2). |
| `client/src/vendor/shared/adapters.ts` | Mod | shared | Ring 2 | zod | Byte-identical. |
| `server/src/adapters/github/octokit.ts` | Mod | api | Ring 4 | OA, security | Never echo the token. Commit large files via `git.createBlob`. |
| `server/src/adapters/mocks.ts` | Mod | api | Ring 4 test double | OA, security | Implements the widened port. |
| `server/src/db/schema/ci.ts` | Mod | api | db | drizzle-orm-patterns, postgresql-table-design | Add-only. A new NOT NULL column needs a default (`server/INSIGHTS.md:88`). |
| `server/src/db/migrations/00NN_*.sql` + `meta/*` | New (generated) | api | db | postgresql-table-design | Only via `pnpm db:generate`. |
| `server/src/platform/config.ts` | Mod | api | Ring 4 | OA, security | The new env var is `.optional()` with a computed default (`server/INSIGHTS.md:105`). |
| `server/src/adapters/runner-bundle/fs.ts` | New | api | Ring 4 | OA, security | Reads only under the configured dir. |
| `server/src/modules/ci/types.ts` | New | api | Ring 2 (module-local port, like `repo-intel/types.ts`) | OA | — |
| `server/package.json`, `server/pnpm-lock.yaml` | Mod via `pnpm add yaml` | api | — | security | Change the lock only through pnpm. |

### Wave 2 — Lane L2 (server `ci` module)

| File | New/Mod | Pkg | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/modules/ci/constants.ts` | New | api | Ring 1 | OA | — |
| `server/src/modules/ci/helpers/{slug,manifest,workflow,validate-workflow,bundle,ingest,dto}.ts` | New | api | Ring 1 (pure) | OA (security reviewer scope for workflow and validate) | `helpers/` files are NOT guarded by `core-not-to-io`, because RING1 only matches `<module>/helpers.ts` (`server/INSIGHTS.md:60`). Keep them I/O-free by hand. |
| `server/src/modules/ci/repository.ts` | New | api | Ring 3 | OA, drizzle-orm-patterns | Workspace scope goes through `agents`/`repos`, because tenancy is transitive (`server/src/db/schema/ci.ts:4-12`, `server/INSIGHTS.md:54`). |
| `server/src/modules/ci/service.ts` | New | api | Ring 3 | OA, security | Inject ports, not `Container` (`server/INSIGHTS.md:52`). Do not import `adapters/` (Ban 2). |
| `server/src/modules/ci/ingest.ts` | New | api | Ring 3 | OA (security reviewer scope) | Same rules as `service.ts`. |
| `server/src/modules/ci/routes.ts` | New | api | Ring 4 | OA, fastify-best-practices, security | No Drizzle (Ban 1). Schema-first. A body-less POST arrives as `null` (`server/INSIGHTS.md:109`). |
| `server/src/modules/index.ts` | Mod (+1 import, +1 entry) | api | registry | OA | Static registration. |

### Wave 2 — Lane L3 (agent-runner)

| File | New/Mod | Home | Skills | Constraint to respect |
|---|---|---|---|---|
| `agent-runner/src/{manifest.ts,context.ts,run.ts,artifact.ts,index.ts}` | Mod | runner | **unrouted** | Keep the reviewer-core invariants (`agent-runner/CLAUDE.md`). Keep the single hard-fail catch (`run.ts:26-33`). The trusted task slot gets no PR text (`server/INSIGHTS.md:74`). |
| `agent-runner/src/{manifest,run}.test.ts` | Mod **only if broken by the change** | runner | unrouted | Decision 1 exception. Example: `run.test.ts:354` expects the old task line `'Review PR #42: Add feature X'`. Single-manifest fixtures may need an env manifest path. Adjust the expectations; add no cases. |
| `agent-runner/README.md` (env table) | Mod | docs | unrouted | — |

### Wave 2 — Lane L4 (client)

| File | New/Mod | Home | Skills | Constraint to respect |
|---|---|---|---|---|
| `client/src/lib/api.ts` | Mod | lib | FUA, security | The only API entry point (`client/CLAUDE.md`). |
| `client/src/lib/hooks/ci.ts` | New | lib/hooks | FUA, react-best-practices | 4xx answers → `meta.quietError` (`client/INSIGHTS.md:23`). |
| `client/messages/en/ci.json` | Mod | i18n | FUA | A missing key renders as the raw key (`client/INSIGHTS.md:35`). |
| `client/src/vendor/ui/nav.ts` | Mod | nav | FUA | `activeKeyFor` already maps `/ci-runs` (`client/INSIGHTS.md:38`). |
| `client/src/components/CiRunsTable/{CiRunsTable.tsx,constants.ts,helpers.ts,styles.ts,index.ts}` | New | shared (2 consumers) | FUA, react-best-practices | `COLUMN_KEYS` and `GRID` stay aligned (`client/INSIGHTS.md:34`). Use `formatCost` (`client/INSIGHTS.md:9`). |
| `client/src/app/ci-runs/page.tsx` | New | route entry | FUA, next-best-practices | Thin and static. No `useSearchParams` (`client/src/app/eval/page.tsx` comment). |
| `client/src/app/ci-runs/_components/CiRunsView/{CiRunsView.tsx,styles.ts,index.ts}` | New | route-local | FUA, react-best-practices | — |
| `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}` | Mod | route-local | FUA | — |
| `.../AgentEditor/_components/ConfigTab/{ConfigTab.tsx,constants.ts}` | Mod | route-local | FUA, react-best-practices | Remove the CI gate control and remove `ci_fail_on` from the save patch. |
| `.../AgentEditor/_components/CiTab/{CiTab.tsx,constants.ts,helpers.ts,styles.ts,index.ts}` | New | route-local | FUA, react-best-practices | — |
| `.../CiTab/_components/ExportWizard/**` (component, `TargetStep`/`PreviewStep`/`ConfigureStep`/`InstallStep`, helpers, constants, styles, index) | New | route-local | FUA, react-best-practices | Never define a component inside another's render. No effects for derived state. |
| `.../AgentEditor/AgentEditor.test.tsx`, other existing client tests | Mod **only if broken** | — | react-testing-library | Decision 1 exception. Example: a `vi.mock("@/lib/hooks/...")` factory that needs a stub for a new hook (`client/INSIGHTS.md:62`). |

**Coverage gaps (unrouted)**:
- all of `agent-runner/**`, plus `agent-runner/README.md`;
- the generated workflow string in `server/src/modules/ci/helpers/workflow.ts`, which is routed only to OA because `security` covers `{routes,service}.ts`.

The review pipeline names all of these explicitly.

---

## Contract changes

- **vendor/shared: YES**, lock-step, done only by L1.
  - Rewrite the "Export-to-CI + CI Runs" section in `eval-ci.ts` (`server/src/vendor/shared/contracts/eval-ci.ts:411-520`).
  - Widen `GitHubClient` in `adapters.ts`.
  - Put the enums first in the section. `CiFailOn` and `Provider` are already imported from `knowledge.js`.
- **Migration: YES.**
  - Add-only columns and indexes on `ci_installations` and `ci_runs` (W3).
  - Generate with `cd server && pnpm db:generate`.
  - Integration applies it to the dev DB with `pnpm db:migrate`.
  - The existing `*.it.test.ts` apply all migrations via testcontainers (`server/test/helpers/pg.ts`), so they exercise the new migration too.
- **Seed: NO.** Installations come from a real GitHub install and runs come from GitHub Actions. A seeded row would claim a deployment that does not exist. The empty states (AC-2, AC-38) are the clean-checkout result.
- **Client build check: no value import planned.** Every `@devdigest/shared` import stays `import type` (`client/INSIGHTS.md:22`). `pnpm build` in `client/` is still required, because the change adds a new App Router page.
- **i18n: YES.**
  - `client/messages/en/ci.json`: delete `publishDialog` and `exportWizard.blockMergeTitle/blockMergeDesc`, and add the AC strings.
  - The tab label reuses `agents.editor.tabs.ci`.
  - The select options reuse `agents.config.ciFailOnOptions.*`.

---

## Work items

Every item ends with the lane running its **Verify** commands once, after the item's last edit, and confirming the **Done means** by reading its own diff against the cited AC. No item writes a test.

### W0 — Preflight (enabling; run by L1 first)
- **Serves:** enables every AC. No package in the worktree has `node_modules`.
- **Do:**
  1. `cd reviewer-core && npm ci`. Use npm here: reviewer-core has a `package-lock.json`, and the server and the runner resolve its bare imports from `reviewer-core/node_modules` (`server/INSIGHTS.md:17`, `agent-runner/insights/INSIGHTS.md:14`).
  2. `cd server && pnpm install`.
  3. `cd client && pnpm install`.
- **Done means:**
  - `node scripts/verify.mjs server` and `node scripts/verify.mjs client` are green on the untouched tree.
  - The arch:check baseline is recorded. It is a delta measure: 20 warnings / 0 errors per `server/INSIGHTS.md:9`.
- **Verify:** the two commands above.

### W1 — Contracts: rewrite the CI section of `eval-ci.ts` (both copies)
- **Serves:** AC-7, AC-8, AC-11, AC-14, AC-29, AC-31..AC-37 (wire shapes), NFR-3 (no secret field).
- **Do:** Keep `CiTarget`. Replace the rest of the section with the following, in this order:
  - `CiTrigger = z.enum(['opened','synchronize','reopened'])`.
  - `CiPostAs = z.enum(['github_review','pr_comment','none'])`.
  - `CiTriggers`: array, min 1, unique, must include `synchronize`.
  - `CiPreviewInput = { repo_id: uuid, triggers, post_as }.strict()`.
  - `CiFile = { path, contents: string|null, editable, size_bytes }`.
  - `CiPreview = { files }`.
  - `CiExportInput = CiPreviewInput.extend({ target: z.literal('gha'), action: z.enum(['open_pr','zip']), workflow_contents: z.string().max(65_536).optional() }).strict()`.
  - `CiRunStatus = running|succeeded|failed|rejected`.
  - `CiRunVerdict = blocked|passed`.
  - `CiInstallation`:
    - existing: `id`, `agent_id`, `repo`, `target_type`, `installed_at`;
    - added: `repo_id`, `workflow_path`, `agent_slug`, `generator_version`, `agent_version`, `triggers`, `post_as`, `pr_url|null`, `last_run: {status, ran_at}|null`.
  - `CiInstallationList = { installations }`.
  - `CiExport = { installation, pr_url|null }`.
  - `CiRun = { id, repo, pr_number: int|null, pr_title|null, agent_id|null, agent_name, commit_sha, status, reason|null, verdict|null, critical|warning|suggestion: int|null, cost_usd|null, duration_ms|null, job_url, ran_at }`.
  - `CiRunList = { runs }`.
  - `CiRefreshResult = { ingested, rejected, failed, running, errors: [{repo, status: int|null, message}] }`.
  - `CiResultArtifact`:
    - keeps its existing fields;
    - `pr_number` becomes required;
    - adds `repository`, `repository_id` (int), `commit_sha` (40-hex), `run_id` (int), `run_attempt` (int ≥ 1), `agent_slug`, `agent_version` (int), `ci_fail_on`, `gate_triggered` (bool), `blockers` (int);
    - `.strict()`.
  - `AgentManifest` adds `agent_version: z.number().int().positive()`.
  - Remove `CiExportInputBody` and `AgentManifestInput` if `grep` finds no user.
- **Files:** both `contracts/eval-ci.ts` copies.
- **Done means:**
  - Both copies are byte-identical.
  - Server and client typecheck are clean.
  - The existing `vendor-shared-sync` tests in both packages pass.
  - No CI schema has a key matching `/key|token|secret/i`, confirmed by reading (NFR-3).
  - The exception applies if `server/test/contracts.test.ts` or `eval-contracts.test.ts` breaks on a changed shape: fix the fixture only (`server/INSIGHTS.md:103`, `:112`).
  - Agent-runner fixtures are L3's job; L1 does not touch them.
- **Verify:** `node scripts/verify.mjs server` and `node scripts/verify.mjs client`.
- **Rules:** zod `object-strict-vs-strip`, `type-export-schemas-and-types`.
- **Risk:** low.

### W2 — GitHub port + Octokit adapter + mock
- **Serves:** AC-13, AC-16, AC-30, AC-31, AC-32.
- **Do:**
  - **Both `adapters.ts`:**
    - `CommitFilesPayload.resetToBase?: boolean`. When it is true, the parent is the head of `base` and the branch ref is force-moved.
    - Add to `GitHubClient`:
      - `getRepository(repo) → { id, default_branch }`.
      - `listWorkflowRuns(repo, workflowFile, { perPage }) → WorkflowRunMeta[]`. Return `[]` on 404.
      - `findPullNumberForCommit(repo, sha) → number|null`.
      - `getPullRequestTitle(repo, n) → string`.
      - `downloadRunArtifact(repo, runId, { artifactName, fileName, maxBytes }) → {status:'absent'} | {status:'too_large'} | {status:'ok', text}`.
    - `WorkflowRunMeta = { id, run_attempt, status, conclusion, head_sha, html_url, repository_id, pr_numbers: number[], created_at, run_started_at|null }`.
  - **`octokit.ts`:**
    - Use `rest.repos.get`, `rest.actions.listWorkflowRuns({ workflow_id: file })`, `rest.repos.listPullRequestsAssociatedWithCommit`, `rest.pulls.get`, `rest.actions.listWorkflowRunArtifacts({ name })` and `rest.actions.downloadArtifact({ archive_format: 'zip' })`.
    - `expired` or missing → `absent`. A zipped `size_in_bytes` over 1 MB → `too_large`, with no download.
    - Unzip with `fflate.unzipSync` and a `filter` that accepts only `fileName` with `originalSize <= maxBytes`. The filter runs before inflation (`server/INSIGHTS.md:10`).
    - `commitFiles` goes through `git.createBlob` for each file, then a tree of blob SHAs. Honour `resetToBase`.
    - **Never write a ref other than `heads/<payload.branch>`.**
  - **`mocks.ts`:** implement all new methods with configurable fixtures, and record `resetToBase`.
  - Existing inline `GitHubClient` object literals in `server/test/intent.it.test.ts:192` and `brief.it.test.ts` are outside typecheck and do not call the new methods. Leave them alone unless they break at runtime.
- **Files:** both `adapters.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`.
- **Done means:**
  - Server and client typecheck are clean.
  - The existing `server/test/adapters.test.ts` passes.
  - Code reading confirms that no code path in `commitFiles` writes a ref other than `heads/${payload.branch}`.
- **Verify:** `node scripts/verify.mjs server` and `node scripts/verify.mjs client`.
- **Risk — UNVERIFIED externals (need a real-repo smoke test after merge):**
  - the `downloadArtifact` return shape in octokit v4 (it probably follows the 302 and yields an `ArrayBuffer`; otherwise read `Location` with `request: { redirect: 'manual' }`);
  - a 404 for a missing workflow file;
  - `listPullRequestsAssociatedWithCommit` for fork PRs;
  - the run fields `html_url` and `run_started_at`.

### W3 — DB schema: extend `ci_installations` and `ci_runs` (generated migration)
- **Serves:** AC-8, AC-14, AC-30, AC-32..AC-36.
- **Do:** In `server/src/db/schema/ci.ts`, **add only**:
  - **`ci_installations`:**
    - `repoId` uuid → repos, cascade. Nullable: the table pre-exists, but every new row sets it.
    - `workflowPath` text notNull default `''`.
    - `agentSlug` text notNull default `''`.
    - `generatorVersion` int notNull default 1.
    - `agentVersion` int notNull default 1.
    - `triggers` jsonb `string[]` notNull default `[]`.
    - `postAs` text enum notNull default `'github_review'`.
    - `prUrl` text nullable.
    - `files` jsonb `{path, kind:'manifest'|'workflow'|'skill', skill_id?}[]` notNull default `[]`.
    - unique `(agentId, repoId)` and an index on `repoId`.
  - **`ci_runs`:**
    - `agentRunId` uuid → agent_runs, cascade, unique.
    - `githubRunId` bigint (number).
    - `runAttempt` int.
    - `repositoryId` bigint (number).
    - `commitSha`, `prTitle`, `reason` (text).
    - `verdict` enum `blocked|passed`.
    - `critical`, `warning`, `suggestion`, `durationMs` (int).
    - unique `(ciInstallationId, githubRunId)`.
  - Then run `pnpm db:generate`. Do not touch `agent_runs`: it already has `source` (`local|ci`), `blockers` and `findingsCount` (`server/src/db/schema/runs.ts:38-44`).
- **Files:** `server/src/db/schema/ci.ts`, the generated SQL, `meta/_journal.json` and the snapshot.
- **Done means:**
  - The SQL holds only `ADD COLUMN` and `CREATE INDEX`.
  - Typecheck is clean.
  - An existing DB-backed suite migrates and passes with **0 skipped**. From `server/`, run `pnpm exec vitest run test/agents-versions.it.test.ts`.
- **Verify:** `node scripts/verify.mjs server`, plus that command.
- **Risk:** the drizzle-kit rename prompt (`server/INSIGHTS.md:88`). Add-only changes avoid it. L1 runs alone in its wave.

### W4 — Config + runner-bundle source + `yaml` dependency
- **Serves:** AC-7 (runner files), AC-16 (`runner_bundle_missing`).
- **Do:**
  - `config.ts`: `DEVDIGEST_RUNNER_DIST` (optional) → `AppConfig.runnerDistDir`, default `resolve(process.cwd(), '../agent-runner/dist')`.
  - `modules/ci/types.ts`: `RunnerBundleSource { list(): Promise<{path, contents, size_bytes}[] | null> }`.
  - `adapters/runner-bundle/fs.ts` (`FsRunnerBundle`):
    - recursively lists the dir, sorted, `/`-separated;
    - returns `null` if the dir is missing or has no `index.js`.
  - `cd server && pnpm add yaml@^2`.
- **Files:** `server/src/platform/config.ts`, `server/src/modules/ci/types.ts`, `server/src/adapters/runner-bundle/fs.ts`, `server/package.json`, `server/pnpm-lock.yaml`.
- **Done means:**
  - Typecheck is clean.
  - Code reading confirms that the paths are normalised to `/` (Windows) and that `null` is returned on a missing dir.
  - An `arch:check` `no-orphans` warning for `fs.ts` is expected until L2 wires it.
- **Verify:** `node scripts/verify.mjs server`.

---

### W5 — Pure CI rules: slug, manifest, workflow generator, validator, zip
- **Serves:** AC-7, AC-8, AC-11, AC-15, AC-18..AC-26.
- **Do:**
  - **`constants.ts`:**
    - `CI_GENERATOR_VERSION = 1`, `CI_BRANCH = 'devdigest/ci'`, `CI_PR_TITLE = 'Add DevDigest CI review'`.
    - `CHECKOUT_SHA = '11d5960a326750d5838078e36cf38b85af677262'` (v4.4.0).
    - `UPLOAD_ARTIFACT_SHA = 'ea165f8d65b6e75b540449e92b4886f43607fa02'` (v4.6.2).
    - `CI_ARTIFACT_MAX_BYTES = 65_536`, `CI_RUNS_LIMIT = 50`.
    - The two fixed log lines from AC-24 and AC-25.
  - **`helpers/slug.ts`:**
    - `kebab(name)`: lowercase, runs of non-`[a-z0-9]` become `-`, dashes trimmed. An empty result becomes `agent-<id8>` or `skill-<id8>`.
    - Path builders for `.devdigest/agents/<slug>.yaml`, `.devdigest/skills/<slug>.md`, `.github/workflows/devdigest-review-<slug>.yml`, `.devdigest/memory.jsonl` and `.devdigest/runner/<rel>`.
  - **`helpers/manifest.ts`:** `renderManifest(agent, slugs)` uses `yaml.stringify` to produce an `AgentManifest`-valid object:
    - `provider: 'openrouter'`, `name`, `model`, `system_prompt`, `strategy`, `ci_fail_on`;
    - `agent_version: agent.version`;
    - skills in link order.
  - **`helpers/workflow.ts`:** `renderWorkflow({ slug, triggers, postAs })` is a deterministic template. This structure is load-bearing for AC-18..26:
    ```yaml
    name: DevDigest Review (<slug>)
    on:
      pull_request:
        types: [<selected, in fixed order opened, synchronize, reopened>]
    permissions:
      contents: read
      pull-requests: write        # `read` when postAs === 'none' (runner still reads the PR diff)
    concurrency:
      group: devdigest-<slug>-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    jobs:
      review:
        name: DevDigest Review (<slug>)
        runs-on: ubuntu-latest
        steps:
          - name: Refuse fork pull requests
            if: github.event.pull_request.head.repo.full_name != github.repository
            run: |
              echo "Fork PRs are not reviewed by DevDigest — maintainer review required"
              exit 1
          - name: Check out the base commit
            uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
            with:
              ref: ${{ github.event.pull_request.base.sha }}
              persist-credentials: false
          - name: Skip while DevDigest is being installed
            if: hashFiles('.devdigest/runner/index.js') == ''
            run: echo "DevDigest is being installed — review skipped"
          - name: DevDigest review
            if: hashFiles('.devdigest/runner/index.js') != ''
            run: node .devdigest/runner/index.js
            env:
              OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
              DEVDIGEST_MANIFEST: .devdigest/agents/<slug>.yaml
              DEVDIGEST_POST_AS: <postAs>
          - name: Upload DevDigest result
            if: always()
            uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
            with:
              name: devdigest-result
              path: devdigest-result.json
              if-no-files-found: ignore
    ```
  - **`helpers/validate-workflow.ts`:** `validateWorkflow(text) → {ok:true} | {ok:false, reason}`. The possible reasons:
    - `yaml_parse_error`: the text does not parse, or the root is not a mapping.
    - `pull_request_target`: found by a recursive key walk that also covers string and array forms of `on`.
    - `permission_not_allowed`: any top-level or job-level `permissions` that matches one of these:
      - is a string (`write-all` / `read-all`);
      - has a key outside {`contents`, `pull-requests`} whose value is not `none`;
      - has `contents` not in `read|none`;
      - has `pull-requests` not in `read|write|none`.
    - A missing `permissions` block is not checked (Spec follow-up 4).
  - **`helpers/bundle.ts`:**
    - `assembleFiles(...)` returns ordered `CiFile[]`: manifest, skills, memory (`''`, size 0), runner files (`contents: null`, `editable: false` in preview), and the workflow last (`editable: true`).
    - `zipFiles(files)` uses `fflate.zipSync`.
- **Files:** `server/src/modules/ci/{constants.ts,helpers/slug.ts,helpers/manifest.ts,helpers/workflow.ts,helpers/validate-workflow.ts,helpers/bundle.ts}`.
- **Done means:**
  - Typecheck is clean.
  - The existing unit suite is green.
  - **Code reading of `workflow.ts` against AC-18..26, item by item:**
    - only `pull_request`, with the selected types;
    - the permission map per `postAs`;
    - both `uses:` pinned to the two 40-hex SHAs;
    - checkout `with` has `ref` = base sha and `persist-credentials: false`;
    - the review step's `run` and its 4-key `env` are exact;
    - no `run:` contains `${{ github.event.`;
    - the fork step is first, exits 1 and comes before every `secrets.` reference;
    - the fallback step echoes its line and exits 0;
    - job name, concurrency and upload `if: always()` / `if-no-files-found: ignore` are present;
    - `ubuntu-latest`, no setup-node.
  - **Runtime check (M):** from `server/`, run a throwaway `pnpm exec tsx -e` that imports `renderWorkflow` and `validateWorkflow` by path. Print the YAML for `github_review` and for `none`. Print `validateWorkflow` of that output (expect ok), of the output with `pull_request_target:` appended, and of the output with `contents: write`. Delete nothing; the script is not saved to the repo (precedent `server/INSIGHTS.md:12`).
- **Verify:** `node scripts/verify.mjs server`, plus the tsx runtime check.
- **Rules:** onion §1 (ring 1). Note the helpers-folder guard gap.
- **Risk:** medium. This file is the security surface.

### W6 — Repository + export service (preview, export, installations)
- **Serves:** AC-5 (server data), AC-6, AC-7, AC-8, AC-13, AC-14, AC-15, AC-16, AC-17.
- **Do:**
  - **`CiRepository(db)`**, scoping every query through `agents.workspace_id` / `repos.workspace_id`:
    - `repoInWorkspace`;
    - `installationFor(agentId, repoId)`;
    - `installationsInRepo(repoId)`;
    - `upsertInstallation`: `onConflictDoUpdate` on (agent_id, repo_id) with `installedAt = now`. **`agentSlug` stays out of the update set.**
    - `listInstallations(ws, agentId)`: joined with `repos.full_name` and the newest `ci_runs` row for `last_run`.
  - **`CiService`**, constructed with `{ repo, agents: Pick<AgentsRepository,'getById'|'linkedSkills'>, github: () => Promise<GitHubClient>, bundle: RunnerBundleSource }`. Never pass `Container`.
  - **`preview(ws, agentId, input)`**, checks in this order:
    1. Agent not in the workspace → 404.
    2. Repo not in the workspace → 404 (AC-17).
    3. `provider !== 'openrouter'` → `AppError('provider_not_supported', 'CI runs through OpenRouter — switch this agent's provider to OpenRouter to export.', 422)`.
    4. Slug: the stored `agentSlug` of the (agent, repo) installation, otherwise `kebab(name)`.
    5. Enabled linked skills, in link order.
    6. Conflicts:
       - an own path recorded by another agent's installation in the same repo;
       - a skill path recorded with a different `skill_id`;
       - two own skills with the same slug.
       Each → `AppError('slug_conflict', '<path> is already used by another agent or skill exported to <owner/name>.', 409, { path })`.
    7. `bundle.list()` is `null` → `AppError('runner_bundle_missing', …, 500)`.
  - **`export(ws, agentId, input)`:**
    - Rebuild the files exactly as `preview` does. The workflow is `workflow_contents ?? generated`.
    - Run `validateWorkflow`. A failure → `AppError('workflow_invalid', …, 422, { reason })`.
    - **zip:** zip with the runner contents, upsert with `prUrl: null`, then return the bytes and `devdigest-ci-<slug>.zip`.
    - **open_pr:**
      1. `gh.getRepository` → `default_branch`. Never use `repos.default_branch` (`server/INSIGHTS.md:30`).
      2. `findOpenPr(CI_BRANCH)`.
      3. If a PR is open: `commitFiles` on the branch, and return that PR's URL.
      4. Otherwise: `commitFiles({ resetToBase: true })`, then `openPullRequest({ title: CI_PR_TITLE, head: CI_BRANCH, base: default_branch })`.
      5. Upsert the installation, recording `files` with skill ids, `agentVersion`, `generatorVersion`, `triggers`, `postAs` and `prUrl`.
    - A GitHub port error → `AppError('github_error', …, 502, { status, message })`. Read the error duck-typed; do not import Octokit types into ring 3.
  - **`installations(ws, agentId)`:** a foreign agent → 404.
- **Files:** `server/src/modules/ci/{repository.ts,service.ts,helpers/dto.ts}`.
- **Done means:**
  - Typecheck is clean.
  - `arch:check` shows no new violation against the W0 baseline: `service.ts` imports neither `adapters/` nor `platform/container`.
  - Code reading confirms the 404 → 422 → 409 → 500 order, the frozen slug, and that only `heads/devdigest/ci` is ever written.
- **Verify:** `node scripts/verify.mjs server`.
- **Risk:** medium. A `repo_id`-only query without the workspace join would leak data across workspaces.

### W7 — Routes + registration
- **Serves:** AC-6, AC-7, AC-11, AC-15, AC-16, AC-17 (HTTP surface).
- **Do:**
  - **`routes.ts`** composes the service: `new CiService({ repo: new CiRepository(app.container.db), agents: app.container.agentsRepo, github: () => app.container.github(), bundle: new FsRunnerBundle(app.container.config.runnerDistDir) })`.
  - Endpoints:
    - `POST /agents/:id/ci/preview`, body `CiPreviewInput`.
    - `POST /agents/:id/export-ci`, body `CiExportInput`. For zip: `reply.type('application/zip').header('content-disposition', 'attachment; filename="devdigest-ci-<slug>.zip"').send(Buffer.from(bytes))`. Otherwise JSON `CiExport`.
    - `GET /agents/:id/ci/installations`.
  - Add one import and one `ci` entry in `server/src/modules/index.ts`.
- **Files:** `server/src/modules/ci/routes.ts`, `server/src/modules/index.ts`.
- **Done means:**
  - Typecheck is clean, the existing unit suite is green, and `arch:check` shows no new violation (the `fs.ts` orphan warning from W4 is gone).
  - **Runtime check (M), when Docker and the dev API are available:**
    - With `agent-runner/dist` absent: `POST /agents/<openrouter agent>/ci/preview` → 500 `runner_bundle_missing`.
    - After L3 has built the dist: preview → the file set per AC-7.
    - An openai agent → 422.
    - `export-ci` with `action: zip` and an edited workflow containing `pull_request_target` → 422 `workflow_invalid` with that reason.
    - A valid zip export → the unzipped paths equal the preview's.
  - If the dev stack is not available, the lane says so and relies on code reading.
- **Verify:** `node scripts/verify.mjs server`, plus the optional runtime check.

### W8 — Ingest: refresh + CI runs list
- **Serves:** AC-17 (runs), AC-30..AC-36, NFR-3 (server log half by construction).
- **Do:**
  - **`helpers/ingest.ts` (pure):**
    - `checkArtifact(text, meta)`:
      - over 65,536 bytes, failed JSON, or failed strict `CiResultArtifact` → `rejected/artifact_invalid`;
      - a mismatch with GitHub's repository id, head sha, PR number (when known), run id or attempt → `rejected/identity_mismatch`.
    - `mapRun(meta, artifact)`:
      - not completed → `running`;
      - completed with no artifact → `failed`, with reason = `conclusion`;
      - completed and valid → `succeeded`, verdict `blocked`/`passed` from `gate_triggered`, with counts, cost, duration and blockers;
      - `rejected` and `failed` carry null counts and cost.
  - **Repository additions:**
    - `workspaceInstallations(ws)`;
    - `ciRunByRunId`;
    - a transactional insert that writes:
      - an `agent_runs` row: workspace = the agent's, `agentId`, **`prId: null`**, `source: 'ci'`, `ranAt` = `run_started_at ?? created_at`, `provider: 'openrouter'`, `durationMs`, `costUsd`, `findingsCount`, `blockers`, `status`;
      - plus the `ci_runs` detail row;
    - an in-place update of both rows;
    - `listRuns(ws, agentId?)`: through installation → agent with the workspace filter, `desc(ranAt)`, limit 50.
    - `agent_runs.status` is `null` while the run is running (A2). The status of record is `ci_runs.status`.
  - **`CiIngestService` (`ingest.ts`)**, constructed with `{ repo, github, log? }`. `refresh(ws)` works like this:
    1. Loop over the workspace's installations and call `listWorkflowRuns(basename(workflow_path), { perPage: 50 })`.
    2. Skip a run whose stored row has the same attempt and is not `running`.
    3. PR number = `pr_numbers[0] ?? findPullNumberForCommit(head_sha) ?? null`.
    4. If the run is completed: `downloadRunArtifact(…, { artifactName: 'devdigest-result', fileName: 'devdigest-result.json', maxBytes: 65_536 })`.
    5. Get the title via `getPullRequestTitle`, cached per refresh.
    6. `mapRun`, then upsert.
    7. A GitHub error or a missing token for one installation becomes an `errors[]` entry, and the loop continues. **`refresh` never throws** (AC-35).
    8. Never log a token or a secret value.
  - `listRuns`: a foreign `agent_id` → 404.
  - **Routes:**
    - `POST /ci/refresh`, with no body schema (`server/INSIGHTS.md:109`).
    - `GET /ci/runs?agent_id=` (optional uuid).
- **Files:** `server/src/modules/ci/{helpers/ingest.ts,ingest.ts,repository.ts,routes.ts,helpers/dto.ts}`.
- **Done means:**
  - Typecheck, the unit suite and arch:check are clean.
  - Code reading confirms:
    - identity values are taken from `WorkflowRunMeta` and the pulls API, never from the artifact (AC-31);
    - the size check comes before `JSON.parse`;
    - `prId` is null and `source` is `'ci'` (AC-34);
    - every list and refresh query joins `agents.workspace_id` (AC-36, AC-17);
    - the limit is 50 and the order is desc.
  - Existing readers that must stay unaffected:
    - `pulls/routes.ts:163-171` filters by `prId` and `status='done'`;
    - `reviews/repository/run.repo.ts:22-50` filters by `prId`;
    - `skills/repository.ts:249-257` joins `run_skills`, which has no CI rows.
  - The full existing integration lane stays green with 0 skipped (the AC-34 "PR list unchanged" part).
- **Verify:** `node scripts/verify.mjs server`. Then, from `server/`, `pnpm exec vitest run .it.test --no-file-parallelism` as the lane's last step, checking 0 skipped (`server/INSIGHTS.md:114`).
- **Risk:** medium-high. Fork PR numbers and the artifact download shape are unverified (A7, W2).

### W9 — AC-1 server side and NFR-3 server review
- **Serves:** AC-1 (server half), NFR-3.
- **Do:**
  - No code change for AC-1. `PUT /agents/:id` already accepts `ci_fail_on` (`server/src/modules/agents/routes.ts:60`, `service.ts:110`), and `GET` returns it (`helpers.ts:24`). Confirm this by reading.
  - NFR-3: confirm by reading that no CI request schema, response DTO, DB column or log call carries `OPENROUTER_API_KEY` / `GITHUB_TOKEN` values. The studio never reads `OPENROUTER_API_KEY` for CI; it only puts the literal `${{ secrets.… }}` reference in the workflow text.
- **Files:** none, unless the reading finds a leak.
- **Done means:** the lane report cites the lines above and states "no secret-bearing field or log".
- **Verify:** none beyond L2's final verify.

---

### W15 — Runner loads only `DEVDIGEST_MANIFEST` (AC-27)
- **Serves:** AC-27, EC-1.
- **Do:**
  - Replace the single-manifest discovery (`agent-runner/src/manifest.ts:25-47`) with `loadManifestFromEnv(value, cwd, deps)`:
    - unset or empty → `RunnerError`;
    - otherwise resolve against `cwd`, then read, YAML-parse and validate with `AgentManifest`.
  - Call it first in `runCi`. The single catch already guarantees exit 1, no post and no artifact.
  - `index.ts` passes `env.DEVDIGEST_MANIFEST`.
- **Files:** `agent-runner/src/{manifest.ts,run.ts,index.ts}`. Existing `manifest.test.ts` / `run.test.ts` change only if broken (exception).
- **Done means:**
  - typecheck is green;
  - the existing tests are green, with any adjustment listed;
  - code reading shows that no path to `writeFile` or a POST exists before a successful manifest load.
- **Verify:** `cd agent-runner && pnpm install && pnpm typecheck && pnpm test`. Needs W0's `reviewer-core/node_modules` (`agent-runner/insights/INSIGHTS.md:14`).

### W16 — Trusted task slot without PR title (AC-28)
- **Serves:** AC-28, EC-5.
- **Do:** In `run.ts:118-127`:
  - `task: \`Review pull request #${ctx.prNumber}.\``;
  - `prDescription: \`Title: ${ctx.title}\n\n${ctx.body}\``. `reviewPullRequest`/`assemblePrompt` wrap it as `pr-description`.
  - Precedent: `server/src/modules/eval/helpers/prompt.ts:16,38`. Re-implement it here; the runner cannot import the server.
- **Files:** `agent-runner/src/run.ts`, and `run.test.ts:354` only to update the now-wrong expected task string (exception).
- **Done means:** code reading shows the task contains only fixed words + the integer, and the title travels only in `prDescription`. Tests are green.
- **Verify:** as W15.

### W17 — Artifact identity + secrets hygiene + build (AC-29, NFR-3)
- **Serves:** AC-29, NFR-3 (runner half).
- **Do:**
  - **`context.ts`** resolves the identity before the LLM call. A missing value is a hard fail.
    - `repository = GITHUB_REPOSITORY`.
    - `repository_id`, `run_id`, `run_attempt` = `Number(GITHUB_REPOSITORY_ID | GITHUB_RUN_ID | GITHUB_RUN_ATTEMPT)`.
    - `commit_sha` = the event's `pull_request.head.sha`, **not** `GITHUB_SHA` (A9).
  - **`artifact.ts`** adds:
    - `agent_slug` = the basename of `DEVDIGEST_MANIFEST` without the extension;
    - `agent_version` and `ci_fail_on` from the manifest;
    - `gate_triggered`, `blockers` and `pr_number`;
    - and keeps the strict `safeParse` self-check.
  - **`index.ts`:** log lines print counts and error messages only.
  - **README env table:**
    - `DEVDIGEST_MANIFEST` is required;
    - add `GITHUB_REPOSITORY_ID`, `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT` (auto-provided);
    - drop the "exactly one manifest" wording.
  - Finish with `pnpm build`.
- **Files:** `agent-runner/src/{context.ts,artifact.ts,run.ts,index.ts}`, `agent-runner/README.md`. Existing `run.test.ts` fixtures get the new env and payload fields **only** where the strict artifact now fails them (exception).
- **Done means:**
  - typecheck, the existing tests and `pnpm build` are green, and `dist/index.js` exists;
  - code reading shows every field the spec lists is written from env or event, and no secret value reaches `console.*`, the artifact or a posted body.
  - **Runtime check (M):**
    1. Run `node dist/index.js` with sentinel `OPENROUTER_API_KEY=SENTINEL_OR` and `GITHUB_TOKEN=SENTINEL_GH`, `DEVDIGEST_MANIFEST` unset, and stdout and stderr captured to a scratch file outside the repo.
    2. Expect exit 1, no `devdigest-result.json`, and neither sentinel in the output.
- **Verify:** `cd agent-runner && pnpm typecheck && pnpm test && pnpm build`, plus the runtime check.

---

### W10 — Client data layer: blob download, `lib/hooks/ci.ts`, `ci.json`, sidebar
- **Serves:** AC-3, AC-12, AC-35, AC-37 (data and nav), NFR-1.
- **Do:**
  - **`lib/api.ts`:** `apiFetchBlob(path, init) → { blob, fileName }`. It reads `content-disposition` and parses errors into `ApiError` exactly like `apiFetch` does.
  - **`lib/hooks/ci.ts`** (type-only shared imports):
    - `ciKeys`;
    - `useCiInstallations(agentId)`;
    - `useCiRuns(agentId?)`;
    - `useCiPreview(agentId, input|null)`: a query that POSTs, enabled only with input;
    - `useExportCi(agentId)`: zip goes through `apiFetchBlob` plus an object-URL download; `meta.quietError`; invalidates the installations;
    - `useRefreshCi()`: `meta.quietError`; invalidates runs and installations.
  - **`ci.json`:**
    - delete `publishDialog` and `exportWizard.blockMergeTitle/blockMergeDesc`;
    - add every string quoted by AC-1 ("Fail CI on"), AC-2, AC-3, AC-6, AC-9, AC-10, AC-12, AC-35, AC-37 (11 headers, statuses, verdicts, "GitHub Actions", "Job ↗") and AC-38.
  - **`vendor/ui/nav.ts`:** a `GLOBAL` section with `{ key: "ci-runs", label: "CI Runs", icon: "Workflow", href: "/ci-runs" }` (`chrome.jsx:15-20`).
- **Files:** `client/src/lib/api.ts`, `client/src/lib/hooks/ci.ts`, `client/messages/en/ci.json`, `client/src/vendor/ui/nav.ts`.
- **Done means:**
  - Typecheck is clean.
  - `grep -n "publishDialog\|blockMerge" client/messages/en/ci.json` is empty.
  - Every `t("…")` key used by L4 components exists in `ci.json` or `agents.json`. The lane checks this with a `grep -o 't("[^"]*")'` cross-check at the end of W13.
- **Verify:** `node scripts/verify.mjs client` (typecheck + existing suite).

### W11 — CI Runs table (shared) + `/ci-runs` page
- **Serves:** AC-35, AC-37, AC-38.
- **Do:**
  - **`components/CiRunsTable`** has 11 aligned `COLUMN_KEYS`/`GRID` entries. The cells:
    - timestamp (`formatWhen`, mono);
    - repo (mono);
    - `#N` + the title as **plain text** with ellipsis;
    - agent (`Cpu`);
    - `Badge` "GitHub Actions" (`Workflow`);
    - duration or "—";
    - per-severity counts via `SEV` tokens, or "—";
    - `formatCost`;
    - verdict `Badge` (blocked → crit vars, passed → ok vars, else "—");
    - status `Badge` with a dot: Succeeded ok, Failed crit, Running accent, Rejected warn with `title={reason}`;
    - `MonoLink` "Job ↗" with `target="_blank" rel="noopener noreferrer"`.
    - Colours come from CSS vars only.
  - **`app/ci-runs/page.tsx`** is a thin page rendering `<CiRunsView/>`.
  - **`CiRunsView`:**
    - `AppShell` with crumb "CI Runs";
    - title and subtitle;
    - a secondary `Refresh` button (`RefreshCw`) that reads "Refreshing…" while pending;
    - an inline error box with `errors[].message` from the last refresh, shown **above** the still-rendered table;
    - `EmptyState` (`Workflow`, AC-38 texts, CTA → `/agents`) when the list is empty.
- **Files:** `client/src/components/CiRunsTable/*`, `client/src/app/ci-runs/page.tsx`, `client/src/app/ci-runs/_components/CiRunsView/*`.
- **Done means:**
  - Typecheck is clean and the existing suite is green.
  - Code reading confirms: the title is rendered as a React text child (never `dangerouslySetInnerHTML`), the link attributes are present, and the `COLUMN_KEYS.length === GRID` track count.
  - `grep -nE "#[0-9a-fA-F]{3,8}\b|rgb\(" client/src/components/CiRunsTable client/src/app/ci-runs` is empty (NFR-2).
- **Verify:** `node scripts/verify.mjs client`.

### W12 — Agent CI tab + Config tab change (AC-1..AC-3)
- **Serves:** AC-1, AC-2, AC-3.
- **Do:**
  - Add `{ key: "ci", labelKey: "editor.tabs.ci", icon: "Workflow" }` after `evals` in `AgentEditor/constants.ts`, and the `tab === "ci"` branch in `AgentEditor.tsx`.
  - **ConfigTab:** delete the CI gate `FormField` (~lines 111-115), the `ciFailOn` state and `ci_fail_on` in the save patch. Move `CI_FAIL_ON_VALUES` to `CiTab/constants.ts`.
  - **CiTab:**
    - A "Fail CI on" `FormField` + `SelectInput`, with labels from `agents.config.ciFailOnOptions.*`. On change, call `useUpdateAgent().mutate({ id, patch: { ci_fail_on } })`, which does `PUT /agents/:id`.
    - With 0 installations, an `EmptyState`: icon `Workflow`, "Not exported to CI", "Run this agent automatically on pull requests in CI.", CTA "Export to CI" → wizard.
    - Otherwise the screenshot-1 layout:
      - "CI deployment" with an ok `Badge` "Active in N repos";
      - "Update CI config" (secondary, `RefreshCw`) → wizard prefilled from the newest installation;
      - "Add to CI" (primary, `Plus`) → wizard on the active repo;
      - one row per installation: `GitBranch`, the repo (mono), `Badge` "GitHub Actions", last-run status `Badge` + relative time (`helpers.ts relativeTime(iso, now)`) or "no runs yet", and "workflow v{generator_version} · agent v{agent_version}";
      - a dashed "+ Add repository" row;
      - `<CiRunsTable>` fed by `useCiRuns(agent.id)`.
- **Files:** `AgentEditor/{constants.ts,AgentEditor.tsx}`, `ConfigTab/{ConfigTab.tsx,constants.ts}`, `CiTab/*`. `AgentEditor.test.tsx` changes only if broken (exception, `client/INSIGHTS.md:62`).
- **Done means:**
  - typecheck is clean and the existing suite is green, including `AgentEditor.test.tsx`;
  - `grep -n "ciFailOn\|config.ciFailOn\"" ConfigTab.tsx` is empty;
  - code reading matches every element of AC-2 and AC-3.
- **Verify:** `node scripts/verify.mjs client` in full, because `[id]` routes are missed by the related-files mode (`client/INSIGHTS.md:28`).

### W13 — Export wizard (Modal, 4 steps)
- **Serves:** AC-4, AC-5, AC-6 (client), AC-9, AC-10, AC-12, AC-16 (client).
- **Do:**
  - **ExportWizard shell:**
    - `ExportWizard({ agent, initial, onClose })` renders a `Modal` (width 720) titled "Export to CI", with subtitle "Run {name} automatically on pull requests" and `ExportWizardSteps` (Target/Preview/Configure/Install).
    - Footer: Back (step > 0) + "Continue →", or "✓ Install" on step 4.
    - Esc → `onClose`, with no mutation and no preview POST fired. Preview is enabled only from step 2.
    - The wizard owns its state: step, repoId, triggers, postAs, editedWorkflow, replacedNotice, lastError.
  - **TargetStep:**
    - A `useRepos()` picker.
    - Preselects the active repo (`useActiveRepo()`), or in update mode the newest installation's repo, with its triggers and post-as prefilled.
    - Shows one selected "GitHub Actions" card with "recommended" and "Runs on pull_request events".
    - Shows the AC-6 message when `agent.provider !== 'openrouter'` or when the preview answers `provider_not_supported`.
    - Continue is disabled with no repo or a wrong provider.
  - **PreviewStep:**
    - A "FILES TO CREATE" list, with the workflow selected by default.
    - A path header above the content.
    - The workflow is shown with an "editable" `Badge` in a `Textarea` bound to `editedWorkflow ?? previewed`.
    - Other files carry a "read-only" `Badge` in a `<pre>`.
    - Runner files (`contents === null`) show their formatted size and no code.
  - **ConfigureStep:**
    - `Chip`s: `opened` (toggle), `synchronize` (active, locked, `aria-disabled`), `reopened` (toggle).
    - A static "Secrets expected" table: `OPENROUTER_API_KEY` with its text and a warn pill, `GITHUB_TOKEN` with an ok pill. No request.
    - `role="radiogroup"` "Post results as", where Arrow keys move the selection. GitHub review is the default and is badged "recommended".
    - The merge-blocking info box.
    - Changing triggers or post-as while `editedWorkflow !== null` sets `editedWorkflow = null` and `replacedNotice = true` **in the handler**, not in an effect, and shows "Your workflow edits were replaced by the regenerated file."
  - **InstallStep:**
    - The AC-12 cards. "Open a PR" is the default; its body shows `{repo}` and `{N}` = the preview file count.
    - A docs link to the AC-12 URL (`target="_blank" rel="noopener noreferrer"`).
    - Install is disabled and reads "Installing…" while `isPending`.
    - On success, "View pull request ↗" links to `pr_url` in a new tab.
    - `workflow_contents` is sent only when the workflow was edited.
  - **Errors (AC-16):** `github_error`, `runner_bundle_missing`, `workflow_invalid` and `slug_conflict` render inline, with the docs link. Step, repo, configuration and `editedWorkflow` are kept.
- **Files:** `CiTab/_components/ExportWizard/**`.
- **Done means:**
  - typecheck is clean, the existing suite is green, and `pnpm build` passes (integration);
  - code reading maps each AC-4/5/6/9/10/12/16 clause to a line;
  - the `t()`-key cross-check against `ci.json` is clean;
  - the NFR-2 `grep` for hex and `rgb(` over `CiTab/` is empty.
  - **Runtime check (M), if the dev stack runs:**
    - open an agent → CI tab → walk all 4 steps;
    - Esc on step 1 shows no POST in the network panel;
    - `synchronize` cannot be turned off;
    - edit then toggle shows the notice.
- **Verify:** `node scripts/verify.mjs client`.
- **Risk:** medium. This is the largest client item; keep the step components small (FUA §3).

### W14 — Client final consistency pass (NFR-1, NFR-2)
- **Serves:** NFR-1, NFR-2.
- **Do:** No new code. Re-read every new client file against NFR-1 and NFR-2:
  - all strings via `useTranslations("ci")`, except the tab label in `agents`;
  - only vendored primitives (`Modal`, `ExportWizardSteps`, `Chip`, `Badge`, `FormField`, `EmptyState`, `Button`, `MonoLink`);
  - CSS vars only.
- **Done means:** the `grep` checks from W10, W11 and W13 are empty, and the full `node scripts/verify.mjs client` is green.
- **Verify:** `node scripts/verify.mjs client`.

---

## Execution

**Build lanes:** 4 implementers (user cap of 5 for writing the implementation).
**Fix loop:** separately capped at **2 implementer fix-mode dispatches**.
Reviewers and plan-verifier are read-only and are not counted.

| Wave | Lane | Executor | Work items | Files (disjoint) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|---|
| 1 | **L1 — contracts, port, DB, config** | implementer (build #1) | W0, W1, W2, W3, W4 | both `vendor/shared/{contracts/eval-ci.ts,adapters.ts}`; `server/src/adapters/{github/octokit.ts,mocks.ts,runner-bundle/fs.ts}`; `server/src/db/schema/ci.ts` + generated migration; `server/src/platform/config.ts`; `server/src/modules/ci/types.ts`; `server/package.json` + lock; installs (reviewer-core, server, client) | — | — | shared tree, **alone** (`db:generate`, installs) |
| 2 | **L2 — server `ci` module** | implementer (build #2) | W5, W6, W7, W8, W9 | `server/src/modules/ci/**` except `types.ts`; `server/src/modules/index.ts` | L1 | L3, L4 | shared tree |
| 2 | **L3 — agent-runner** | implementer (build #3) | W15, W16, W17 | `agent-runner/src/**` (existing tests only if broken), `agent-runner/README.md`, `agent-runner/node_modules`, `dist/` | L1 (W1: the runner aliases `server/src/vendor/shared`) | L2, L4 | shared tree |
| 2 | **L4 — client** | implementer (build #4) | W10, W11, W12, W13, W14 | `client/src/lib/{api.ts,hooks/ci.ts}`; `client/messages/en/ci.json`; `client/src/vendor/ui/nav.ts`; `client/src/components/CiRunsTable/**`; `client/src/app/ci-runs/**`; `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,_components/ConfigTab/**,_components/CiTab/**}` (existing tests only if broken) | L1 (client contract copy) | L2, L3 | shared tree |
| 3 | Integration | **caller (main session)** | — | none edited | L2, L3, L4 | — | — |
| 4 | Reviews | architecture-reviewer ∥ security-reviewer (read-only, not counted) | — | — | wave 3 | each other | — |
| 5 | **F1 — fix iteration 1** | implementer (fix #1) | merged wave-4 findings | as the findings name | wave 4 | — | shared tree, alone |
| 6 | Verify | plan-verifier (read-only, not counted) | — | — | F1 | — | — |
| 7 | **F2 — fix iteration 2 (only if needed)** | implementer (fix #2) | plan-verifier findings + still-open F1 findings | as named | wave 6 | — | shared tree, alone |
| 8 | Re-verify (optional) | plan-verifier (read-only, not counted) | — | — | F2 | — | — |

**Agent counts:**
- **Build implementers: 4** (L1–L4).
- **Fix implementers: at most 2** (F1, F2).
- **Maximum implementer dispatches: 6.** The build cap of 5 holds (4 used), and the fix-loop cap of 2 holds.
- After F2 (or after F1, if verification is clean), anything still open goes to the user. No further dispatches.

**Lane rules:**
- **No implementer writes a test.** Neither build lanes nor F1/F2 create a test file or add a test case.
- An EXISTING test may be minimally edited **only when the lane's own change breaks it**. Each such edit is listed in the lane report with its reason.
- Each executor gets this plan's path **and its lane id** and touches only its own files.
- Run typecheck + the relevant existing suite **once per item**, in one Bash call with `NO_COLOR=1` (`server/INSIGHTS.md:95`).
- **L2's long-run warning.** L2 runs the existing integration lane only once, at its end, with `--no-file-parallelism`, and reads the skip count. L3 and L4 load the machine, so `docker info` can time out and skip whole files (`server/INSIGHTS.md:96`, `:114`).
- L3 uses pnpm in `agent-runner` and never touches `reviewer-core`'s lockfile.
- L2 and L4 have 5 items each (the upper bound), so keep context lean.

**Integration (wave 3, caller), in order:**
1. `node scripts/verify.mjs server`. arch:check shows no new violation against the 20-warning baseline, and the W4 orphan warning is gone.
2. From `server/`: `pnpm exec vitest run .it.test --no-file-parallelism`, with **0 skipped**.
3. `node scripts/verify.mjs client` (full).
4. `cd client && pnpm build`. Never run it while `pnpm dev` is serving (`client/INSIGHTS.md:47`).
5. `cd agent-runner && pnpm typecheck && pnpm test && pnpm build`.
6. Cross-lane checks:
   - both `vendor-shared-sync` tests are green;
   - `ci` is registered in `modules/index.ts`;
   - `grep -rn "Review PR #" agent-runner/src` finds no title interpolation;
   - the server `checkArtifact` and the runner import the same `CiResultArtifact` file.
7. Manual:
   - `cd server && pnpm db:migrate` on the dev DB;
   - with `agent-runner/dist` built, open an OpenRouter agent's CI tab and walk the wizard to preview;
   - a real PR install and a Refresh are smoke tests only the user may authorize. They also settle the unverified GitHub facts (W2, A7, A9).

## Post-implementation review pipeline (run by the caller)

1. **`architecture-reviewer`**
   - **Scope:** every changed or new file under `server/src/modules/ci/**`, `server/src/adapters/runner-bundle/**`, `server/src/adapters/github/octokit.ts`, both `vendor/shared` files and `server/src/db/schema/ci.ts`, plus every L4 client file.
   - **Check:**
     - onion rings and Bans 1–3, and §4 (ports injected, not the container);
     - that `modules/ci/helpers/*` are pure (`server/INSIGHTS.md:60`);
     - frontend-ui-architecture: the radius of `CiRunsTable` vs the route-local `CiTab/ExportWizard`, folder anatomy, no logic in components, no copied query data.
2. **`security-reviewer`**
   - **Scope:**
     - `server/src/modules/ci/helpers/{workflow,validate-workflow,ingest}.ts`;
     - `server/src/modules/ci/{service.ts,ingest.ts,routes.ts}`;
     - `server/src/adapters/github/octokit.ts`, including the unzip filter and ref writes;
     - `server/src/adapters/runner-bundle/fs.ts`;
     - **all of `agent-runner/src/**`** (unrouted, so name it explicitly);
     - `client/src/lib/api.ts`.
3. **F1 — `implementer` fix mode (fix #1).** Gets this plan's path plus the **merged** findings of steps 1 and 2. Fixes CRITICAL and WARNING findings. Lists SUGGESTIONs for the user. **Writes no tests.**
4. **`plan-verifier`.** Checks against this plan: one verdict per W0–W17, plus a roll-up per AC-1..AC-38 and NFR-1..3 via the traceability table.
   - **Missing new tests are expected (user decision 1) and are NOT findings.** The Test debt section lists them.
   - Judge each item by its "Done means": typecheck, build, existing suites, code reading and the manual checks.
5. **F2 — `implementer` fix mode (fix #2), only if step 4 reports open items** or F1 left findings open. **Writes no tests.** This is the last fix dispatch.
6. **`plan-verifier` re-verify (optional, read-only).** Anything still open after F2 goes to the user.

**Parallelism:**
- Steps 1 and 2 run **in parallel**: both are read-only over the same tree.
- F1 waits for both, so it gets one merged list in one dispatch.
- Steps 4–6 are strictly sequential.

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | Typecheck clean. Existing unit suite green (known load flake: `brief-budget-cost.test.ts`, `server/INSIGHTS.md:36`). arch:check shows no new violation. |
| `pnpm exec vitest run .it.test --no-file-parallelism` | `server/` | pnpm | Existing integration files green, **0 skipped**. Docker required. The suites also run the new migration. |
| `node scripts/verify.mjs client` | repo root | — | Typecheck + existing client suite green. |
| `pnpm build` | `client/` | pnpm | The Next build succeeds (new page `/ci-runs`). |
| `pnpm typecheck && pnpm test && pnpm build` | `agent-runner/` | pnpm | Green; `dist/index.js` produced. |
| `pnpm db:migrate` | `server/` | pnpm | The migration applies on the dev DB (manual). |

`scripts/verify.mjs` does not know `agent-runner`, so use its own scripts. Extending verify.mjs is out of scope.

## Assumptions (technical)

- **A1 — Data model.** `agent_runs` is the run record (AC-34). `ci_runs` is its 1:1 CI detail via `agent_run_id`. Both `ci_runs` and `ci_installations` already exist, have never been written, and are extended rather than replaced.
- **A2 — Running status.** `agent_runs.status` is `null` while a CI run is running. The status of record is `ci_runs.status`. Reason: the boot reaper `reapStaleRunningRuns` flips every `status='running'` row to `failed` (`server/src/modules/reviews/repository/run.repo.ts:155-161`, called from `app.ts:81`). Changing the reaper would cross the user's scope boundary.
- **A3 — Runner bundle source.** The bundle is read from `AppConfig.runnerDistDir` (default `../agent-runner/dist`) through a module-local port.
- **A4 — Libraries in pure helpers.** The `yaml` and `fflate` calls sit in ring-1 helpers: they are deterministic and do no I/O. Precedent: `modules/skills/import-parse.ts`.
- **A5 — Duplicate skill slugs.** Two enabled skills of one agent that share a slug → AC-8 409.
- **A6 — Run listing.** Refresh reads up to 50 runs per installation's workflow file. A 404 on a not-yet-merged workflow means no runs, not an error.
- **A7 — Unknown PR number.** `pr_number` may be `null` when GitHub cannot give a fork run's PR.
- **A8 — Committing large files.** PR install commits via `git.createBlob` + `createTree`, because the runner is MB-sized.
- **A9 — Commit SHA.** The runner's `commit_sha` is the event's `pull_request.head.sha`, assumed equal to the run's `head_sha`. This is not documented; verify it on the first real run, because a mismatch would make every real run `identity_mismatch`.
- **A10 — Relative time.** The relative time is a local pure helper with an injected `now`.

## Open questions

None blocking. The unverified GitHub facts are runtime risks and do not block implementation: octokit `downloadArtifact` shape, a 404 for a missing workflow, fork PR number lookup, `head_sha` equality, and the `workflow`-scope error text. They are settled by the user-authorized real-repo smoke test in integration step 7.

## Research used

One `researcher` dispatch (2026-10-10). Sources: docs.github.com REST "workflow-runs", "artifacts", "git/trees", "git/blobs" and "commits"; Actions "variables", "contexts", "expressions" and "events-that-trigger-workflows"; artifact retention; octokit `plugin-rest-endpoint-methods` `endpoints.ts`.

Relied on:
- **Workflow runs:**
  - `listWorkflowRuns` accepts a workflow file name.
  - Run fields: `id`, `run_attempt`, `head_sha`, `repository.id`, `pull_requests` (nullable), `status`, `conclusion`.
- **Artifacts:**
  - `listWorkflowRunArtifacts` has a `name` filter.
  - Artifacts carry `size_in_bytes` and `expired`.
  - `downloadArtifact` answers 302, with a URL that lives 1 minute.
  - Default retention is 90 days.
- **Workflow context:**
  - `GITHUB_SHA` is the merge commit; `pull_request.head.sha` is the head commit.
  - `GITHUB_REPOSITORY_ID` is a default env var.
  - `hashFiles()` is allowed in a step `if`.
- **Git data:**
  - `createBlob` supports utf-8.
  - No tree-content limit is documented.

Not established: see Open questions.

## Rollback / blast radius

- Reverting the files removes the module, the runner changes and the UI.
- **The migration cannot be reverted by reverting files.** Its columns and indexes are additive and nullable or defaulted, so old code keeps working; dropping them needs a new generated migration.
- `agent_runs` rows with `source='ci'` stay in the DB and are invisible to the PR feed (`pr_id` null).
- **GitHub-side effects are outside this repo and cannot be rolled back:** the `devdigest/ci` branch, the opened PRs, and merged workflow files. Removing an installation is Deferred.
- Strict `CiResultArtifact` breaks runner bundles built before this change. None have shipped.
