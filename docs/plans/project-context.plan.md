# Implementation plan: Project Context (SPEC-01)

**Route** — A (spec-driven).
**Requirements source** — `specs/SPEC-01-project-context.md` (Status: approved, Open questions: none),
AC-1…AC-75 and NFR-1…NFR-5, numbered as in the spec. This plan implements those requirements; it
does not define or change them.
**Execution mode** — multi-agent (6 lanes: phase-0 contracts, reviewer-core, two server phases, two
client phases), chosen by the user on 2026-10-02 (stated in the dispatch brief).
**Out of scope** — everything in the spec's Non-goals (no edit/upload on the page, no token budget,
no per-row tokens, no per-document trace rows, no folder tree, no "used by" popover, no version
bumps, no seeded attachments, no CI/MCP/RAG consumers, no rename following, no PR-head or
non-checkout branch reads, no correction of `repos.default_branch`, no pre-run sync, no
Evals/Stats/CI agent tabs). Architecture review and security review are performed by separate
agents.

Reading conventions for every executor: `INSIGHTS.md` is append-only, the newest entry on a subject
wins. Two `server/INSIGHTS.md` entries are **stale and must not shape the work**: the 2026-09-18
"Per-skill statistics cannot be derived" entry (`run_skills` exists, `server/src/db/schema/runs.ts:81`;
superseded at `server/INSIGHTS.md:58`) and the 2026-09-18 Open Question that skill-link changes do
not bump the agent version (they do — `server/src/modules/agents/repository.ts:281-300`; superseded
at `server/INSIGHTS.md:57`). This feature must NOT reuse `applySkillChange`/`snapshotVersion` for
attachments (AC-68).

## Requirements traceability

| Req | Requirement (short) | Source | Work items | Checked by |
|---|---|---|---|---|
| AC-1 | Sidebar WORKSPACE "Project Context" → `/repos/:repoId/context` | spec:92 | W11 | W11 Done means |
| AC-2 | List every `.md`/`.markdown` (ci) of the clone, excluding `node_modules`,`dist`,`.next`,`vendor`,`.git` segments | spec:96 | W2, W5, W7 | W7 (it test), W5 (unit) |
| AC-3 | Order by path, code point | spec:103 | W5, W7 | W5 |
| AC-4 | Category specs / insights / docs rule | spec:107 | W5 | W5 |
| AC-5 | >500 → first 500 + `total` + `truncated:true` | spec:113 | W5, W7 | W7 |
| AC-6 | "Showing 500 of N documents" notice | spec:118 | W12 | W12 |
| AC-7 | Paths with control chars left out | spec:122 | W5 | W5 |
| AC-8 | Real path outside clone left out of list | spec:126 | W2, W7 | W2, W7 |
| AC-9 | List built without GitHub | spec:131 | W7 | W7 |
| AC-10 | One row per doc carrying its path | spec:136 | W12 | W12 |
| AC-11 | Page filter, path contains, ci | spec:140 | W12 | W12 |
| AC-12 | Select first doc on load | spec:144 | W12 | W12 |
| AC-13 | Render selected doc as markdown | spec:148 | W13 | W13 |
| AC-14 | "Used by N agents" (direct ∪ enabled linked skill; agent enabled ignored) | spec:152 | W6, W7, W13 | W7 (it), W13 (unit) |
| AC-15 | "Open on GitHub" link, encoded segments, new tab, noopener noreferrer | spec:159 | W13 | W13 |
| AC-16 | Refresh re-requests list | spec:164 | W12 | W12 |
| AC-17 | Empty state "No markdown documents found in <owner>/<name>@<branch>" + Refresh | spec:168 | W11, W12 | W12 |
| AC-18 | No clone → 409 `repo_not_cloned` | spec:172 | W7 | W7 |
| AC-19 | List error → message + Retry | spec:176 | W12 | W12 |
| AC-20 | Loading state while in flight | spec:180 | W12 | W12 |
| AC-21 | No Edit/New file/New folder/Upload controls | spec:184 | W12 | W12 |
| AC-22 | Agent tabs Config · Skills · Context, `?tab=context` | spec:189 | W16 | W16 |
| AC-23 | Skill tabs Config · Context · Preview · Stats · Versions | spec:193 | W17 | W17 |
| AC-24 | Skill editor without `?tab` opens Config | spec:197 | W17 | W17 |
| AC-25 | Attached first in attachment order, then unattached in path order | spec:201 | W15 | W15 |
| AC-26 | No active repo → "Select a repository to attach its documents" | spec:206 | W15 | W15 |
| AC-27 | Row: checkbox, file name, folder, category badge, Preview button | spec:210 | W15 | W15 |
| AC-28 | Tick appends to the end | spec:214 | W15 | W15 |
| AC-29 | Untick removes (also on a missing row) | spec:218 | W15 | W15 |
| AC-30 | Reorder by drag or ↑/↓ on focused handle | spec:222 | W15 | W15 |
| AC-31 | One save request per change, `repo_id` + full ordered list | spec:226 | W15 | W15 |
| AC-32 | Server replaces set in one transaction; failed validation leaves it | spec:231 | W6, W8 | W8 (it) |
| AC-33 | Failed save → error + last saved set | spec:237 | W15 | W15 |
| AC-34 | Tab filter, path contains, ci | spec:241 | W15 | W15 |
| AC-35 | Attached doc absent from clone → `present:false` → "missing" row | spec:245 | W8, W15 | W8 (it), W15 (unit) |
| AC-36 | Row Preview opens modal with rendered doc | spec:250 | W15 | W15 |
| AC-37 | Agent header "{n} of {total} attached" | spec:254 | W16 | W16 |
| AC-38 | Skill header "{n} attached" | spec:258 | W17 | W17 |
| AC-39 | Skill note "Any agent using this skill inherits these documents." | spec:262 | W17 | W17 |
| AC-40 | Agent tab inherited read-only rows "via <skill name>", enabled skills only | spec:266 | W6, W8, W15, W16 | W8 (it), W16 (unit) |
| AC-41 | `approx_tokens` = ceil(chars/4) | spec:273 | W5 | W5 |
| AC-42 | Agent "≈ N tokens" deduped, missing excluded | spec:277 | W16 | W16 |
| AC-43 | Skill "≈ N tokens", missing excluded | spec:283 | W17 | W17 |
| AC-44 | Agent note "Injected as an untrusted block (## Project context) into every run." | spec:287 | W16 | W16 |
| AC-45 | Skill "Serializes as" box | spec:291 | W17 | W17 |
| AC-46 | Run takes attachments of the PR's repo only | spec:299 | W6, W9, W10 | W10 (it) |
| AC-47 | Order: agent's, then each enabled linked skill in link order | spec:305 | W5, W9 | W5 |
| AC-48 | Duplicate path injected once at first position | spec:310 | W5 | W5 |
| AC-49 | Disabled linked skill contributes nothing | spec:314 | W5, W9 | W5 |
| AC-50 | Read from the clone's current checkout, whatever the PR base | spec:318 | W2, W9, W10 | W10 (it) |
| AC-51 | Run Log `project context:` line with clone HEAD SHA | spec:325 | W5, W9, W10 | W10 (it) |
| AC-52 | One `## Project context` section, `### <path>` + full text per doc | spec:330 | W3, W10 | W3 (unit), W10 (it) |
| AC-53 | `<untrusted source="…">` label free of path/content | spec:336 | W3 | W3 |
| AC-54 | `</untrusted>` in text escaped | spec:341 | W3 | W3 |
| AC-55 | Full injection, no size limit (200 KB byte-for-byte) | spec:345 | W9, W10 | W10 (it) |
| AC-56 | Missing → `project context: skipped <path> — missing` | spec:349 | W5, W9, W10 | W10 (it) |
| AC-57 | NUL / invalid UTF-8 → `skipped <path> — unreadable` | spec:354 | W5, W9, W10 | W10 (it) |
| AC-58 | Outside clone → `skipped <path> — outside_clone` | spec:359 | W2, W9, W10 | W10 (it) |
| AC-59 | No clone → `project context: skipped — repository not cloned`, nothing injected | spec:364 | W9, W10 | W10 (it) |
| AC-60 | Any read failure → run continues to `done` | spec:370 | W9, W10 | W10 (it) |
| AC-61 | `project context: N document(s) attached, M skipped` | spec:375 | W5, W9, W10 | W10 (it) |
| AC-62 | `specs_read` = injected paths in order | spec:379 | W10 | W10 (it) |
| AC-63 | `prompt_assembly.specs` ⊂ user message of every call, single-pass and map-reduce | spec:384 | W3, W10 | W3 (unit), W10 (it) |
| AC-64 | No docs → no section, `prompt_assembly.specs` null | spec:391 | W3, W10 | W3 |
| AC-65 | Trace label "Project context — attached specs (untrusted)" | spec:398 | W14 | W14 |
| AC-66 | Expanding the block shows full `prompt_assembly.specs` | spec:402 | W14 | W14 (unit; e2e gap — see Spec follow-up 1) |
| AC-67 | Configuration "Specs read" lists every path | spec:407 | W14 | W14 |
| AC-68 | Saving attachments leaves agent/skill `version` unchanged, no version row | spec:413 | W6, W8 | W8 (it) |
| AC-69 | Foreign repo/agent/skill → 404, nothing revealed | spec:418 | W6, W7, W8 | W7, W8 (it) |
| AC-70 | Invalid path shapes → 422 `invalid_path` | spec:423 | W5, W7, W8 | W5 (unit), W7/W8 (it) |
| AC-71 | >500 paths or duplicate → 422, set unchanged | spec:428 | W1, W8 | W8 (it) |
| AC-72 | Doc read: missing / outside clone → 404 `doc_not_found` | spec:432 | W7 | W7 (it) |
| AC-73 | Doc read: NUL / invalid UTF-8 → 422 `unreadable` | spec:438 | W5, W7 | W7 (it) |
| AC-74 | Base ≠ clone branch → exact Run Log line; uses clone HEAD branch, never `repos.default_branch` | spec:442 | W2, W5, W9, W10 | W10 (it) |
| AC-75 | No fetch/sync for project context | spec:450 | W9, W10 | W10 (it) |
| NFR-1 | 10,000 files / 500 md listed in < 3 s | spec:506 | W2, W7 | W7 (it, timed) |
| NFR-2 | All new strings from `client/messages/en/` keys | spec:510 | W11, W14, W16, W17 | W12, W15, W16, W17 (no raw key rendered) |
| NFR-3 | Keyboard-operable controls with visible focus | spec:514 | W12, W13, W15 | W12, W15 (unit; e2e gap — Spec follow-up 1) |
| NFR-4 | Preview renders no raw HTML | spec:519 | W11 | W11 |
| NFR-5 | Preview loads no remote image | spec:523 | W11 | W11 |

Every requirement maps to ≥1 work item; every work item W1–W17 appears above (W1, W2, W4 are
enabling work — see their `Serves` lines).

## Spec follow-ups (addressed to `spec-creator` and the user — NOT applied; the plan implements the spec as written)

1. **AC-66 and NFR-3 name `e2e` as their check, which the e2e harness cannot run as worded.** e2e
   flows run on seeded data with no LLM and no API key (`e2e/CLAUDE.md`, "Flows target read-only
   seeded data, so nothing triggers a model call"), and the only seeded repo has no clone
   (`server/src/db/seed.ts:100`, `clonePath: null`) — so no document can be listed, attached, or
   injected by a run there. The plan checks AC-66 with a unit test of the trace block plus the
   server integration tests of AC-55/AC-63, and NFR-3 with unit tests of keyboard operation; the
   browser-level check is a coverage gap. Suggest: reword the Verify hints to unit/integration, or
   add a seeded local fixture clone + a mock-provider e2e mode.
2. **Zero-attachment runs are unspecified for AC-59, AC-61, AC-74.** Read literally, every run of
   every agent would log `project context: skipped — repository not cloned` / the base-branch line /
   `0 document(s) attached, 0 skipped`, even with nothing attached (the seeded demo repo has no
   clone). The plan assumes (A-1) resolution runs only when ≥1 path is attached for the PR's repo.
   Suggest stating the zero case.
3. **Unreadable (binary / invalid UTF-8) documents in the list and the attachments response** are
   undefined: AC-41 counts "characters" of content that cannot be decoded; AC-35 defines only
   `present` for missing files; AC-42 excludes only "missing". The plan assumes (A-4) list
   `approx_tokens: 0`, attachments `present: true, approx_tokens: null` (so the estimate counts
   exactly what a run would inject).
4. **Category for attached rows that are not in the list** (EC-19: beyond the first 500; or
   missing) — AC-27 requires a category badge, but the attachments contract carries no `category`.
   The plan duplicates the AC-4 rule as a pure client helper (A-9). Suggest adding `category` to
   the attachments response.
5. **AC-40 does not say which skill an inherited path is attributed to when two enabled skills
   attach it**, nor where inherited rows sit relative to AC-25's two groups. Plan: first enabled
   skill in link order (matches AC-48), rows placed between attached and unattached (A-8).
6. **AC-37 "{total} the listed documents"** under truncation: plan uses `docs.length` (listed), not
   the envelope's `total` (A-10).
7. **AC-60 / EC-23 generic I/O errors** (EACCES, EISDIR…) have no reason of their own among
   AC-56..AC-58; plan logs them as `— unreadable` (A-5).
8. Cosmetic: the Inputs and provenance table has one row (`approx_tokens, used_by_agents, present`,
   spec:671) placed after the closing paragraph, so it renders outside the table.

## Affected surface

| File | New/Mod | Package | Ring / home | Skills that will govern it | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/vendor/shared/contracts/platform.ts` | Mod | shared | Ports (ring 2) | zod | replace `SpecFile` in place (`platform.ts:254-261`); `IndexStatus` stays untouched; lock-step with client copy — `server/test/vendor-shared-sync.test.ts` byte-compares (`server/INSIGHTS.md:42`); new schemas reference only `z` primitives, so section order is safe (`server/INSIGHTS.md:48`) |
| `client/src/vendor/shared/contracts/platform.ts` | Mod | shared | Ports | zod | byte-identical to the server copy |
| `server/src/vendor/shared/adapters.ts` | Mod | shared | Ports (ring 2) | zod | port names the conversation, no fs/simple-git types (onion §2) |
| `client/src/vendor/shared/adapters.ts` | Mod | shared | Ports | zod | byte-identical copy |
| `client/src/lib/hooks/core.ts` | Mod | client | data hook | frontend-ui-architecture, react-best-practices | REUSE `useContextFiles` (`core.ts:122-129`), change its type only; leave `useReindexContext` as is (spec D-29) |
| `client/src/lib/types.ts` | Mod | client | types barrel | — (unrouted by glob; coverage gap) | re-exports `SpecFile` today (`types.ts:30`) — swap to the new names |
| `server/src/adapters/git/simple-git.ts` | Mod | api | Adapter (ring 4) | onion-architecture, security | keep `readFile` unchanged; reuse its realpath guard (`simple-git.ts:135-145`) for the byte read |
| `server/src/adapters/mocks.ts` | Mod | api | Adapter (test double) | onion-architecture, security | `MockGitClient` (`mocks.ts:265`) must implement the new port methods |
| `server/test/git-list-files.test.ts` | New | api | test | — (tests excluded from routing) | tmp dirs only, no DB; skip on `EPERM` symlink (pattern `server/test/git-read-file.test.ts:41-44`) |
| `reviewer-core/src/prompt.ts` | Mod | core | Core (ring 1) | onion-architecture, security | no I/O (`reviewer-core/CLAUDE.md`); label stays index-based (`spec-<i>`), never path-derived |
| `reviewer-core/src/review/run.ts` | Mod | core | Core (ring 1) | onion-architecture | `specs` assembly must stay diff-independent (`run.ts:146,176`) |
| `reviewer-core/test/prompt.test.ts`, `reviewer-core/test/run.test.ts` | Mod | core | test | — | stubbed provider only |
| `server/test/prompt-callers.test.ts` | Mod | api | test | — | fixture `specs: ['…']` (`:20`) must move to the new element type |
| `server/src/db/schema/project-context.ts` | New | api | Adapter (db) | onion-architecture, drizzle-orm-patterns, postgresql-table-design | link tables with no `workspace_id` inherit tenancy transitively like `agent_skills` (`server/src/db/schema/agents.ts:52-63`); index FK/lookup columns (postgresql-table-design "FK indexes") |
| `server/src/db/schema.ts` | Mod | api | Adapter (db) | onion-architecture, drizzle-orm-patterns, postgresql-table-design | export the new tables in BOTH the `export *` list and the `schema` object |
| `server/src/db/migrations/00NN_<generated>.sql` + `meta/*` | New | api | generated | postgresql-table-design | generated by `pnpm db:generate` only (CLAUDE.md Do-not-touch); new tables only → no rename prompt (`server/INSIGHTS.md:71`) |
| `server/src/modules/project-context/constants.ts` | New | api | Core (ring 1) | onion-architecture | — |
| `server/src/modules/project-context/helpers.ts` | New | api | Core (ring 1) | onion-architecture | pure; ring-1 guard is by FILENAME (`server/INSIGHTS.md:52`) — rules go in `helpers.ts`, nowhere else; may not import `adapters/` (so `approxTokens` is re-declared here, twin of `server/src/adapters/tokenizer/index.ts:21-23`) |
| `server/src/modules/project-context/repository.ts` | New | api | Application (ring 3) | onion-architecture, drizzle-orm-patterns | scope every read by `workspace_id` through the owning agent/skill/repo (`server/INSIGHTS.md:46`); no Drizzle row type leaves the module (ban 3) |
| `server/src/modules/project-context/service.ts` | New | api | Application (ring 3) | onion-architecture, security | inject ports (`repository`, `GitClient`), never `Container` (`server/INSIGHTS.md:44`); never import `adapters/` (ban 2) |
| `server/src/modules/project-context/routes.ts` | New | api | Adapter (ring 4) | onion-architecture, fastify-best-practices, security | no `drizzle-orm`/`db/schema` import (ban 1); schema-first Zod `params`/`querystring`/`body` (`server/CLAUDE.md`) |
| `server/src/modules/index.ts` | Mod | api | composition | onion-architecture | one import + one entry (`index.ts:1-48`) |
| `server/test/project-context-helpers.test.ts` | New | api | test | — | unit, no DB |
| `server/test/project-context.it.test.ts` | New | api | test | — | DB-backed ⇒ `*.it.test.ts` suffix (CLAUDE.md) |
| `server/src/modules/reviews/run-executor.ts` | Mod | api | Application (ring 3, executor) | onion-architecture | construct the service like `IntentService` at `run-executor.ts:420-427` (legal there); best-effort, never `failAll` |
| `server/test/project-context-run.it.test.ts` | New | api | test | — | wait for traces with `waitForRunTrace` (`server/test/helpers/runs.ts`); clean up rows a test writes (`server/INSIGHTS.md:25`) |
| `client/src/vendor/ui/primitives/Markdown.tsx` | Mod | client | design system | frontend-ui-architecture | opt-in prop only — other consumers (FindingCard, PreviewTab, …) keep current output |
| `client/src/vendor/ui/primitives/Markdown.test.tsx` | New | client | test | react-testing-library | — |
| `client/src/vendor/ui/nav.ts` | Mod | client | design system | frontend-ui-architecture | sidebar key `context` is already mapped (`client/src/components/app-shell/helpers.ts:30`, `client/INSIGHTS.md:35`) |
| `client/src/components/app-shell/nav-context.test.ts` | New | client | test | react-testing-library | — |
| `client/messages/en/context.json` | Mod | client | i18n | frontend-ui-architecture | REUSE the namespace; AC-17 copy replaces the `.devdigest/specs/` empty copy (spec D-29) |
| `client/src/app/repos/[repoId]/context/page.tsx` | New | client | route | frontend-ui-architecture, next-best-practices, react-best-practices | thin page, like `conventions/page.tsx` |
| `client/src/app/repos/[repoId]/context/_components/ContextView/{ContextView.tsx,ContextView.test.tsx,helpers.ts,helpers.test.ts,styles.ts,index.ts}` | New | client | route-local | frontend-ui-architecture, react-best-practices, react-testing-library (tests) | `styles.ts` `s` object, CSS vars, no Tailwind (`client/INSIGHTS.md:33`) |
| `client/src/app/repos/[repoId]/context/_components/ContextView/_components/DocList/*` | New | client | route-local child | same | — |
| `client/src/app/repos/[repoId]/context/_components/ContextView/_components/DocPreviewPane/*` | New | client | route-local child | same | external link via `rel="noopener noreferrer"` |
| `client/messages/en/runs.json` | Mod | client | i18n | frontend-ui-architecture | only `trace.prompt.specs` (`runs.json:50`) changes |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx` | Mod | client | test | react-testing-library | trace UI already renders both halves (`client/INSIGHTS.md:37`) — no component change |
| `client/src/lib/hooks/agents.ts`, `client/src/lib/hooks/skills.ts` | Mod | client | data hooks | frontend-ui-architecture, react-best-practices | all API access through `lib/api.ts` (`client/CLAUDE.md`) |
| `client/src/components/ContextDocPicker/{ContextDocPicker.tsx,ContextDocPicker.test.tsx,helpers.ts,helpers.test.ts,styles.ts,index.ts}` | New | client | shared (2 routes: `/agents/[id]`, `/skills/[id]`) | frontend-ui-architecture, react-best-practices, react-testing-library (tests) | narrow barrel only (frontend-ui §2) |
| `client/src/components/ContextDocPicker/_components/DocPreviewModal/*` | New | client | child | same | use vendored `Modal` (`client/src/vendor/ui/kit/Modal.tsx`); scope test queries with `within(getByRole("dialog"))` (`client/INSIGHTS.md:51`) |
| `client/src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts,AgentEditor.test.tsx}` | Mod | client | route-local | frontend-ui-architecture, react-best-practices | `VALID_TABS` derives from `TABS` (`constants.ts:12-19`) |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/*` | New | client | route-local | frontend-ui-architecture, react-best-practices, react-testing-library (tests) | — |
| `client/messages/en/agents.json` | Mod | client | i18n | frontend-ui-architecture | — |
| `client/src/app/skills/[id]/_components/SkillEditor/{SkillEditor.tsx,constants.ts,SkillEditor.test.tsx}` | Mod | client | route-local | frontend-ui-architecture, react-best-practices | `DEFAULT_TAB = TABS[0].key` (`constants.ts:30`) — new order makes Config the default; update the "Preview first" comment, which records the reversed L02 R3 decision (spec D-18) |
| `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/*` | New | client | route-local | frontend-ui-architecture, react-best-practices, react-testing-library (tests) | — |
| `client/messages/en/skills.json` | Mod | client | i18n | frontend-ui-architecture | — |

**Coverage gaps:** `client/src/lib/types.ts` is matched by no routing glob; all `server/test/*` and
`reviewer-core/test/*` files are excluded from routing by design; the e2e checks of AC-66 / NFR-3 are
not run (Spec follow-up 1); `docs/plans/**` itself is unrouted.

## Contract changes

- **vendor/shared:** yes, in phase 0 (lane L0), both copies byte-identical:
  - `contracts/platform.ts`, section `// ---- Project Context ----`: delete `SpecFile`; add
    `ContextDocCategory = z.enum(['specs','docs','insights'])`; `ContextDoc` (`path`, `name`,
    `folder`, `category`, `approx_tokens` int); `ContextDocList` (`repo_id`, `branch`, `total` int,
    `truncated` boolean, `docs: ContextDoc[]`); `ContextDocContent` (`path`, `content`,
    `used_by_agents` int); `ContextAttachment` (`path`, `present` boolean, `approx_tokens` int
    nullable); `InheritedContextAttachment` (= `ContextAttachment` + `skill_id`, `skill_name`);
    `AgentContextDocs` (`repo_id`, `attached`, `inherited`); `SkillContextDocs` (`repo_id`,
    `attached`); `SaveContextDocsInput` (`repo_id` uuid, `paths: z.array(z.string()).max(500)` with a
    uniqueness `refine`). Schema and inferred type share one name (CLAUDE.md Naming). `IndexStatus`
    is left untouched (spec D-29).
  - `adapters.ts`, `GitClient`: add `listFiles`, `readFileBytes`, `currentBranch` (signatures in W2).
- **Migration:** yes → two new link tables `agent_context_docs` and `skill_context_docs`, generated
  via `cd server && pnpm db:generate`, applied with `pnpm db:migrate`. No column on any existing
  table changes.
- **Seed:** no — spec Non-goal "Seeded attachments" (D-19). The feature works on any repository that
  has a clone; nothing needs seeding for it to appear (the page and tabs render their empty / 409
  states on the clone-less demo repo).
- **Client build check needed:** no, provided every new client import of `@devdigest/shared` is
  `import type` (`client/INSIGHTS.md:22`). Any work item that adds a VALUE import from
  `@devdigest/shared` in `client/` must add `pnpm build` (in `client/`, with no `pnpm dev` running —
  `client/INSIGHTS.md:42`) to its Verify.
- **i18n:** yes → `client/messages/en/context.json` (page + shared picker: `page.*`, `list.*`,
  `preview.*`, `empty.*`, `error.*`, `picker.*`), `agents.json` (`editor.tabs.context`,
  `context.*`), `skills.json` (`editor.tabs.context`, `context.*`), `runs.json`
  (`trace.prompt.specs` value only).

## Work items

### W1 — Phase-0 contracts: replace `SpecFile` with the Project Context envelope (both copies) and retype the existing hook
- **Serves:** enables AC-2..AC-6, AC-14, AC-15, AC-17, AC-31..AC-45, AC-71 — every endpoint and screen
  reads these shapes.
- **Do:** In both `vendor/shared/contracts/platform.ts` copies, replace the `SpecFile` block with the
  schemas listed under Contract changes (snake_case fields, exactly the spec's contract,
  spec:611-641). In `client/src/lib/hooks/core.ts`, keep `useContextFiles` (same query key
  `["context", repoId]`, same path `/repos/${repoId}/context`) and change its result type to
  `ContextDocList`; add next to it `useContextDoc(repoId, path)` (key `["context-doc", repoId, path]`,
  `GET /repos/${repoId}/context/doc?path=${encodeURIComponent(path)}`, enabled only when both are
  set). Leave `useReindexContext` untouched. Update `client/src/lib/types.ts` re-exports. Extend
  `server/test/contracts.test.ts` with one parse case per new schema (valid + duplicate-paths reject +
  501-paths reject) if that file holds contract cases (`server/INSIGHTS.md:82`).
- **Files:** both `contracts/platform.ts`, `client/src/lib/hooks/core.ts`, `client/src/lib/types.ts`,
  `server/test/contracts.test.ts`.
- **Done means:** `grep -rn "SpecFile" server/src client/src` returns nothing; the two `platform.ts`
  copies are byte-identical; `SaveContextDocsInput.safeParse` rejects 501 paths and a duplicated path
  and accepts `["specs/a.md"]`; `useContextFiles` still calls `/repos/<id>/context`; both packages
  typecheck.
- **Verify:** `node scripts/verify.mjs server test/vendor-shared-sync.test.ts test/contracts.test.ts`
  and `node scripts/verify.mjs client src/test/vendor-shared-sync.test.ts`
- **Rules that apply:** zod → `type-use-z-infer`, `type-export-schemas-and-types`,
  `object-strict-vs-strip`; frontend-ui-architecture §4 (types come from `@devdigest/shared`,
  `import type` only).
- **Risk:** byte drift between copies (caught by the sync tests); a value import would break the
  Next build silently.

### W2 — Phase-0 port: `GitClient.listFiles` / `readFileBytes` / `currentBranch` with both implementations
- **Serves:** enables AC-2, AC-8, AC-9, AC-50, AC-51, AC-57, AC-58, AC-72..AC-75, NFR-1; directly
  AC-8 (adapter-level).
- **Do:** In both `vendor/shared/adapters.ts` copies add to `GitClient`:
  - `listFiles(repo: RepoRef, opts?: { excludeDirs?: readonly string[] }): Promise<string[]>` —
    repository-relative, `/`-separated paths of every regular file in the clone's working tree; does
    not descend into a directory whose name is in `excludeDirs` (always skips `.git`); never follows a
    symlinked directory; includes a symlinked FILE only when its real path is a regular file inside
    the clone (AC-8). Rejects with an error whose `code` is `ENOENT` when the clone directory does not
    exist.
  - `readFileBytes(repo: RepoRef, path: string): Promise<Uint8Array>` — same realpath guard as
    `readFile` (`code: 'EOUTSIDECLONE'`; missing → `ENOENT`).
  - `currentBranch(repo: RepoRef): Promise<string>` — `git rev-parse --abbrev-ref HEAD` (prints the
    literal `HEAD` when detached — see Research used).
  Implement in `SimpleGitClient` (walk with `readdir({ withFileTypes: true })` — symlink entries
  report `isSymbolicLink()` true and are resolved with `realpath`; reuse the private root/relative
  check of `readFile` rather than duplicating it). In `MockGitClient` add options
  `docs?: Record<string, string | Uint8Array>`, `outside?: string[]`, `branch?: string`,
  `notCloned?: boolean`, and public call counters `fetchPullHeads`, plus make `readFileBytes` throw
  `ENOENT` / `EOUTSIDECLONE` coded errors accordingly and `listFiles` return `Object.keys(docs)`
  minus `outside` (throw `ENOENT` when `notCloned`). Add `server/test/git-list-files.test.ts`
  (tmp dirs + a `git init`/commit for `currentBranch`): excluded dirs pruned, a symlinked file
  pointing outside is absent, one pointing inside is present, `readFileBytes` returns raw bytes of a
  binary file, missing root → `ENOENT`, detached HEAD → `HEAD`. Skip symlink cases on `EPERM`.
- **Files:** both `adapters.ts`, `server/src/adapters/git/simple-git.ts`,
  `server/src/adapters/mocks.ts`, `server/test/git-list-files.test.ts`.
- **Done means:** the new test file passes; existing `server/test/git-read-file.test.ts` still
  passes; `readFile`'s signature and behaviour are unchanged; both `adapters.ts` copies are
  byte-identical; `pnpm arch:check` shows no new violation.
- **Verify:** `node scripts/verify.mjs server test/git-list-files.test.ts test/git-read-file.test.ts test/vendor-shared-sync.test.ts`
  and `node scripts/verify.mjs client src/test/vendor-shared-sync.test.ts`
- **Rules that apply:** onion-architecture §2 (port describes the conversation, no vendor types in
  signatures), ban 2 is the reason the port exists; security → path traversal ("`path.join()` with
  user input allows traversal"), keep the realpath check where the file really lands.
- **Risk:** Windows path separators — normalise to `/` (`server/INSIGHTS.md:26` is the precedent for
  this exact bug); walking 10k files must stay under NFR-1.

### W3 — reviewer-core: per-document `## Project context` section
- **Serves:** AC-52, AC-53, AC-54, AC-63 (engine half), AC-64.
- **Do:** Change `PromptParts.specs` (`prompt.ts:49`) and `ReviewInput.specs` (`run.ts:60`) to
  `readonly { path: string; content: string }[]` (export the element type as `ProjectContextDoc`
  from `prompt.ts` and `index.ts`). Build `specsBlock` as, per document in order,
  `` `### ${doc.path}\n${wrapUntrusted(`spec-${i}`, doc.content)}` `` joined by `\n\n`; keep
  `## Project context\n${specsBlock}` as the section and `assembly.specs = specsBlock` (unchanged
  position, `prompt.ts:136`, `:155`). Label stays index-based (AC-53). Empty/absent list → no section,
  `specs: null` (AC-64, already the behaviour — keep it). Do not truncate. Update the stale comments
  ("spec chunks"). Update the `specs` fixture in `server/test/prompt-callers.test.ts:20` to the new
  element type. Tests in `reviewer-core/test/prompt.test.ts`: two docs → one heading, both `### path`
  lines in order, both bodies verbatim; a doc at path `specs/x" onload=".md` → no `source=` label
  contains any part of it; a body containing `</untrusted>` → exactly one closing delimiter per doc;
  empty list → no heading, `assembly.specs === null`. In `reviewer-core/test/run.test.ts`: a
  `strategy: 'map-reduce'` review over a two-file diff with a stub provider that records every
  `completeStructured` request → `outcome.assembly.specs` is a substring of the user message of each
  of the 2 calls; same for single-pass (1 call).
- **Files:** `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`,
  `reviewer-core/src/index.ts`, `reviewer-core/test/prompt.test.ts`, `reviewer-core/test/run.test.ts`,
  `server/test/prompt-callers.test.ts`.
- **Done means:** all listed reviewer-core tests pass; `server/test/prompt-callers.test.ts` passes;
  reviewer-core has no new import beyond `@devdigest/shared` types.
- **Verify:** `node scripts/verify.mjs reviewer-core test/prompt.test.ts test/run.test.ts` and
  `node scripts/verify.mjs server test/prompt-callers.test.ts --no-arch`
- **Rules that apply:** onion-architecture ban 4 / ring 1 (no I/O, no server import); security →
  Agentic AI (untrusted content stays inside the delimiter; `reviewer-core/CLAUDE.md`: no keyword
  scanning).
- **Risk:** the server's run-executor does not pass `specs` yet, so the type change cannot break it;
  any other caller of `specs: string[]` would fail typecheck (only the test above exists —
  grep confirmed).

### W4 — DB: attachment link tables + generated migration
- **Serves:** enables AC-14, AC-32, AC-35, AC-40, AC-46..AC-49, AC-68, AC-69.
- **Do:** New `server/src/db/schema/project-context.ts`:
  `agent_context_docs` (`agent_id` uuid NOT NULL FK `agents.id` ON DELETE CASCADE, `repo_id` uuid
  NOT NULL FK `repos.id` ON DELETE CASCADE, `path` text NOT NULL, `position` integer NOT NULL,
  PK (`agent_id`,`repo_id`,`path`), index (`repo_id`,`path`)); `skill_context_docs` identical with
  `skill_id` FK `skills.id` CASCADE. Export both from `server/src/db/schema.ts` (`export *` + the
  `schema` object). Optionally add row types to `server/src/db/rows.ts`. Run `cd server && pnpm
  db:generate` (alone — it writes `src/db/migrations/**`), then `pnpm db:migrate` if a dev DB is up.
- **Files:** `server/src/db/schema/project-context.ts`, `server/src/db/schema.ts`,
  `server/src/db/rows.ts`, `server/src/db/migrations/00NN_*.sql`, `server/src/db/migrations/meta/*`.
- **Done means:** exactly one new generated migration file creating the two tables with their PKs,
  FKs (cascade) and the two `(repo_id, path)` indexes, and touching no existing table; server
  typechecks.
- **Verify:** `cd server && pnpm db:generate` (then inspect the new `.sql`), then
  `node scripts/verify.mjs server src/db/schema.ts`
- **Rules that apply:** postgresql-table-design → FK columns indexed manually, `text` not `varchar`,
  NOT NULL where required; drizzle-orm-patterns → references with arrow functions; CLAUDE.md →
  never hand-write SQL.
- **Risk:** a stale dev DB with a differently named migration (`server/INSIGHTS.md:85`); migration
  is not reverted by reverting files (see Rollback).

### W5 — Ring-1 rules: listing filter, category, ordering, path validation, decoding, run order, log lines
- **Serves:** AC-2, AC-3, AC-4, AC-5, AC-7, AC-41, AC-47, AC-48, AC-49, AC-51, AC-56, AC-57, AC-58,
  AC-59, AC-61, AC-70, AC-74 (pure halves).
- **Do:** `server/src/modules/project-context/constants.ts`: `DOC_EXTENSIONS` (`.md`, `.markdown`),
  `EXCLUDED_DIRS` (`node_modules`,`dist`,`.next`,`vendor`,`.git`), `MAX_LISTED_DOCS = 500`,
  `MAX_SAVE_PATHS = 500`, error codes. `helpers.ts` (pure): `isDocPath` (extension ci),
  `hasExcludedSegment`, `hasControlChar` (U+0000–U+001F, U+007F), `selectDocs(paths)` →
  filtered + sorted by code point (compare with `<`, not `localeCompare`) + capped →
  `{ docs, total, truncated }`; `categoryOf(path)` (AC-4 precedence: any directory segment `specs` →
  specs; else file name `INSIGHTS.md` ci or directory segment `insights` → insights; else docs);
  `splitPath` → `{ name, folder }` (`""` at root); `approxTokens(text) = Math.ceil(text.length / 4)`;
  `decodeDoc(bytes)` → `{ ok: true, text } | { ok: false }` (NUL byte → not ok; `new TextDecoder(
  'utf-8', { fatal: true, ignoreBOM: true })` throws → not ok); `validateDocPath(raw)` → valid iff
  non-empty, not absolute (POSIX, `\`, drive letter), no `..` segment, no URL scheme or `//`, no
  control char, ends in `.md`/`.markdown` ci (do NOT reuse `intent/helpers.ts:isSafeDocPath`, which
  accepts `.md` only and has no control-char rule); `orderRunDocs(agentPaths, skills: { enabled:
  boolean; paths: string[] }[])` (AC-47/48/49); `selectInherited(agentPaths, skills: {id, name,
  enabled, paths}[])` (AC-40: enabled only, minus direct paths, first skill wins); Run Log line
  builders: `pcCheckoutLine(branch, sha)` → `project context: read from clone checkout <branch> @
  <sha>`; `pcBaseMismatchLine(base, branch)` → exactly `project context: base branch <base> differs
  from clone branch <branch> — documents read from <branch>`; `pcSkipLine(path, reason)` →
  `project context: skipped <path> — <missing|unreadable|outside_clone>`; `pcNotClonedLine()` →
  `project context: skipped — repository not cloned`; `pcSummaryLine(n, m)` → `project context:
  <n> document(s) attached, <m> skipped`. Unit tests in `server/test/project-context-helpers.test.ts`
  covering every AC Verify example: the six AC-4 paths; shuffled paths in code-point order
  (`B.md` before `a.md`); a path with `\n` dropped; one file under each excluded dir dropped;
  `.MARKDOWN` kept; 501 → 500 + total 501 + truncated; 10-char text → 3; agent `[a]` / skill1 `[b]`
  / skill2 `[c]` → `[a,b,c]`; agent `[a,b]` / skill `[b,c]` → `[a,b,c]`; disabled skill's paths
  absent; each AC-70 invalid shape rejected and `specs/a.md` accepted; invalid UTF-8 and NUL bytes →
  not ok; every line builder's exact string.
- **Files:** `server/src/modules/project-context/constants.ts`,
  `server/src/modules/project-context/helpers.ts`, `server/test/project-context-helpers.test.ts`.
- **Done means:** the helper test file passes with one case per example above; `helpers.ts` imports
  nothing outside its module except `zod`/node built-ins that do no I/O (`TextDecoder` is global).
- **Verify:** `node scripts/verify.mjs server test/project-context-helpers.test.ts`
- **Rules that apply:** onion-architecture §1 (ring 1 is the test-speed ring) and
  `server/INSIGHTS.md:52` (filename-based guard); security → strip control characters from anything
  rendered into a prompt (ASI01).
- **Risk:** low.

### W6 — Repository: attachments, inheritance, used-by count, run-time resolution
- **Serves:** AC-14, AC-32, AC-40, AC-46, AC-47, AC-49, AC-68, AC-69 (data half).
- **Do:** `server/src/modules/project-context/repository.ts`, class `ProjectContextRepository(db)`:
  `repoInWorkspace(workspaceId, repoId)` → `{ id, owner, name, clonePath } | undefined`;
  `agentInWorkspace` / `skillInWorkspace` → `{ id, name } | undefined`;
  `agentPaths(agentId, repoId)` / `skillPaths(skillId, repoId)` → ordered `string[]`;
  `replaceAgentPaths(agentId, repoId, paths)` / `replaceSkillPaths(...)` → delete-then-insert
  (`position = index`) inside ONE `db.transaction` (AC-32) and nothing else — no version bump, no
  `agent_versions`/`skill_versions` write (AC-68);
  `linkedSkillPaths(agentId, repoId)` → linked skills in `agent_skills.order` with `id`, `name`,
  `enabled` and their ordered paths for that repo (one query + JS grouping);
  `usedByAgents(workspaceId, repoId, path)` → count of DISTINCT agents of the workspace with a direct
  row for (repo, path) UNION agents linked to an ENABLED skill with a row for (repo, path); agent's
  own `enabled` ignored (AC-14). Every agent/skill/repo read is filtered by `workspace_id`;
  link-table rows are only reached through an owner already resolved in the workspace.
- **Files:** `server/src/modules/project-context/repository.ts`.
- **Done means:** typechecks; no method returns a Drizzle `$inferSelect` type to callers outside the
  module; exercised by the W7/W8 integration tests (that is where its behaviour is asserted).
- **Verify:** `node scripts/verify.mjs server src/modules/project-context/repository.ts`
- **Rules that apply:** drizzle-orm-patterns → transactions for multi-step writes; onion ban 3;
  `server/INSIGHTS.md:46` (resolve the owner by workspace first; link tables have no `workspace_id`).
- **Risk:** a missing workspace filter is a tenant leak — W7/W8 test it.

### W7 — Service + routes: document list and document read; module registration
- **Serves:** AC-2, AC-5, AC-8, AC-9, AC-14, AC-18, AC-41, AC-69, AC-70, AC-72, AC-73, NFR-1.
- **Do:** `service.ts`: `ProjectContextService` with constructor deps
  `{ repo: ProjectContextRepository; git: GitClient }` (ports only, no `Container`).
  `listDocs(workspaceId, repoId)`: repo not in workspace → `undefined` (route → 404); `clonePath`
  null, or `listFiles` rejects `ENOENT` → `AppError('repo_not_cloned', …, 409)`; else
  `listFiles({ excludeDirs: EXCLUDED_DIRS })` → `selectDocs` → for the ≤500 kept docs read bytes →
  `approx_tokens` (unreadable → 0, A-4) → `{ repo_id, branch: await git.currentBranch(), total,
  truncated, docs }`. `readDoc(workspaceId, repoId, path)`: repo not in workspace → undefined;
  `validateDocPath` fails → `AppError('invalid_path', …, 422)`; not cloned → 409; `readFileBytes`
  `ENOENT`/`EOUTSIDECLONE` → `AppError('doc_not_found', …, 404)`; `decodeDoc` not ok →
  `AppError('unreadable', …, 422)`; else `{ path, content, used_by_agents }`. No GitHub port is a
  dependency of this service (AC-9 by construction). `routes.ts` (assembles
  `new ProjectContextService({ repo: new ProjectContextRepository(app.container.db), git:
  app.container.git })`): `GET /repos/:id/context` (`IdParams`) and `GET /repos/:id/context/doc`
  (`IdParams` + querystring `{ path: z.string() }`), both via `getContext`; `undefined` →
  `NotFoundError`. Register `projectContext` in `server/src/modules/index.ts`.
  `server/test/project-context.it.test.ts` (Testcontainers pg + real `SimpleGitClient` over a tmp
  clone dir via `ContainerOverrides.git`, GitHub override that throws on every call): AC-2 fixture
  (included files + one under each excluded dir) returns exactly the included set; 501 docs → 500,
  `total: 501`, `truncated: true`; committed-style symlink `docs/x.md` → outside absent (skip on
  `EPERM`); repo row with `clone_path: null` and one with no dir on disk → 409 `repo_not_cloned`;
  doc read: missing path and outside symlink → 404 `doc_not_found`, binary `.md` → 422 `unreadable`,
  `../a.md` → 422 `invalid_path`; `used_by_agents: 2` for one direct attachment + one via an enabled
  linked skill + one via a disabled skill (rows inserted directly); another workspace's repo id →
  404 on both routes with no content in the body; NFR-1: tmp clone with 10,000 files of which 500
  `.md`, timed list request `< 3000 ms`.
- **Files:** `server/src/modules/project-context/service.ts`,
  `server/src/modules/project-context/routes.ts`, `server/src/modules/index.ts`,
  `server/test/project-context.it.test.ts`.
- **Done means:** every case listed passes in the integration lane; `pnpm arch:check` reports no
  violation in `modules/project-context/` (baseline delta 0, `server/INSIGHTS.md:9`).
- **Verify:** `node scripts/verify.mjs server src/modules/project-context/service.ts src/modules/project-context/routes.ts`
  then `node scripts/verify.mjs server --it` (Docker)
- **Rules that apply:** fastify-best-practices → schema-first validation (`routes.md`,
  `schemas.md`), errors through the global handler (`error-handling.md`); onion §4 and bans 1–2;
  security A01 (ownership check before any read), path traversal.
- **Risk:** Fastify param-name clash if `:repoId` were used beside existing `/repos/:id/*` routes —
  hence `:id` (A-7).

### W8 — Service + routes: agent and skill attachments (GET / POST)
- **Serves:** AC-32, AC-35, AC-40, AC-68, AC-69, AC-70, AC-71.
- **Do:** In `service.ts` add `getAgentDocs(workspaceId, agentId, repoId)`,
  `saveAgentDocs(workspaceId, agentId, { repo_id, paths })`, `getSkillDocs`, `saveSkillDocs`.
  Resolve agent/skill AND repo in the workspace first (either missing → `undefined` → 404). Save:
  every path through `validateDocPath` BEFORE any write (failure → 422 `invalid_path`, stored set
  untouched); then `replace*Paths` in one transaction; respond with the GET shape. GET: for each
  attached (and, for agents, each inherited from `selectInherited`) path, `readFileBytes` →
  `ENOENT`/`EOUTSIDECLONE` → `present: false, approx_tokens: null`; undecodable → `present: true,
  approx_tokens: null` (A-4); else `present: true, approx_tokens`. Not cloned → every attachment
  `present: false` (the stored set is still returned). Routes in `routes.ts`:
  `GET /agents/:id/context-docs` and `GET /skills/:id/context-docs` (querystring
  `{ repo_id: z.string().uuid() }` → missing = 422), `POST /agents/:id/context-docs` and
  `POST /skills/:id/context-docs` (body `SaveContextDocsInput` → >500 or duplicate = 422
  `validation_error`). Extend `server/test/project-context.it.test.ts`: saving `[b,a]` over `[a,c]`
  reads back `[b,a]`; a save containing `../x.md` → 422 `invalid_path` and `[a,c]` unchanged; 501
  paths and a duplicated path → 422, unchanged; a deleted file → `present: false`; inherited lists
  the enabled skill's path with `skill_name` and omits the disabled skill's; agent/skill `version`
  equal before and after a save and no new `agent_versions` / `skill_versions` row; another
  workspace's agent, skill and repo ids → 404 on all four routes, body reveals no path.
- **Files:** `server/src/modules/project-context/service.ts`,
  `server/src/modules/project-context/routes.ts`, `server/test/project-context.it.test.ts`.
- **Done means:** every case above passes in the integration lane; `arch:check` delta 0.
- **Verify:** `node scripts/verify.mjs server src/modules/project-context/service.ts src/modules/project-context/routes.ts`
  then `node scripts/verify.mjs server --it`
- **Rules that apply:** zod → `parse-validate-early`; security A01 (IDOR on agent/skill ids), A08
  (destructure only `repo_id`, `paths`); drizzle → one transaction for the replace.
- **Risk:** Fastify delivers a missing POST body as `null` (`server/INSIGHTS.md:88`) — the body is
  required here, so a 422 is correct; just do not add `.default({})`.

### W9 — Run-time resolution in the service (pure orchestration + skip semantics)
- **Serves:** AC-46, AC-47, AC-49, AC-50, AC-51, AC-55..AC-61, AC-74, AC-75.
- **Do:** Add `resolveForRun({ workspaceId, agentId, repo: { id, owner, name, clonePath }, prBase })`
  to `ProjectContextService` returning `{ docs: { path, content }[]; lines: string[] }` and never
  throwing (AC-60: outer try/catch → `lines: ['project context: skipped — <message>']`, no docs).
  Steps: `agentPaths` + `linkedSkillPaths` for `repo.id` only (AC-46) → `orderRunDocs`; empty → return
  `{ docs: [], lines: [] }` (A-1). Not cloned (`clonePath` null or `currentBranch` rejects `ENOENT`)
  → `[pcNotClonedLine(), pcSummaryLine(0, n)]`. Else `branch = currentBranch`, `sha = currentHead`
  (failure → `unknown`, A-6) → `pcCheckoutLine` (AC-51); `prBase !== branch` → `pcBaseMismatchLine`
  (AC-74; compares with the CLONE branch, never `repos.default_branch` — spec D-28,
  `server/INSIGHTS.md:29`); per path `readFileBytes` → `ENOENT` → missing, `EOUTSIDECLONE` →
  outside_clone, decode fail or any other error → unreadable (A-5); readable text kept in full
  (AC-55); finally `pcSummaryLine`. Calls only `listFiles`-free reads: no `sync`, `clone`, `fetch*`
  (AC-75). Unit-test it in `server/test/project-context-helpers.test.ts` (or a new
  `server/test/project-context-run.test.ts`) with a fake repository object and `MockGitClient`
  (no DB): order across agent + 2 skills with a duplicate and a disabled skill; each skip reason line;
  not-cloned lines; mismatch line present for base `release/1.x` vs branch `main`, absent for base
  `main`, and naming `master` when the mock branch is `master`; zero attachments → no lines.
- **Files:** `server/src/modules/project-context/service.ts`, `server/test/project-context-run.test.ts`.
- **Done means:** the listed unit cases pass; the method has no code path that rethrows.
- **Verify:** `node scripts/verify.mjs server test/project-context-run.test.ts`
- **Rules that apply:** `server/CLAUDE.md` "Context enrichment is best-effort: on error, omit the
  section, don't throw"; onion §4.
- **Risk:** low.

### W10 — Wire injection into the run executor and persist the trace fields
- **Serves:** AC-46, AC-50..AC-52, AC-55..AC-63, AC-74, AC-75 (end to end).
- **Do:** In `run-executor.ts` add `buildProjectContext(workspaceId, pull, repo, agent, runLog)`
  constructing `new ProjectContextService({ repo: new ProjectContextRepository(this.container.db),
  git: this.container.git })` (same legality note as `buildIntentBlock`, `run-executor.ts:398-411`),
  calling `resolveForRun` with `prBase: pull.base`, emitting each line with `runLog.info`, wrapped in
  try/catch (never reaches `failAll`). Call it per agent in `runOneAgent` next to `buildSkills`; pass
  `...(docs.length > 0 ? { specs: docs } : {})` to `reviewPullRequest`; set
  `specs_read: docs.map(d => d.path)` (`run-executor.ts:338`). `traceFromBuffer` keeps `specs_read: []`.
  `server/test/project-context-run.it.test.ts` (pattern of `server/test/reviews.it.test.ts:116-126`;
  repo row with non-null `clone_path`; `MockGitClient` with `docs`/`branch`/`head`; attachments
  inserted through the W8 POST routes): agent with paths in repo A and repo B, run on a repo-B PR →
  only B paths in `specs_read`; a doc changed in the mock between two runs → new text in the second
  trace; PR base `release/1.x` with branch `main` → that text injected + exact AC-74 line; base `main`
  → no such line; mock branch `master` while `repos.default_branch` is `main` → line names `master`;
  log contains `project context: read from clone checkout <branch> @ <head>`; deleted, binary and
  outside paths → their exact skip lines, absent from the prompt; 3 attachments with 1 missing →
  `2 document(s) attached, 1 skipped`; `clone_path: null` → `project context: skipped — repository
  not cloned`, no `## Project context` in `prompt_assembly.user`; every attachment failing → run ends
  `done` with findings persisted; 200 KB document appears byte-for-byte in `prompt_assembly.specs`;
  `specs_read` equals injected paths in order, skipped excluded; with the `MockLLMProvider.calls`
  record, `prompt_assembly.specs` is a substring of the user message of every `completeStructured`
  call for a single-pass agent AND a `strategy: 'map-reduce'` agent over a two-file diff (2 calls);
  `MockGitClient.syncs`, `cloned` and `fetchPullHeads` are equal for a run with and without
  attachments (AC-75).
- **Files:** `server/src/modules/reviews/run-executor.ts`, `server/test/project-context-run.it.test.ts`.
- **Done means:** every case above passes in the integration lane; `server/test/reviews.it.test.ts`
  still passes (runs without attachments are byte-identical in prompt); `arch:check` delta 0.
- **Verify:** `node scripts/verify.mjs server src/modules/reviews/run-executor.ts` then
  `node scripts/verify.mjs server --it`
- **Rules that apply:** onion §4 (inject ports into the service; the executor is the assembly
  point like for intent); security → untrusted text only through the engine's delimiter.
- **Risk:** traces are written after the status flip — wait with `waitForRunTrace`
  (`server/test/helpers/runs.ts`); shared-DB leaks between tests in one file (`server/INSIGHTS.md:25`).

### W11 — Safe markdown, sidebar entry and the `context` namespace
- **Serves:** AC-1, AC-17 (copy), NFR-2, NFR-4, NFR-5.
- **Do:** Add an opt-in `untrusted?: boolean` prop to `client/src/vendor/ui/primitives/Markdown.tsx`:
  when true pass `disallowedElements={["img"]}` to `ReactMarkdown` (no `<img>`, no preload; raw HTML
  is already escaped as text without rehype-raw — Research used); never pass a custom
  `urlTransform` (it would replace the default that blanks `javascript:`). Other call sites unchanged.
  Test `Markdown.test.tsx`: with `untrusted`, a doc holding `<script>alert(1)</script>` and
  `<img src=x onerror=alert(1)>` yields no `script`/`img` element and no element with an `on*`
  attribute; `![x](https://example.com/a.png)` and a reference-style image yield no `img`; `# Title`
  renders an `h1`. Add `{ key: "context", label: "Project Context", icon: "FileText", href:
  "/repos/:repoId/context" }` to the WORKSPACE group of `client/src/vendor/ui/nav.ts` (after Pull
  Requests). Test `client/src/components/app-shell/nav-context.test.ts`: WORKSPACE contains that
  entry and the shell's href resolution (`resolveHref`, located from `client/INSIGHTS.md:35`) fills
  `:repoId` with the active id → `/repos/<id>/context`. Rewrite `client/messages/en/context.json`:
  keep `title`; replace `empty.*` with AC-17's copy (`empty.title`: "No markdown documents found in
  {repo}@{branch}", `empty.refresh`); drop the keys of dropped elements (`chunks`, `reindex`,
  `indexing`, `resync`, `resyncing`, `indexStatus`, `kb`, `mode`, `editor`); add every key W12, W13
  and W15 render (`list.*`, `filter.*`, `truncated` "Showing {shown} of {total} documents",
  `refresh`, `retry`, `loadError`, `preview.*`, `usedBy` "Used by {count} agents", `openOnGithub`,
  `picker.*`: filter placeholder, Preview button, "missing" badge, "via {skill}" badge, drag-handle
  aria label, "Select a repository to attach its documents", category labels).
- **Files:** `client/src/vendor/ui/primitives/Markdown.tsx`,
  `client/src/vendor/ui/primitives/Markdown.test.tsx`, `client/src/vendor/ui/nav.ts`,
  `client/src/components/app-shell/nav-context.test.ts`, `client/messages/en/context.json`.
- **Done means:** both new tests pass; existing Markdown consumers' tests still pass;
  `context.json` contains no `.devdigest/specs/` text.
- **Verify:** `node scripts/verify.mjs client src/vendor/ui/primitives/Markdown.test.tsx src/components/app-shell/nav-context.test.ts src/vendor/ui/primitives/Markdown.tsx`
- **Rules that apply:** frontend-ui-architecture §1 (check `vendor/ui` first — extend, don't fork),
  §7 i18n; security → XSS (no `dangerouslySetInnerHTML`, no rehype-raw).
- **Risk:** low.

### W12 — Project Context page: route, list, filter, states
- **Serves:** AC-6, AC-10, AC-11, AC-12, AC-16, AC-17, AC-19, AC-20, AC-21, NFR-2, NFR-3.
- **Do:** `client/src/app/repos/[repoId]/context/page.tsx` (thin, renders `ContextView`).
  `ContextView` reads `useActiveRepo()` and `useContextFiles(repoId)` (the REUSED hook); local state:
  filter text and selected path; selection is derived `selected ?? visibleOrAll[0]?.path` (no effect,
  AC-12). Loading → skeleton in place of the list (AC-20). Error → `ErrorState`-style message from the
  `ApiError` + Retry calling `refetch()` (AC-19). Empty docs → AC-17 text with `{owner}/{name}` from
  the active repo and `branch` from the response, plus Refresh. Truncated → notice with `total`
  (AC-6). Toolbar: filter input (AC-11, `helpers.ts` `filterDocsByPath`, ci contains) and Refresh
  button calling `refetch()` (AC-16). `DocList`: one row per doc showing the full path, rows are
  `<button>`s with `aria-current`/selected style (AC-10, NFR-3). No Edit/New file/New folder/Upload
  anywhere (AC-21). All strings via `useTranslations("context")`. Tests (`ContextView.test.tsx`,
  fetch mocked, `NextIntlClientProvider` with the real `context.json`): pending → loading state;
  truncated response → "Showing 500 of 501 documents"; two `README.md` in different folders → two
  distinguishable rows; typing `API` keeps `specs/public-api.md`, hides `docs/deploy.md`; first row
  selected and a doc request issued for it; Refresh click → second list request and its result
  rendered; empty → AC-17 text + Refresh; 409 and 500 → message + Retry issues a new request; no
  button/link named Edit, New file, New folder, Upload; no rendered text matches a raw dot-path key
  (`/\b[a-z]+\.[a-zA-Z.]+\b/` on known key prefixes); rows and buttons reachable by Tab
  (`toHaveAttribute("tabindex")` not `-1`, elements are buttons/inputs).
- **Files:** `client/src/app/repos/[repoId]/context/page.tsx`,
  `client/src/app/repos/[repoId]/context/_components/ContextView/{ContextView.tsx,ContextView.test.tsx,helpers.ts,helpers.test.ts,styles.ts,index.ts}`,
  `.../ContextView/_components/DocList/{DocList.tsx,styles.ts,index.ts}`.
- **Done means:** all listed cases pass.
- **Verify:** `node scripts/verify.mjs client "src/app/repos/[repoId]/context/_components/ContextView/ContextView.test.tsx" "src/app/repos/[repoId]/context/_components/ContextView/helpers.test.ts"`
- **Rules that apply:** frontend-ui-architecture §1 (route-local `_components/`), §5 (data via hooks,
  derive don't store); react-best-practices (no `useEffect` for selection, no index keys — key by
  path); next-best-practices (`'use client'` at the view, `useParams` usage).
- **Risk:** low.

### W13 — Preview pane with header: used-by count and "Open on GitHub"
- **Serves:** AC-13, AC-14 (client), AC-15, NFR-3, NFR-4/5 (applied).
- **Do:** `DocPreviewPane({ repo, branch, path })` uses `useContextDoc(repoId, path)`; header shows
  the path, `t("usedBy", { count })` from `used_by_agents`, and an `<a target="_blank"
  rel="noopener noreferrer">` to `githubBlobUrl(owner, name, branch, path)` (pure helper in
  `ContextView/helpers.ts`: `https://github.com/<owner>/<name>/blob/<branch>/<path>` with EVERY
  segment of branch and path `encodeURIComponent`-ed); body `<Markdown untrusted>{content}</Markdown>`;
  doc errors (`doc_not_found`, `unreadable`) render the API message. Tests: `# Title` → heading;
  `used_by_agents: 2` → "Used by 2 agents"; link for `docs/a b.md` has `href` ending
  `/blob/main/docs/a%20b.md`, `target="_blank"`, `rel="noopener noreferrer"`; helper unit test for
  a branch `release/1.x`.
- **Files:** `.../ContextView/_components/DocPreviewPane/{DocPreviewPane.tsx,DocPreviewPane.test.tsx,styles.ts,index.ts}`,
  `.../ContextView/helpers.ts`, `.../ContextView/helpers.test.ts`, `.../ContextView/ContextView.tsx`.
- **Done means:** all listed cases pass.
- **Verify:** `node scripts/verify.mjs client "src/app/repos/[repoId]/context/_components/ContextView/_components/DocPreviewPane/DocPreviewPane.test.tsx" "src/app/repos/[repoId]/context/_components/ContextView/helpers.test.ts"`
- **Rules that apply:** security → validate URLs before `href` (built from stored owner/name +
  server branch, encoded); react-best-practices accessibility (link has visible text).
- **Risk:** low.

### W14 — Run trace: project-context label and tests
- **Serves:** AC-65, AC-66 (unit), AC-67, NFR-2.
- **Do:** Change `client/messages/en/runs.json` `trace.prompt.specs` to "Project context — attached
  specs (untrusted)". No component change (`TraceBody.tsx:43-55,91-93` already renders both;
  `client/INSIGHTS.md:37`). Add cases to `RunTraceDrawer.test.tsx`: a trace with
  `prompt_assembly.specs` renders the new label; clicking the block's header shows the full specs
  text (a multi-line string with two `### path` lines, asserted with `toHaveTextContent`); `specs_read:
  ["a.md","b.md"]` renders both under "Specs read".
- **Files:** `client/messages/en/runs.json`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx`.
- **Done means:** the three new cases pass and the existing trace tests still pass.
- **Verify:** `node scripts/verify.mjs client "src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx"`
- **Rules that apply:** frontend-ui-architecture §7 (add the key with the string); react-testing-library
  (query by role/text, `fireEvent` — no user-event, `client/INSIGHTS.md:50`).
- **Risk:** low.

### W15 — Attachment hooks and the shared `ContextDocPicker`
- **Serves:** AC-25..AC-31, AC-33..AC-36, NFR-2, NFR-3.
- **Do:** Hooks: in `lib/hooks/agents.ts` `useAgentContextDocs(agentId, repoId)` (key
  `["agent-context-docs", agentId, repoId]`, `GET /agents/${id}/context-docs?repo_id=…`) and
  `useSetAgentContextDocs()` (POST `{ repo_id, paths }`, on success `setQueryData` with the response,
  `meta: { quietError: true }` because the tab shows its own error — `client/INSIGHTS.md:23`); the
  same pair in `lib/hooks/skills.ts`. `client/src/components/ContextDocPicker/`: props
  `{ docs: ContextDoc[]; attached: ContextAttachment[]; inherited?: InheritedContextAttachment[];
  onSave(paths: string[]); saveError?: string; onPreview? }` plus header slot. `helpers.ts` (pure):
  `buildRows(docs, attached, inherited)` → attached rows in attachment order (including paths absent
  from the list — EC-19 — and missing ones), then inherited rows (read-only), then unattached list
  docs in the list's order (A-8); `filterRows` (ci path contains, AC-34); `toggleAttachment` (append /
  remove, AC-28/29); `moveAttachment(paths, path, ±1)` and drag reorder via `reorderIds` from
  `@/lib/reorder`; `rowLabel(path)` → `{ name, folder }` (folder with trailing `/`, AC-27);
  `categoryForPath` (client twin of AC-4 for rows outside the list, A-9). Row: native checkbox
  (vendored `Checkbox`), mono file name, folder, category badge, "missing" badge when `present:
  false`, Preview `<button>`, and — attached rows only — a drag handle `<button>` with ↑/↓ handling
  (pattern `SkillsTab.tsx`). Inherited rows: no checkbox, no handle, "via {skill}" badge. Every
  change calls `onSave` once with the complete ordered list (AC-31). The displayed order is derived
  from server data only (no local copy), so a failed save shows the last saved set; `saveError`
  renders as `role="alert"` (AC-33). `_components/DocPreviewModal/` renders `useContextDoc` content
  with `<Markdown untrusted>` inside the vendored `Modal` (AC-36). No active repo → the "Select a
  repository…" message and no rows (AC-26, owned by the picker's container prop `repoId: null`).
  Tests (`helpers.test.ts`, `ContextDocPicker.test.tsx`): attachments `[b, a]` render `b, a` then
  the rest in list order; null repo → message and no rows; row for `specs/public-api.md` shows
  `public-api.md`, `specs/`, `specs`; ticking `c` with `[a,b]` saves `[a,b,c]`; unticking `a` saves
  `[b]`, also on a missing row; drag of `b` onto `a` and ↑ on `b`'s handle each save `[b,a]`; one
  save per change carrying every path; failing save → alert text + previous order; filter hides
  non-matching rows and keeps matching attached rows; `present: false` → "missing" badge; Preview
  click opens a dialog rendering the doc's markdown; handles and checkboxes are buttons/inputs.
- **Files:** `client/src/lib/hooks/agents.ts`, `client/src/lib/hooks/skills.ts`,
  `client/src/components/ContextDocPicker/{ContextDocPicker.tsx,ContextDocPicker.test.tsx,helpers.ts,helpers.test.ts,styles.ts,index.ts}`,
  `client/src/components/ContextDocPicker/_components/DocPreviewModal/{DocPreviewModal.tsx,styles.ts,index.ts}`.
- **Done means:** all listed cases pass; the picker imports shared contracts with `import type` only.
- **Verify:** `node scripts/verify.mjs client src/components/ContextDocPicker/ContextDocPicker.test.tsx src/components/ContextDocPicker/helpers.test.ts`
- **Rules that apply:** frontend-ui-architecture §1 (two routes → `src/components/`), §2 (narrow
  barrel), §5 (never copy query data into state); react-best-practices (no index keys, no derived
  state, accessibility for icon-only buttons — `aria-label` on the handle).
- **Risk:** label collisions in tests ("Preview" tab vs button) — scope queries
  (`client/INSIGHTS.md:51`).

### W16 — Agent editor: Context tab
- **Serves:** AC-22, AC-26, AC-37, AC-40 (client), AC-42, AC-44, NFR-2.
- **Do:** Add `{ key: "context", labelKey: "editor.tabs.context", icon: "FileText" }` as the third
  entry of `AgentEditor/constants.ts` `TABS`; render `ContextTab` for `tab === "context"` in
  `AgentEditor.tsx`. `_components/ContextTab/ContextTab.tsx`: `useActiveRepo()`,
  `useContextFiles(repoId)`, `useAgentContextDocs(agent.id, repoId)`, `useSetAgentContextDocs()` →
  `ContextDocPicker` with `inherited`. Header: `t("context.attachedOf", { n: attached.length, total:
  docs.length })` (A-10), `≈ N tokens` from `helpers.ts` `agentTokenEstimate(attached, inherited)` =
  sum of `approx_tokens` over DISTINCT paths with `present && approx_tokens != null`, note "Injected
  as an untrusted block (## Project context) into every run.". List error → message + Retry (A-11).
  Keys in `agents.json`. Tests: tab order Config · Skills · Context and `tab="context"` renders the
  Context tab (`AgentEditor.test.tsx`); "2 of 7 attached"; inherited rows show "via Security Rules"
  and no checkbox/handle; estimate for attached 100 + inherited 50 + one path both attached and
  inherited + one missing → deduplicated sum; the note text; no active repo → AC-26 message.
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts,AgentEditor.test.tsx}`,
  `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/{ContextTab.tsx,ContextTab.test.tsx,helpers.ts,styles.ts,index.ts}`,
  `client/messages/en/agents.json`.
- **Done means:** all listed cases pass; existing `SkillsTab.test.tsx` and `AgentEditor.test.tsx`
  cases still pass.
- **Verify:** `node scripts/verify.mjs client "src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx" "src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx"`
- **Rules that apply:** frontend-ui-architecture §1 (route-local), §4 (constants in `constants.ts`);
  react-best-practices (derive the estimate, no `useMemo` unless measured).
- **Risk:** low.

### W17 — Skill editor: tab order, Config default, Context tab
- **Serves:** AC-23, AC-24, AC-26, AC-38, AC-39, AC-43, AC-45, NFR-2.
- **Do:** Reorder `SkillEditor/constants.ts` `TABS` to Config · Context · Preview · Stats ·
  Versions; `DEFAULT_TAB` stays `TABS[0]!.key` (now `config`); rewrite its comment to record that
  SPEC-01 D-18 reverses `client/specs/L02-skills.md` R3 (do not edit the legacy spec). Render
  `ContextTab` for `tab === "context"`. `_components/ContextTab/`: picker without `inherited`; header
  `t("context.attached", { n })`; `≈ N tokens` over present attachments with non-null
  `approx_tokens`; note "Any agent using this skill inherits these documents."; "Serializes as" box
  from pure `serializePreview(paths)` → `## Project context`, then per path `### <path>` and
  `<untrusted …>…</untrusted>`. Keys in `skills.json`. Update `SkillEditor.test.tsx`'s "puts Preview
  first" case to the new order. Tests: tab order and `tab="context"`; `DEFAULT_TAB === "config"` and
  the page's fallback (no `?tab`) selects Config; "1 attached"; two present attachments of 40 and 60
  → "≈ 100 tokens"; the note; `[specs/public-api.md]` → heading, path line and placeholder.
- **Files:** `client/src/app/skills/[id]/_components/SkillEditor/{SkillEditor.tsx,constants.ts,SkillEditor.test.tsx}`,
  `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/{ContextTab.tsx,ContextTab.test.tsx,helpers.ts,styles.ts,index.ts}`,
  `client/messages/en/skills.json`.
- **Done means:** all listed cases pass; the remaining `SkillEditor.test.tsx` cases still pass.
- **Verify:** `node scripts/verify.mjs client "src/app/skills/[id]/_components/SkillEditor/SkillEditor.test.tsx" "src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/ContextTab.test.tsx"`
- **Rules that apply:** frontend-ui-architecture §4 (`DEFAULT_TAB` derived from `TABS`, coupled
  constants in one file); `client/INSIGHTS.md:34` (change the documented decision deliberately,
  with the comment, not silently).
- **Risk:** other tests asserting Preview as the landing tab — grep `tab="preview"` defaults before
  finishing.

## Execution

| Lane | Executor | Work items | Files (disjoint) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| L0 — contracts (phase 0) | implementer | W1, W2 | both `vendor/shared/contracts/platform.ts`, both `vendor/shared/adapters.ts`, `client/src/lib/hooks/core.ts`, `client/src/lib/types.ts`, `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts`, `server/test/git-list-files.test.ts`, `server/test/contracts.test.ts` | — | L1 | shared tree |
| L1 — reviewer-core | implementer | W3 | `reviewer-core/src/{prompt.ts,index.ts,review/run.ts}`, `reviewer-core/test/{prompt,run}.test.ts`, `server/test/prompt-callers.test.ts` | — | L0, L2, L4 | shared tree |
| L2 — server data + endpoints | implementer | W4, W5, W6, W7, W8 | `server/src/db/schema/project-context.ts`, `server/src/db/{schema,rows}.ts`, `server/src/db/migrations/**`, `server/src/modules/project-context/*`, `server/src/modules/index.ts`, `server/test/project-context-helpers.test.ts`, `server/test/project-context.it.test.ts` | L0 | L1, L4, L5 | shared tree; W4's `pnpm db:generate` writes only `server/src/db/migrations/**`, which no other lane touches |
| L3 — server run injection | implementer | W9, W10 | `server/src/modules/project-context/service.ts` (after L2), `server/src/modules/reviews/run-executor.ts`, `server/test/project-context-run.test.ts`, `server/test/project-context-run.it.test.ts` | L1, L2 | L4, L5 | shared tree (serialized after L2, so the shared `service.ts` is never edited concurrently) |
| L4 — client page + trace | implementer | W11, W12, W13, W14 | `client/src/vendor/ui/primitives/Markdown{,.test}.tsx`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/nav-context.test.ts`, `client/messages/en/{context,runs}.json`, `client/src/app/repos/[repoId]/context/**`, `RunTraceDrawer.test.tsx` | L0 | L1, L2, L3 | shared tree |
| L5 — client Context tabs | implementer | W15, W16, W17 | `client/src/lib/hooks/{agents,skills}.ts`, `client/src/components/ContextDocPicker/**`, `client/src/app/agents/[id]/_components/AgentEditor/**`, `client/src/app/skills/[id]/_components/SkillEditor/**`, `client/messages/en/{agents,skills}.json` | L0, L4 (uses `Markdown untrusted` and `context.json` `picker.*` keys) | L2, L3 | shared tree |

Schedule: **L0 ∥ L1** → **L2 ∥ L4** (L1 may still be running) → **L3** (after L1 + L2) **∥ L5**
(after L4). What may start before L0 lands: only L1 (reviewer-core does not consume the changed
contracts or the port). Everything else waits for L0, because L0 removes `SpecFile` and widens
`GitClient`, and both packages fail typecheck against a half-landed contract. Each executor is
dispatched with this plan's path **and its lane id**, and touches only its lane's files. A lane
whose dependency's item is not green does not start.

**Integration:** after the last lane, one agent runs the full Verification plan and these
cross-lane checks: (1) `server/test/vendor-shared-sync.test.ts` and
`client/src/test/vendor-shared-sync.test.ts` both green; (2) `projectContext` present in
`server/src/modules/index.ts`; (3) exactly one new migration under `server/src/db/migrations/`;
(4) `grep -rn "from \"@devdigest/shared\"" client/src` shows no new non-`type` import (else run
`pnpm build`); (5) `grep -rn "SpecFile" server/src client/src` empty; (6) `server/test/reviews.it.test.ts`
green (prompt unchanged for agents without attachments).

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | typecheck clean · unit suite green (a red test is a regression until proven otherwise) · `arch:check` no new violation against the baseline |
| `node scripts/verify.mjs server --it` | repo root | — | integration lane green incl. `project-context.it.test.ts`, `project-context-run.it.test.ts`, `reviews.it.test.ts` (needs Docker) |
| `node scripts/verify.mjs reviewer-core` | repo root | — | typecheck + all engine tests green |
| `node scripts/verify.mjs client` | repo root | — | typecheck + all client unit tests green |
| `pnpm db:migrate` | `server/` | pnpm | the new migration applies on the dev DB (only if a dev DB is running) |
| `pnpm build` | `client/` | pnpm | only if integration check (4) finds a value import from `@devdigest/shared` |

No e2e command is planned: `./scripts/e2e.sh` runs seeded, model-free flows that cannot produce a
cloned repository (Spec follow-up 1); never `npm test` in `e2e/` against the dev stack.

## Assumptions

- **A-1** Run-time resolution (W9) runs only when the agent has ≥1 path attached for the PR's repo
  (directly or via an enabled linked skill). With none, no `project context:` line is logged and the
  clone is not touched. (Spec follow-up 2.)
- **A-2** `approx_tokens` uses `Math.ceil(text.length / 4)` over the decoded string (UTF-16 code
  units), matching both existing estimators (`client/src/lib/skills.ts:79-81`,
  `server/src/adapters/tokenizer/index.ts:21-23`) cited by spec D-12.
- **A-3** "No local clone" = `repos.clone_path` is null OR the clone directory does not exist
  (adapter rejects `ENOENT`); the adapter's derived path (`clonePathFor`, `simple-git.ts:37`) is the
  one read, as `intent/service.ts:242-247` already does.
- **A-4** Undecodable documents: list → `approx_tokens: 0`; attachments → `present: true,
  approx_tokens: null` (excluded from the tab estimate, as a run would skip them). (Spec follow-up 3.)
- **A-5** Any read error other than `ENOENT`/`EOUTSIDECLONE`/decode failure is logged with the
  `unreadable` reason. (Spec follow-up 7.)
- **A-6** If `currentHead` fails, the checkout line carries `unknown` and reading continues; if
  `currentBranch` fails with anything but `ENOENT`, no AC-74 comparison is made.
- **A-7** Routes use the existing `:id` param name (`/repos/:id/context`, `/repos/:id/context/doc`)
  to match the other `/repos/:id/*` routes; the URL is identical to the spec's `:repoId` form.
- **A-8** Agent tab row order: attached (attachment order) → inherited (run order) → unattached
  (list order). An inherited path is attributed to the first enabled linked skill in link order.
  (Spec follow-up 5.)
- **A-9** Category of a row outside the list is computed by a client twin of the AC-4 rule.
  (Spec follow-up 4.)
- **A-10** AC-37 `{total}` = number of listed documents (`docs.length`). (Spec follow-up 6.)
- **A-11** A Context tab whose list request fails shows the error message with Retry (AC-19's
  behaviour reused); attachments are not modified.
- **A-12** Page selection and filter are local component state, not URL params.
- **A-13** `Markdown`'s new `untrusted` prop is opt-in; other screens keep current rendering.

## Open questions

None. Every `Not established` item from research is either irrelevant to an AC or handled by an
explicit skip: symlink creation without privilege on Windows is assumed `EPERM` (Node docs, not
reproduced) — tests skip on it, as `server/test/git-read-file.test.ts:41-44` already does.

## Research used

- **Q (researcher, 2026-10-02):** react-markdown 9.1.0 raw HTML / image / URL handling; Node 22
  `TextDecoder`, `readdir` symlink entries, Windows `realpath`; `git rev-parse --abbrev-ref HEAD`.
  **Relied on:** without rehype-raw, raw HTML is rendered as escaped text (no element), `skipHtml`
  default false (`client/node_modules/react-markdown/lib/index.js:112,355-361`); markdown and
  reference-style images render a real remote `<img>` (plus a React 19 image preload) unless
  `disallowedElements={['img']}` or `components.img → null`, both of which remove both
  (`lib/index.js:386-401`, verified by render); the default `urlTransform` blanks `javascript:`
  case-insensitively and a custom one replaces that default (`lib/index.js:113,416-439`);
  `TextDecoder('utf-8', {fatal:true})` throws `TypeError` `ERR_ENCODING_INVALID_ENCODED_DATA` and
  strips a BOM unless `ignoreBOM: true` (local run, Node v22.12.0); `Dirent.isSymbolicLink()` true and
  `isFile()/isDirectory()` false for file symlinks, dir symlinks and junctions; Windows `realpath`
  resolves them; `rev-parse --abbrev-ref HEAD` prints the branch, `HEAD` when detached, and a
  `--depth 1` clone without `--branch` checks out the remote's default; `rev-parse HEAD` is the full
  40-hex SHA in a shallow SHA-1 repo (git 2.49 local run; https://git-scm.com/docs/git-rev-parse).
  **Not established:** `EPERM` on unprivileged Windows symlink (docs only); preload behaviour in
  client-side render (moot once `<img>` is blocked); empty-repo / SHA-256 git edge cases.

## Rollback / blast radius

Reverting the files removes the feature, but **not** the migration: the two tables stay in any
database that ran `pnpm db:migrate` (harmless — nothing else reads them; drop them by hand on a dev
DB if needed, never with `docker compose down -v`). Reverting W1 restores `SpecFile`; both
`vendor/shared` copies must be reverted together. Saved attachment rows are user data and are lost
with the tables. Blast radius at run time: W10 adds one best-effort pre-step per agent run; with
no attachments the prompt is byte-identical to today (A-1), so existing reviews are unaffected.
The skill editor's landing tab changes from Preview to Config for every skill (intended, spec D-18).
