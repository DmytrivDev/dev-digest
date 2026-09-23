# Plan: Smart Diff (L03 homework)

**Goal** — On the PR detail page's "Files changed" tab, files show up in five role groups by default (core → tests → wiring → docs → boilerplate), and the latest review's findings appear in the diff: a counter on each group header, a dot on each file header, and a finding card under the line it cites. A "Smart order / Original order" toggle switches back to GitHub order.

**In scope**
- A pure server classifier `classifyFile(path)`, plus a new `GET /pulls/:id/smart-diff` endpoint in its own module.
- Widening `SmartDiffRole` to five roles in both vendored copies.
- Seed data that shows all five roles and anchors the seeded findings on real lines.
- A `useSmartDiff` hook; group headers, a toggle, per-file dots and inline finding cards on the client.
- P2/P3 polish: findings not on a diff line, one show/hide toggle, empty state, sticky header, collapsible finding.

**Out of scope**
- LLM work: `pseudocode_summary` stays null, `split_suggestion.proposed_splits` stays `[]`, `too_big` is always `false`.
- Using the classifier as the L08 pre-prompt filter. This plan only makes that possible: it is a pure, HTTP-free export.
- `server/specs` / `client/specs` / `docs/` write-ups. `doc-writer` owns those.
- Fixing the hardcoded strings DiffTab already has, except the two this change touches (W8).
- Migrating the known onion debt in `reviews/service.ts`.
- Architecture review and security review. Separate agents do those; they are not this plan's concern.

**Work continues on branch `chore/agent-tooling`.** This is the user's decision. Do not create a branch.

## Key decisions (read before starting)

1. **Own module, `server/src/modules/smart-diff/`, not `reviews/smart-diff/`.**
   - `modules/index.ts:23` already names "intent/smart-diff" as a lesson module.
   - `reviews/service.ts:33` takes the whole `Container`, which is known debt (onion-architecture §5). Nesting inside `reviews` would put new code next to that pattern.
   - A new module can inject a repository cleanly (`server/INSIGHTS.md:39`).
2. **`classifyFile` lives in `modules/smart-diff/helpers.ts`, not in a `classify.ts`.** The ring-1 guard `core-not-to-io` (error severity) matches only `(cost|status|findings|helpers)\.ts` (`server/.dependency-cruiser.cjs:22,43-58`). A `classify.ts` would be pure, but no check would enforce that. L08 imports it from `modules/smart-diff/helpers.js`.
3. **No glob dependency.** The five rules become hand-written predicates on normalised path segments, driven by a rule table in `constants.ts`. Normalisation:
   - `\` becomes `/`.
   - Leading `./` and `/` are stripped.
4. **The server always returns all five groups, in `ROLE_ORDER`, including empty ones** (`files: []`).
   - The client renders all five headers. An empty group reads "0 files", is collapsed and cannot be expanded.
   - This makes "five groups, fixed order" a stable, testable shape.
5. **One source of findings for everything on screen, with two feeds that invalidate together.**
   - The group counter and the file dot come from smart-diff `finding_lines` (the server is authoritative).
   - Inline cards come from `usePrReviews(prId)`: the latest review with `kind === "review"`, picked by the same rule as the server (`server/INSIGHTS.md:35`, `pulls/routes.ts:124-133`).
   - Do NOT use `reviews[0]`. FindingsTab picks nothing; it renders every run (`FindingsTab.tsx:157`), so the reference rule is the PR-list one.
   - Both count every finding of that review, accepted and dismissed included. This matches `pulls/findings.ts:13-14`, which renders dismissed findings muted.
6. **Query key `["reviews", prId, "smart-diff"]`.**
   - TanStack's `invalidateQueries({ queryKey: ["reviews", prId] })` is a prefix match. So every existing reviews invalidation also refreshes smart-diff, with no new call sites. Those sites are `useRunReview`, `useFindingAction`, `useDeleteRun` and `useDeleteReview` in `lib/hooks/reviews.ts:68,85,133,158`.
   - W5 pins this with a test rather than trusting it.
   - The one gap is `page.tsx:162`. It calls `refetchReviews()` (single query, not a prefix), so W5 changes it.
7. **FindingCard stays route-local, and DiffViewer receives it as a slot.**
   - DiffViewer (shared, `src/components/diff-viewer/`) gets an optional `annotations` prop. Each item carries an already-built `content: ReactNode`.
   - DiffTab, which is in the same route as `FindingCard`, builds `<FindingCard …/>` elements and passes them down. There is no upward import and no `renderX()` function (react-best-practices → Render Factories), and nothing moves.
   - DiffViewer stays generic ("annotations on lines"). It never learns what a finding is.
8. **All new DiffViewer props are optional.** `client/src/test/smoke.test.tsx:5` renders `DiffViewer` with only `shell` messages and no annotations, and it must keep passing unchanged.
9. **No client value import from `@devdigest/shared`.** Role order arrives in the response, and the client only needs `import type { SmartDiff, SmartDiffRole }`. `pnpm build` is still required, as a guard (`client/INSIGHTS.md:22`).
10. **Order toggle is local `useState` in DiffTab, default `"smart"`.** It is a per-visit view preference. Moving it to `?order=` is a cheap follow-up if wanted (frontend-ui-architecture §5 "Where state lives").

## Affected surface

| File | New/Mod | Package | Ring / home | Skills that will govern it (routing.json) | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts` | Mod | api | Ports (ring 2) | zod | Byte-identical with the client copy, comments included (`server/INSIGHTS.md:37`; routing.json:167 suppress note). The enum is edited in place, so section order is unchanged (`server/INSIGHTS.md:43`). |
| `client/src/vendor/shared/contracts/brief.ts` | Mod | web | Ports (vendored copy) | zod | Same edit, same bytes (`client/src/test/vendor-shared-sync.test.ts`). |
| `server/test/contracts.test.ts` | Mod | api | test | — (unrouted, see gaps) | Add a `tests`-role parse case next to `:107`. |
| `server/src/modules/smart-diff/constants.ts` | New | api | Core data (ring 1) | onion-architecture (+ typescript-expert if it uses `Record<`/`satisfies`) | `as const` tables, no enum (frontend-ui §4 applies equally). Imports nothing but the type `SmartDiffRole`. |
| `server/src/modules/smart-diff/helpers.ts` | New | api | Core (ring 1) | onion-architecture | Pure: no db/fetch/clock. Must stay inside RING1 so `core-not-to-io` guards it (`.dependency-cruiser.cjs:22,43`). |
| `server/src/modules/smart-diff/repository.ts` | New | api | Application (ring 3) | onion-architecture, drizzle-orm-patterns | Every read is workspace-scoped. Findings are queried only by a `review_id` that came from a workspace-scoped read (`server/INSIGHTS.md:34`). Row types never leave the module (onion ban 3). |
| `server/src/modules/smart-diff/service.ts` | New | api | Application (ring 3) | onion-architecture, security | `constructor(private repo: SmartDiffRepository)`, no `Container` (`server/INSIGHTS.md:39`; rule `service-not-to-composition-root`, `.dependency-cruiser.cjs:112`). 404 on a PR from another workspace (security A01). |
| `server/src/modules/smart-diff/routes.ts` | New | api | Adapter (ring 4) | onion-architecture, security, fastify-best-practices | No `drizzle-orm`/`db/schema` import (`.dependency-cruiser.cjs:80-98`). Composes `new SmartDiffService(new SmartDiffRepository(app.container.db))` (`server/INSIGHTS.md:39`). `schema.response[200] = SmartDiffResponse`. |
| `server/src/modules/index.ts` | Mod | api | Composition (registry) | onion-architecture | Exactly one import and one entry (`index.ts:17-20`). |
| `server/src/db/seed-pulls.ts` | New | api | db data (ring 4) | onion-architecture | Must NOT import from `src/modules/` (`db-not-to-modules`, error, `.dependency-cruiser.cjs:60-66`). |
| `server/src/db/seed.ts` | Mod | api | db (ring 4) | onion-architecture, drizzle-orm-patterns (content), security (content: `process.env`) | Seed inserts only when PR #482 is absent and never updates (`seed.ts:111`; `server/INSIGHTS.md:46`). |
| `server/test/smart-diff-classify.test.ts` | New | api | unit test | — (unrouted) | Written FIRST, table-driven. No DB, so no `.it.` suffix. |
| `server/test/smart-diff-build.test.ts` | New | api | unit test | — (unrouted) | Pure `buildSmartDiff` + service with a fake repository. No DB. |
| `server/test/smart-diff.it.test.ts` | New | api | integration test | — (unrouted) | `.it.test.ts` suffix is mandatory (`server/CLAUDE.md`). Pass `createdAt` explicitly (`server/INSIGHTS.md:51`). |
| `client/messages/en/prReview.json` | Mod | web | i18n | frontend-ui-architecture | A missing key renders raw text, silently (`client/INSIGHTS.md:31`). Keep the existing `coreLabel`/`wiringLabel`/`boilerplateLabel`/`filesCount` (`prReview.json:58-67`). |
| `client/messages/en/shell.json` | Mod | web | i18n | frontend-ui-architecture | New key under the existing `diffViewer` block (`shell.json:36`). |
| `client/src/lib/hooks/reviews.ts` | Mod | web | data hook | frontend-ui-architecture, react-best-practices, next-best-practices (content `"use client"`) | Type-only import of `SmartDiff`. Query key `["reviews", prId, "smart-diff"]`, `enabled: !!prId` like `usePrReviews` (`reviews.ts:51-57`). |
| `client/src/lib/hooks/reviews.test.ts` | New | web | unit test | react-testing-library | Pins the prefix-invalidation assumption (decision 6). |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Mod | web | route page | frontend-ui-architecture, react-best-practices, next-best-practices | Replace `refetchReviews()` in `onRunDone` (`page.tsx:159-163`) with a prefix invalidation. Page stays thin. |
| `client/src/components/diff-viewer/annotations.ts` | New | web | shared component, pure | frontend-ui-architecture | Pure `partitionAnnotations`, reusing `keysForLine`/`lineKey` (`comments.ts:34,63`). `ReactNode` is a type import only. |
| `client/src/components/diff-viewer/annotations.test.ts` | New | web | unit test | react-testing-library | Pure-function test, no renderer. |
| `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` | Mod | web | shared component | frontend-ui-architecture, react-best-practices, next-best-practices | Optional `annotations` + `marks` props, threaded to FileCard. `key={i}` stays as is (pre-existing). |
| `client/src/components/diff-viewer/FileCard/FileCard.tsx` | Mod | web | shared component | same three | Dot next to the path, visually distinct from the `MessageSquare` counter (`FileCard.tsx:67`). Partition annotations the way threads are (`FileCard.tsx:43-49`). |
| `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | Mod | web | shared component | same three | Stripe + right label + slot content under the row. Never mix `border` shorthand with longhand (frontend-ui §7). Use `boxShadow: inset 3px 0 0 <color>` or all-longhand `borderLeft*`. |
| `client/src/components/diff-viewer/UnanchoredAnnotations/{UnanchoredAnnotations.tsx,index.ts}` | New | web | shared component | same three | Mirrors `OutdatedComments` (`OutdatedComments/OutdatedComments.tsx`) and reuses `cs.outdatedWrap`/`cs.outdatedTitle`. |
| `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` | New | web | component test | react-testing-library | `fireEvent` only, no user-event in this repo (`client/INSIGHTS.md:46`). |
| `client/src/components/diff-viewer/index.ts` | Mod | web | barrel | frontend-ui-architecture | Also export `type DiffAnnotation, DiffAnnotationApi`. Narrow barrel, no aggregation (frontend-ui §2). |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | Mod | web | route-local | frontend-ui-architecture, react-best-practices, next-best-practices | ≤200 lines (react-best-practices → Component Design). Logic goes to `helpers.ts`. No derived state in `useState`. |
| `…/DiffTab/constants.ts` | New | web | route-local | frontend-ui-architecture | `ROLE_META` (label key, hint key, colour var), `COLLAPSED_BY_DEFAULT`, `SEVERITY_RANK`, `FINDING_LABEL_KEY`. |
| `…/DiffTab/helpers.ts` | New | web | route-local, pure | frontend-ui-architecture | `selectLatestReview`, `groupFilesByRole`, `filesWithFindings`, `findingsToAnnotationSpecs`. No React. |
| `…/DiffTab/helpers.test.ts` | New | web | unit test | react-testing-library | Pure tests. |
| `…/DiffTab/styles.ts` | New | web | route-local | frontend-ui-architecture | `s` object. Colours via CSS vars only (frontend-ui §7). |
| `…/DiffTab/DiffTab.test.tsx` | New | web | component test | react-testing-library | `vi.mock` the hooks module like `FindingsPanel.test.tsx:7`. Scope repeated texts with `within` (`client/INSIGHTS.md:45,47`). |
| `…/DiffTab/_components/SmartDiffGroup/{SmartDiffGroup.tsx,index.ts,styles.ts}` | New | web | route-local child of DiffTab | frontend-ui-architecture, react-best-practices, next-best-practices | Lives under DiffTab's own `_components/` because only DiffTab uses it (frontend-ui §1–2). `{n > 0 && …}`, never `{n && …}` (react-best-practices → Conditional Rendering). |
| `…/DiffTab/_components/SmartDiffGroup/SmartDiffGroup.test.tsx` | New | web | component test | react-testing-library | Group counter = number of FILES that have findings. |

**Coverage gaps:**
- Every `server/test/*.ts` file above: `smart-diff-classify.test.ts`, `smart-diff-build.test.ts`, `smart-diff.it.test.ts`, and the edit to `contracts.test.ts`. No routing.json glob covers `server/test/**`: onion-architecture's glob is `server/src/**`, and react-testing-library's is `client/**`.
- This plan file itself (`docs/**` is unrouted).

No domain reviewer will look at these files. Their correctness rests on this plan and on actually running them.

## Contract changes

- **vendor/shared: yes.**
  - `brief.ts:81` becomes `export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);`. That is the fixed role order, and the enum declaration order is the display order.
  - Same bytes in `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`.
  - No new schema, and no section move: `SmartDiffRole` is still declared above `SmartDiffGroup`, which uses it (`brief.ts:93-95`).
  - `SmartDiffResponse` already exists (`review-api.ts:64`). Nothing else references `SmartDiffRole` (grep: only `brief.ts`).
- **Migration: no.** `pr_files`, `reviews` and `findings` already carry everything (`db/schema/pulls.ts:36`, `db/schema/reviews.ts:38`).
- **Seed: yes.**
  - PR #482 currently seeds 4 files, all `core`, with no patches (`seed.ts:132-137`), while claiming `filesCount: 9` (`seed.ts:125`).
  - The seed must produce 9 files covering all five roles. Two of them need patches so the two seeded findings anchor on rendered lines: `src/config.ts` at RIGHT:12 and `src/api/users.ts` at RIGHT:45.
- **Client build check needed: yes.** No value import is planned (decision 9), but the build is the only thing that would catch one slipping in (`client/INSIGHTS.md:22`). Run `pnpm build` in `client/` with no dev server running (`client/INSIGHTS.md:40`).
- **i18n: yes.**
  - `client/messages/en/prReview.json` → `smartDiff.*`:
    - Required: `testsLabel`, `docsLabel`.
    - Role hints: `coreHint`, `testsHint`, `wiringHint`, `docsHint`, `boilerplateHint`.
    - Toggle: `orderSmart`, `orderOriginal`.
    - Finding labels: `findingLabel.blocker`, `findingLabel.warning`, `findingLabel.suggestion`.
    - Markers: `filesWithFindings` (`"{count} files with findings"`), `fileHasFindings`.
    - Empty state: `reviewNotRun`.
    - W8 only: `showNotes` and `hideNotes` (`"Show comments ({count})"` / `"Hide comments ({count})"`).
  - `client/messages/en/shell.json` → `diffViewer.unanchoredTitle` (`"Not on a line in this diff ({count})"`).
  - Reuse `coreLabel`, `wiringLabel`, `boilerplateLabel`, `filesCount` unchanged.

## Work items

### W1 — Widen `SmartDiffRole` to five roles in both vendored copies
- **Do:**
  - Replace the enum at `brief.ts:81` in both copies with `['core', 'tests', 'wiring', 'docs', 'boilerplate']`, identical bytes.
  - Add one-line comment above it, identical in both copies: "Declaration order IS the Smart Diff display order."
  - In `server/test/contracts.test.ts`, add a case that parses a `SmartDiff` with a `tests` group and a `docs` group.
- **Files:** both `contracts/brief.ts`, `server/test/contracts.test.ts`.
- **Done means:**
  - `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
  - Both sync tests pass.
  - The new contracts case passes.
- **Verify:**
  - `pnpm exec vitest run test/vendor-shared-sync.test.ts test/contracts.test.ts` in `server/`.
  - `pnpm exec vitest run src/test/vendor-shared-sync.test.ts` in `client/`.
  - `pnpm typecheck` in both.
- **Rules that apply:** zod → `schema-use-enums`. routing.json:167 → never change one copy alone.
- **Risk:** low. The enum only widens, and nothing does exhaustive matching on it today.

### W2 — `classifyFile`, test first
- **Do:**
  1. **Write `server/test/smart-diff-classify.test.ts` first.** It is a `describe.each`/`it.each` table of `[path, expectedRole]` and must fail (module missing) before step 2. Required rows:
     - `x/__tests__/__snapshots__/x.snap` → `boilerplate`. Rule 1 wins over rule 2.
     - `.claude/skills/security/SKILL.md` → `wiring`. Rule 3 wins over rule 4.
     - `e2e/README.md` → `tests`. Documented decision: rule 2 wins over rule 4. Keep a comment in the test saying so.
     - Boilerplate: `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `Cargo.lock`, `dist/index.js`, `build/out.css`, `src/schema.generated.ts`, `vendor/jquery.min.js`, `a/__snapshots__/b.ts.snap`.
     - Tests: `src/a.test.ts`, `src/A.test.tsx`, `server/test/foo.it.test.ts`, `src/a.spec.ts`, `server/test/helpers/pg.ts`, `pkg/tests/fixture.json`, `src/__tests__/x.ts`, `e2e/flows/login.ts`.
     - Wiring: `server/src/modules/index.ts`, `lib/index.js`, `client/next.config.mjs`, `vitest.config.ts`, `tsconfig.json`, `server/tsconfig.build.json`, `.eslintrc.cjs`, `.env`, `server/.env.example`, `docker-compose.yml`, `docker-compose.e2e.yml`, `.github/workflows/ci.yml`, `.claude/agents/planner.md`.
     - Docs: `README.md`, `server/README.md`, `docs/plans/x.plan.md`, `docs/diagram.png`, `CHANGELOG.md`, `LICENSE`.
     - Core: `server/src/modules/pulls/routes.ts`, `src/dist/x.ts` (dist/ is root-anchored per spec), `src/testing/util.ts` (the segment is `testing`, not `test`), `src/latest.ts`, `src/index.tsx` (only `index.ts`/`index.js` count as barrels).
     - Windows: `client\\src\\a.test.tsx` → `tests`, and `.\\docs\\x.md` → `docs`.
  2. **Implement.**
     - `constants.ts`: `ROLE_ORDER` (derive it from `SmartDiffRole.options` so there is one source), plus `CLASSIFY_RULES`, an ordered `as const` array of `{ role, test: (p: NormalizedPath) => boolean }`, boilerplate → tests → wiring → docs. `NormalizedPath = { segments: string[]; dirs: string[]; base: string; first: string }`.
     - `helpers.ts`:
       - `normalizePath(path)`: `\` → `/`, strip leading `./` and `/`, split on `/`, drop empty segments.
       - `classifyFile(path): SmartDiffRole`: the first rule whose `test` is true, else `'core'`.
     - Predicate semantics (literal to the spec; matching is case-sensitive except `README*`/`CHANGELOG*`/`LICENSE`):
       - **boilerplate:** base ends `.lock`; or base ∈ {`pnpm-lock.yaml`,`package-lock.json`,`yarn.lock`}; or `first` ∈ {`dist`,`build`}; or dirs include `__snapshots__`; or base ends `.snap`; or base contains `.generated.`; or base ends `.min.js`.
       - **tests:** base matches `/\.test\.tsx?$/` (this covers `.it.test.ts`); or `/\.spec\.ts$/`; or dirs include any of `test`,`tests`,`__tests__`; or `first === 'e2e'`.
       - **wiring:** base ∈ {`index.ts`,`index.js`}; or base contains `.config.`; or base matches `/^tsconfig.*\.json$/`, `/^\.eslintrc/`, `/^\.env/` or `/^docker-compose.*\.yml$/`; or `first` ∈ {`.github`,`.claude`}.
       - **docs:** base ends `.md`; or `first === 'docs'`; or base starts `README`, `CHANGELOG` or `LICENSE`.
- **Files:** `server/test/smart-diff-classify.test.ts`, `server/src/modules/smart-diff/constants.ts`, `server/src/modules/smart-diff/helpers.ts`.
- **Done means:**
  - Every row above passes.
  - `helpers.ts` imports nothing but `./constants.js` and the type `SmartDiffRole`. It has no `fs`, `db` or `fastify` import.
  - `pnpm arch:check` still shows the baseline 20 warnings / 0 errors (`server/INSIGHTS.md:9`).
- **Verify:** `pnpm exec vitest run test/smart-diff-classify.test.ts`, then `pnpm typecheck`, then `pnpm arch:check`, all in `server/`.
- **Rules that apply:**
  - onion-architecture §1: ring 1 is the test-speed ring. Default there.
  - security A03: no new dependency.
- **Risk:** low. `helpers.ts` has no importer until W4, so it is an orphan until then. `no-orphans` is warn-level (`.dependency-cruiser.cjs:125`). Do not commit between W2 and W4 if the delta matters, or read the +1 as expected.

### W3 — Pure `buildSmartDiff`
- **Do:** In `helpers.ts`, add `buildSmartDiff(files: {path, additions, deletions}[], findings: {file, startLine}[]): SmartDiff`. It:
  - Classifies each file.
  - Emits exactly five groups in `ROLE_ORDER`, keeping empty ones.
  - Keeps the input order within a group.
  - Sets `finding_lines` = the unique, ascending `startLine`s of findings whose normalised `file` equals the file's normalised path.
  - Sets `pseudocode_summary: null`.
  - Sets `split_suggestion = { too_big: false, total_lines: Σ(additions+deletions), proposed_splits: [] }`.
  - Drops findings for paths that are not in `files` (they have no card to anchor to).
- **Files:** `server/src/modules/smart-diff/helpers.ts`, `server/test/smart-diff-build.test.ts`.
- **Done means:** Tests assert each of the following:
  - (a) Five groups in the order `core,tests,wiring,docs,boilerplate`, even for zero files.
  - (b) Two findings on the same line collapse to one entry, and lines are sorted.
  - (c) A finding on a file outside the PR is ignored.
  - (d) `total_lines` is the sum.
  - (e) With no findings, every `finding_lines` is `[]`. This is the "before any review" case.
  - (f) The output passes `SmartDiff.parse`.
- **Verify:** `pnpm exec vitest run test/smart-diff-build.test.ts` in `server/`.
- **Rules that apply:** onion-architecture §1, the pure rule in ring 1. zod → `parse-avoid-double-validation`: `.parse` is used in the TEST only; at runtime, the route's response schema validates.
- **Risk:** low.

### W4 — Repository, service, route, registration
- **Do:**
  - **`repository.ts`**, `class SmartDiffRepository { constructor(private db: Db) }`:
    - `getPull(workspaceId, prId)`: `pull_requests` where `workspaceId` AND `id`.
    - `getPrFiles(prId)`: `{path, additions, deletions}` from `pr_files`, `orderBy(path)`. The table has no position column, and an unordered read is "whatever the heap says" (`server/INSIGHTS.md:23`).
    - `latestReviewFindings(workspaceId, prId)`:
      1. Select the one `reviews.id` where `workspaceId` AND `prId` AND `kind = 'review'`, `orderBy(desc(createdAt))`, `limit(1)`.
      2. If none, return `[]`.
      3. Otherwise select `{file, startLine}` from `findings` where `reviewId = that id`.
    - It returns plain objects, not row types.
  - **`service.ts`**, `class SmartDiffService { constructor(private repo: SmartDiffRepository) }` → `get(workspaceId, prId): Promise<SmartDiff>`:
    - PR not found in this workspace → `throw new NotFoundError('Pull request not found')` (`platform/errors.ts`, as `reviews/service.ts:175`).
    - Otherwise `buildSmartDiff(files, findings)`.
  - **`routes.ts`**:
    - Header comment listing the endpoint.
    - `app.withTypeProvider<ZodTypeProvider>()`.
    - `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, …)`.
    - `getContext(container, req)` for the workspace.
    - Composition as in the table row above. No LLM, no GitHub call.
  - **`modules/index.ts`**: `import smartDiff from './smart-diff/routes.js';` and a `smartDiff,` entry.
  - **Tests:**
    - `smart-diff-build.test.ts`: add a service test with a hand-written fake repository object cast to `SmartDiffRepository`. Assert a 404 `NotFoundError` when `getPull` returns `undefined`.
    - `server/test/smart-diff.it.test.ts`, modelled on `reviews.it.test.ts`/`agents-versions.it.test.ts:174`:
      - (i) A `summary` review inserted AFTER a `review` review does not shadow it.
      - (ii) Two `review` rows with explicit distinct `createdAt`: only the newest one's findings appear.
      - (iii) A PR in workspace B requested from workspace A returns 404.
      - (iv) A PR with no review returns five groups with empty `finding_lines`.
      - (v) The HTTP response via `app.inject` is 200 and parses as `SmartDiffResponse`.
- **Files:** `server/src/modules/smart-diff/{repository,service,routes}.ts`, `server/src/modules/index.ts`, `server/test/smart-diff-build.test.ts`, `server/test/smart-diff.it.test.ts`.
- **Done means:**
  - The unit suite is green.
  - The `.it` suite is green with Docker up.
  - `routes.ts` imports neither `drizzle-orm` nor `db/schema`.
  - `service.ts` does not import `platform/container`.
  - `pnpm arch:check` is back to the 20-warning baseline with 0 errors (helpers.ts is no longer an orphan).
- **Verify:** In `server/`:
  - `pnpm typecheck`
  - `pnpm exec vitest run --exclude '**/*.it.test.ts'`
  - `pnpm exec vitest run test/smart-diff.it.test.ts` (Docker)
  - `pnpm arch:check`
- **Rules that apply:**
  - onion-architecture §4 (inject, not Container), ban 1 (routes not to ORM), ban 3 (rows stay inside).
  - fastify-best-practices → schemas/serialization: declare the response schema.
  - security A01: ownership check via the workspace-scoped `getPull`, and the findings are reached only through a workspace-scoped review read (`server/INSIGHTS.md:34`).
  - drizzle-orm-patterns → `.limit()`/`.where()` to fetch only needed data.
- **Research note:** A response that fails `SmartDiffResponse` becomes `ResponseSerializationError`, which `app.ts:130-133` logs and turns into a generic 500. Unknown keys are stripped, because the serialised value is the parsed one. The handler's declared return type becomes `z.input<SmartDiffResponse>`. See Research used.
- **Risk:** medium.
  - **Stale `pr_files`.** Smart-diff reads persisted `pr_files`. `GET /pulls/:id` rewrites them from GitHub on every detail load (`pulls/routes.ts:234-270`), and DiffTab only mounts after that detail has resolved (`page.tsx:104-114`), so on the normal path they are fresh.
  - **`/pulls/:id/smart-diff` called directly** before any detail load returns whatever was last persisted.

### W5 — Client data: i18n keys, `useSmartDiff`, run-done invalidation
- **Do:**
  - Add every i18n key listed in "Contract changes". Hint texts for the three roles in the reference screenshots:
    - core: "The substance of the change — review closely"
    - wiring: "Hooks the core into the app"
    - boilerplate: "Generated / mechanical — skim"
    - tests: "Proves the change works — check coverage"
    - docs: "Explains the change — skim"
  - In `lib/hooks/reviews.ts`, add `export function useSmartDiff(prId)`: `useQuery({ queryKey: ["reviews", prId, "smart-diff"], queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`), enabled: !!prId })`, plus a comment explaining why the key sits under `"reviews"`. Use `import type { SmartDiff }` only.
  - In `page.tsx:159-163`, replace `refetchReviews()` with `if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });`. Drop the now-unused `refetch: refetchReviews` destructure at `page.tsx:46`.
  - Add `client/src/lib/hooks/reviews.test.ts`. With a bare `QueryClient`, seed data at `["reviews","p1"]` and at `["reviews","p1","smart-diff"]`, call `invalidateQueries({ queryKey: ["reviews","p1"] })`, and assert `getQueryState(["reviews","p1","smart-diff"])?.isInvalidated === true`.
- **Files:** `client/messages/en/prReview.json`, `client/messages/en/shell.json`, `client/src/lib/hooks/reviews.ts`, `client/src/lib/hooks/reviews.test.ts`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`.
- **Done means:**
  - The invalidation test passes.
  - `grep -n "refetchReviews" page.tsx` is empty.
  - The hook file has no non-type import from `@devdigest/shared`.
- **Verify:** `pnpm exec vitest run src/lib/hooks/reviews.test.ts`, then `pnpm typecheck`, in `client/`.
- **Rules that apply:** frontend-ui-architecture §5: server data goes through a query hook in `lib/hooks/*`, all API access through `lib/api.ts`, never copied into `useState`. §4 (and `client/INSIGHTS.md:22`): `import type`.
- **Risk:** low. Invalidating instead of refetching also refreshes smart-diff. Both are only refetched while mounted.

### W6 — DiffViewer: generic line annotations and file marks (shared component)
- **Do:**
  - **`annotations.ts`** (pure):
    - `interface DiffAnnotation { id: string; path: string; line: number; color: string; icon: IconName; label: string; content: ReactNode }`. `line` is RIGHT side / new-file line.
    - `interface DiffAnnotationApi { items: DiffAnnotation[]; visible: boolean }`.
    - `partitionAnnotations(items, renderedKeys) → { matched: Map<string, DiffAnnotation[]>; unanchored: DiffAnnotation[] }`. It keys on `lineKey("RIGHT", a.line)` against the same `renderedKeys` set FileCard already builds from `keysForLine` (`FileCard.tsx:45-48`, `comments.ts:63,89`), and preserves input order.
  - **`DiffViewer.tsx`**: new optional props `annotations?: DiffAnnotationApi` and `marks?: { paths: ReadonlySet<string>; label: string }`, passed to each FileCard.
  - **`FileCard.tsx`**:
    - Filter the annotations by `path` and partition them.
    - When `marks?.paths.has(file.path)`, render a small filled dot right after the path span: `aria-label={marks.label}`, `title={marks.label}`, colour `var(--accent)`, no number. This keeps it distinct from the `MessageSquare` count at `FileCard.tsx:67`.
    - Pass `annotations` for the line (the `matched` entries for `RIGHT:${ln.newNo}`) to CodeLine.
    - After the lines, when `annotations.visible`, render `<UnanchoredAnnotations items={unanchored} />`, mirroring `OutdatedComments` (`FileCard.tsx:91`).
  - **`CodeLine.tsx`**: new prop `annotations: DiffAnnotation[]`, default `[]`. When it is non-empty and visible:
    - The row gets a left stripe in `annotations[0].color`, as `boxShadow: inset 3px 0 0 <color>`. Never add `borderLeft` beside a `border` shorthand.
    - The row gets a right-aligned label: `Icon[annotations[0].icon]` + `annotations[0].label`, colour `annotations[0].color`.
    - Each `a.content` renders under the row inside `cs.thread` (`comments.ts`, the same rail as comment threads), keyed by `a.id`.
    - DiffViewer never sorts. The caller orders the items (W7 puts the highest severity first).
  - **`UnanchoredAnnotations/`**: title `t("diffViewer.unanchoredTitle", { count })` from the `shell` namespace, then each `content`. Returns null when the list is empty.
  - **`index.ts`**: add `export type { DiffAnnotation, DiffAnnotationApi } from "./annotations";`.
  - **Tests:**
    - `annotations.test.ts`: matched vs unanchored, with LEFT-only lines never matching.
    - `FileCard.test.tsx` (shell messages as in `smoke.test.tsx`):
      - The dot is present with the given aria-label when marked and absent otherwise.
      - The slot content renders under the line whose `newNo` equals `line`, with the label text visible.
      - An annotation on a line not in the patch shows up under the unanchored title.
- **Files:** `client/src/components/diff-viewer/{annotations.ts,annotations.test.ts,index.ts}`, `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `FileCard/FileCard.test.tsx`, `CodeLine/CodeLine.tsx`, `UnanchoredAnnotations/{UnanchoredAnnotations.tsx,index.ts}`.
- **Done means:**
  - New tests pass.
  - `src/test/smoke.test.tsx` passes UNCHANGED.
  - `grep -rn "FindingCard\|FindingRecord\|severity" client/src/components/diff-viewer` finds nothing. The shared component stays finding-agnostic.
- **Verify:** `pnpm exec vitest run src/components/diff-viewer src/test/smoke.test.tsx`, then `pnpm typecheck`, in `client/`.
- **Rules that apply:**
  - frontend-ui-architecture §1: DiffViewer stays shared and generic. No upward import into a route.
  - frontend-ui-architecture §2: one folder per component plus an `index.ts` barrel.
  - frontend-ui-architecture §7: longhand-only styles, CSS vars.
  - react-best-practices → Composition ("Lift Content Up", `ReactNode` slots) and Render Factories (no `renderX()`).
- **Risk:** medium. FileCard is used by every diff render. Keep the no-annotations path byte-for-byte equivalent in behaviour.

### W7 — DiffTab: smart grouping, order toggle, inline FindingCards
- **Do:**
  - **`constants.ts`:**
    - `ROLE_META: Record<SmartDiffRole, { labelKey; hintKey; color }>`:
      - core → `coreLabel`/`coreHint`/`var(--accent)`
      - tests → `testsLabel`/`testsHint`/`var(--ok)`
      - wiring → `wiringLabel`/`wiringHint`/`var(--info)`
      - docs → `docsLabel`/`docsHint`/`var(--sugg)`
      - boilerplate → `boilerplateLabel`/`boilerplateHint`/`var(--text-muted)`
      - All of these vars exist in `vendor/ui/styles.css`.
    - `COLLAPSED_BY_DEFAULT = ["docs","boilerplate"] as const`.
    - `SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 }`.
    - `FINDING_LABEL_KEY = { CRITICAL: "blocker", WARNING: "warning", SUGGESTION: "suggestion" }`. Any other severity uses `SEV.INFO` tokens and the `suggestion` label.
  - **`helpers.ts`** (pure):
    - `selectLatestReview(reviews)`: the first element with `kind === "review"` (the input is newest-first per `reviews.ts:51-57` / `review.repo.ts:57`), else `null`.
    - `groupFilesByRole(smartDiff, files)`: builds a path→role map from the groups, then walks `files` (GitHub order) into buckets. It returns `{ role, files: PrFile[] }[]` in the order of `smartDiff.groups`. A `PrFile` whose path is absent from every group goes to `core`, so nothing is ever hidden.
    - `filesWithFindings(group)`: the count of the group's files with `finding_lines.length > 0`.
    - `markedPaths(smartDiff)`: a `Set` of those paths.
    - `sortFindingsForDiff(findings)`: by `SEVERITY_RANK`, then `start_line`.
  - **`DiffTab.tsx`:**
    - Call `useSmartDiff(prId)`, `usePrReviews(prId)` (cached, `client/INSIGHTS.md:11`) and `useFindingAction()`.
    - Local `order` state, `"smart"` by default.
    - Put the segmented toggle in the `SectionLabel` `right` slot: two `Button kind="ghost" size="sm"`, with `active` on the current one (as `FindingCard.tsx:97`) and i18n labels.
    - Build `annotations.items` from the latest review's sorted findings: `{ id, path: f.file, line: f.start_line, color: SEV[sev].c, icon: SEV[sev].icon, label: t(\`smartDiff.findingLabel.${key}\`), content: <FindingCard f={f} defaultExpanded onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })} pending={action.isPending && action.variables?.findingId === f.id} /> }`. This is the same call shape as `FindingsPanel.tsx:90`. `SEV` comes from `@devdigest/ui` (`vendor/ui/primitives/index.ts:2`); add no new palette.
    - Set `marks = { paths: markedPaths(smartDiff), label: t("smartDiff.fileHasFindings") }`.
    - **Smart order with data present:** one `<SmartDiffGroup>` per group, each wrapping `<DiffViewer files={bucket} commenting annotations marks />`.
    - **Original order, or while smart-diff is loading or errored:** the existing single `<DiffViewer files={files} …/>`, still with `annotations` and `marks` when available. Hide the toggle until the smart-diff data exists.
  - **`SmartDiffGroup.tsx`**, props `{ role, label, hint, color, filesCount, filesWithFindings: number | null, defaultOpen, children }`:
    - Local `open` state, initialised to `defaultOpen && filesCount > 0`. `defaultOpen` = role is not in `COLLAPSED_BY_DEFAULT`.
    - The header is a `role="button"` with `tabIndex=0` and Enter/Space handling (as `ReviewRunAccordion.tsx:72-78`). It contains:
      - a chevron
      - a coloured square in `color`
      - the label in bold, then the hint in muted text
      - a spacer
      - when `filesWithFindings > 0`: a dot + number, with `aria-label` = `t("smartDiff.filesWithFindings", { count })`
      - `t("smartDiff.filesCount", { count: filesCount })`
    - With 0 files it does not toggle.
    - Files inside keep the existing `AUTO_EXPAND_MAX_LINES` rule, because FileCard is unchanged (`FileCard.tsx:36`).
  - **Tests:**
    - `helpers.test.ts`:
      - `selectLatestReview` skips a newer `summary`.
      - It returns null for `[]`.
      - The grouping keeps GitHub order within a role and never drops a file.
      - The count is FILES, not findings: one file with 3 finding lines plus one file with 1 counts as 2.
    - `SmartDiffGroup.test.tsx`:
      - The counter renders `2` for that case and is absent at 0.
      - docs/boilerplate start collapsed, so their children are not rendered.
      - Clicking the header expands.
    - `DiffTab.test.tsx`, with `vi.mock` of `@/lib/hooks/reviews`, `prReview` + `shell` messages:
      - Five group headers appear, in order core, tests, wiring, docs, boilerplate.
      - Clicking "Original order" removes the headers and keeps every path.
      - A CRITICAL finding on a rendered line shows the "blocker" label and its FindingCard title under that line.
      - The file dot is present on the finding's file only.
      - Use `within(groupHeader)` to scope repeated "N files" text (`client/INSIGHTS.md:45,47`).
- **Files:** `…/DiffTab/{DiffTab.tsx,constants.ts,helpers.ts,helpers.test.ts,styles.ts,DiffTab.test.tsx}`, `…/DiffTab/_components/SmartDiffGroup/{SmartDiffGroup.tsx,index.ts,styles.ts,SmartDiffGroup.test.tsx}`.
- **Done means:**
  - All three new test files pass.
  - `DiffTab.tsx` ≤ 200 lines.
  - `grep -n "reviews\[0\]\|runs\[0\]" …/DiffTab` finds nothing.
  - No new string literal renders user-visible text without `t(...)`, except the pre-existing comment toggle (fixed in W8).
- **Verify:** `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/DiffTab"`, then `pnpm typecheck`, in `client/`.
- **Rules that apply:**
  - frontend-ui-architecture §1: SmartDiffGroup has one consumer, so it lives in DiffTab's `_components/`.
  - frontend-ui-architecture §4: constants beside the owner, `as const`.
  - frontend-ui-architecture §5: rules in `helpers.ts`, derived values computed during render.
  - react-best-practices → "Derive, Don't Store": no `useState` for groups or counts. Conditional Rendering: use `count > 0 &&`. Accessibility: `aria-label` on the icon-only dot.
  - react-testing-library → test behaviour, mock at the hook boundary.
- **Risk:** medium.
  - The review list and smart-diff can briefly disagree after an action until both refetch. They share the invalidation prefix (decision 6), so the window is one round-trip.
  - A finding on a LEFT/deleted line can never anchor and lands in the unanchored block. That is by design.

### W8 — P2: one show/hide toggle for comments AND findings; "review not run yet"; Accept/Dismiss end-to-end
- **Do:**
  - In DiffTab:
    - Rename the state to `showNotes`, initially `true`. Update the comment at `DiffTab.tsx:21`: comments used to start hidden to keep the diff clean, but findings in the diff are the point of Smart Diff, so notes now start visible and one toggle hides both.
    - Show the button when `commentCount + findingsCount > 0`. Its label is `t("smartDiff.showNotes"|"hideNotes", { count: commentCount + findingsCount })`, which replaces the hardcoded English at `DiffTab.tsx:55`.
    - Pass `showComments: showNotes` and `annotations.visible = showNotes`.
    - When `selectLatestReview(reviews) === null`, pass `filesWithFindings = null` to every group. The group then shows a muted `t("smartDiff.reviewNotRun")` instead of a counter, but only on the first group header, so the message isn't repeated five times.
  - Accept/Dismiss already mutate through `useFindingAction` (W7). Its `onSuccess` invalidates `["reviews", prId]` (`reviews.ts:158`), which refreshes both feeds.
  - **Tests** in `DiffTab.test.tsx`:
    - Clicking "Hide comments" removes the inline FindingCard and the unanchored block.
    - With no `kind: "review"` review, "Review not run yet" is visible and no group counter is present.
    - Clicking Accept on the inline card calls the mocked `mutate` with `{ findingId, action: "accept", prId }`.
- **Files:** `…/DiffTab/DiffTab.tsx`, `…/DiffTab/DiffTab.test.tsx`, `…/SmartDiffGroup/SmartDiffGroup.tsx`, `client/messages/en/prReview.json`.
- **Done means:** The three new cases pass, and `grep -n '"Show comments"\|"Hide comments"' DiffTab.tsx` is empty.
- **Verify:** `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/DiffTab"` in `client/`.
- **Rules that apply:** react-best-practices → Conditional Rendering (loading/empty/success states). frontend-ui-architecture §7 i18n.
- **Risk:** low. Visible default behaviour changes on purpose: GitHub comments now start shown.

### W9 — P3: sticky group header; finding collapsible to one line
- **Do:**
  - `SmartDiffGroup` header style: `position: "sticky", top: 0, zIndex: 2, background: "var(--bg-primary)"`.
    - The scroll container is `<main>` (`client/INSIGHTS.md:20`).
    - Do not put `overflow: hidden` on the group wrapper, because that disables sticky. `s.fileCard` has `overflow: hidden` (`diff-viewer/styles.ts:11`), but it sits BELOW the header, so it is unaffected.
  - The one-line collapse is FindingCard's existing header toggle (`FindingCard.tsx:56`). `defaultExpanded` (W7) opens it, and a click folds it to its single header row.
  - Add a test: clicking the inline card's title row hides its rationale and keeps the title.
- **Files:** `…/SmartDiffGroup/styles.ts`, `…/DiffTab/DiffTab.test.tsx`.
- **Done means:** The collapse test passes. The sticky rule is present in `styles.ts`. Check sticky visually: jsdom has no layout, so no test can assert it.
- **Verify:** `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/DiffTab"` in `client/`, then a manual scroll on `/repos/<id>/pulls/482?tab=diff`.
- **Rules that apply:** frontend-ui-architecture §7 (styles in `styles.ts`).
- **Risk:** low.

### W10 — Seed PR #482 so Smart Diff is visible on a clean checkout
- **Do:**
  - Create `server/src/db/seed-pulls.ts` exporting `SEED_PR_482_FILES: { path; additions; deletions; patch: string | null }[]`, nine entries.
    - Keep the four existing paths.
    - `src/config.ts` gets a patch whose hunk renders new line 12 as an added line, e.g. `@@ -9,3 +9,7 @@`.
    - `src/api/users.ts` gets a patch that renders new line 45.
    - Add five: `test/ratelimit.test.ts` (tests), `src/middleware/index.ts` (wiring), `docs/rate-limiting.md` (docs), `README.md` (docs), `pnpm-lock.yaml` (boilerplate).
  - In `seed.ts:132`, import the constant and insert `SEED_PR_482_FILES.map((f) => ({ prId: pr!.id, ...f }))`.
  - Add a case to `server/test/smart-diff-classify.test.ts`: classifying `SEED_PR_482_FILES` paths yields all five roles. The test file may import both `src/db/` and `src/modules/`, while `src/db` may not import modules (`.dependency-cruiser.cjs:60`).
- **Files:** `server/src/db/seed-pulls.ts`, `server/src/db/seed.ts`, `server/test/smart-diff-classify.test.ts`.
- **Done means:**
  - The new test passes.
  - On a CLEAN database, `pnpm db:migrate && pnpm db:seed`, then `GET /pulls/<482 id>/smart-diff`, returns five groups with non-empty `core`, `tests`, `wiring`, `docs` and `boilerplate`.
  - `src/config.ts` has `finding_lines: [12]`, and `src/api/users.ts` has `[45]`.
- **Verify:** In `server/`:
  - `pnpm exec vitest run test/smart-diff-classify.test.ts`
  - `pnpm typecheck`
  - `pnpm arch:check`
  - The seed check, which needs Docker and a clean DB. NEVER use `docker compose down -v` (root `CLAUDE.md` Gotchas). Use `./scripts/e2e.sh`'s isolated stack, or skip it and report it as unverified.
- **Rules that apply:** onion-architecture (db ring must not reach into modules). `server/INSIGHTS.md:46`: not delivered until the seed produces it.
- **Risk:** low. It only affects fresh databases. `seed.ts:111` skips the whole block when PR #482 already exists, so existing dev DBs keep 4 files (see Rollback).

### W11 — Final checks
- **Do:** Run the full verification table below and report each row. Do not run `pnpm build` while `pnpm dev` is serving `client/` (`client/INSIGHTS.md:40`).
- **Done means:** Every row meets its "Passing means".
- **Verify:** see table.
- **Risk:** —

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `pnpm typecheck` | `server/` | pnpm | clean |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server/` | pnpm | all green. The last measured baseline is 291/291 (`server/INSIGHTS.md:65`), so any red is yours. |
| `pnpm exec vitest run test/vendor-shared-sync.test.ts test/contracts.test.ts` | `server/` | pnpm | green (lock-step + widened enum) |
| `pnpm exec vitest run test/smart-diff.it.test.ts` | `server/` | pnpm | green. Needs Docker Postgres. If unavailable, report it as not run; do not call it passed. |
| `pnpm arch:check` | `server/` | pnpm | 0 errors, and warnings ≤ the 20 baseline (`server/INSIGHTS.md:9`). The delta is what matters, since exit 0 on warnings means nothing. |
| `pnpm typecheck` | `client/` | pnpm | clean |
| `pnpm test` | `client/` | pnpm | all green, including `src/test/smoke.test.tsx` unchanged and `src/test/vendor-shared-sync.test.ts` |
| `pnpm build` | `client/` | pnpm | build succeeds. Dev server stopped first (`client/INSIGHTS.md:22,40`). |
| manual: open `/repos/<id>/pulls/482?tab=diff` on a freshly seeded DB | stack | — | Five headers in order. Docs/boilerplate collapsed. Core shows a counter of 2. Dots on `src/config.ts` and `src/api/users.ts`. A "blocker" stripe on line 12. The toggle restores GitHub order. After Run review, the counters change without a reload. |

## Assumptions

- The "latest review" is the newest `reviews` row with `kind = 'review'` for the PR. With "Review all" that means ONE agent's review, not the whole batch. This is the same caveat the PR-list score/findings columns already carry (`server/INSIGHTS.md:33`).
- Findings are counted as stored: accepted, dismissed and every `kind` (including `lethal_trifecta`). This matches `pulls/findings.ts:13-14`.
- `finding_lines` uses `start_line` only. Multi-line findings are not expanded to a range. The inline card anchors on `RIGHT:${start_line}`.
- `dist/` and `build/` match only as the FIRST path segment, and `index.ts`/`index.js` count as barrels at any depth. This is literal to the spec globs. `src/dist/x.ts` is core, and a test row pins it.
- `*.spec.ts` is literal: `.spec.tsx` is not in the spec, so it classifies as core. Widen it only with a test row.
- Order within a smart group follows `pr.files` (GitHub order), not the server's per-group order. The server sorts by path only to be deterministic.
- The toggle state does not survive a reload (local state, decision 10).
- TanStack Query's `invalidateQueries` prefix-matches by default. W5's test pins this; if it fails, add explicit `["reviews", prId, "smart-diff"]` invalidations at the four sites in `lib/hooks/reviews.ts` plus `page.tsx`.

## Open questions

None blocking. The researcher's two "not established" items are resolved:
- The custom error handler was checked directly: `server/src/app.ts:130-133` catches `isResponseSerializationError` → logs → generic 500.
- `.strict()`/`.passthrough()` does not apply, because `SmartDiff` uses a plain `z.object`.

## Research used

- **Question:** What does `fastify-type-provider-zod`'s `serializerCompiler` do with `schema.response[200]`?
- **Conclusions relied on:**
  - Installed v4.0.2 `safeParse`s the handler result (`server/node_modules/fastify-type-provider-zod/dist/src/core.js:85-92`).
  - A mismatch throws `ResponseSerializationError`, status 500 (`dist/src/errors.js:9`).
  - It serialises the PARSED data, so unknown keys are stripped (`core.js:91`).
  - It types the handler return as `z.input<schema>` (`dist/src/core.d.ts`).
- **Repo cross-check:** `server/src/app.ts:130-133`.
- **As of:** 2026-09-23.

## Rollback / blast radius

- **Reverting the files** removes:
  - the endpoint
  - the module registration line
  - the client grouping and annotations (DiffViewer falls back to its current behaviour, because every prop is optional)
  - the enum widening
- **The enum is wire-visible.** Revert BOTH vendored copies together, or the sync tests fail.
- **No migration**, so there is nothing irreversible in the schema.
- **Seed rows are not reverted by reverting code.** A database seeded after W10 keeps the nine `pr_files` rows (and patches) for PR #482. That is harmless: they are demo data for a repo that does not exist on GitHub (`server/INSIGHTS.md:17`). Conversely, databases seeded BEFORE W10 keep 4 files and never get the new ones, because the seed never updates (`seed.ts:111`). Seeing all five groups there needs a clean database, never `docker compose down -v` on the dev volume.
- **Behaviour change beyond the feature:** GitHub inline comments on the Files tab now start visible (W8).
