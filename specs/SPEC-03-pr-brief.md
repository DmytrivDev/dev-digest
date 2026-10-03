# Spec: PR Brief — why, risk areas and review focus on the PR Overview
Spec ID: SPEC-03
Status: approved
Supersedes: none

## Problem and user

A reviewer often opens someone else's pull request "cold". They do not know why the change exists,
what in it is risky, or which file and line to read first. DevDigest already answers parts of this
on separate surfaces, and nothing ties them together:

- **Intent** (L03) explains the purpose of the PR. It ships as a stand-alone card on the Overview
  tab (`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:22`).
- **Blast radius** (L04) shows downstream callers and endpoints. It is another stand-alone card
  on Overview (`OverviewTab.tsx:24-29`).
- **Smart Diff** (L03) groups the changed files by role, but only on Files changed.
- **The verdict and PR score** of a review appear only inside a run accordion on the Agent runs
  tab (`_components/ReviewRunAccordion/ReviewRunAccordion.tsx:139-146`).

Nothing names the risks of the change. Nothing tells the reviewer where to start reading. The
schema and contracts were prepared for this and are unused: the `pr_brief` table
(`server/src/db/schema/reviews.ts:82-87`), the `Risk`/`Risks`/`PrBrief` contracts
(`server/src/vendor/shared/contracts/brief.ts:121-203`), and the `risk_brief` feature-model id
(`server/src/vendor/shared/contracts/platform.ts:17,59-64`).

The users:

- **The reviewer opening a PR cold.** They want one card that says what the PR does and why,
  what is risky, and which lines to read first. They want to jump from the card straight to
  those lines.
- **The person paying for model calls.** They need to see that one brief costs exactly one
  model call, and what that call cost.
- **The workspace owner.** PR text, issue text and repository documents are written by other
  people. None of it may steer the model, invent file paths, or leak across workspaces.

## Goals / Non-goals

**Goals**

- A **PR Brief** section at the top of the Overview tab, copied from the design. It holds:
  - a banner with the brief summary, the latest review's verdict and score, and the cost of the
    brief;
  - the existing Intent card, which gains a **Risk areas** list;
  - the existing Blast radius card, beside the Intent card;
  - a full-width **Review focus — read these first** list.
- **Exactly one** structured model call per generation, on the model chosen for the `risk_brief`
  feature. The model is given only facts that were already computed, within a fixed budget of
  8,000 input tokens. It is never given diff hunk bodies.
- **No invented paths.** Every file named in Risk areas or Review focus is in the PR or in the
  blast map. Every line is inside a changed range (or is a known caller line).
- **A cached brief bound to the head commit.** A reload shows the stored brief without a model
  call. A new commit marks it stale. A refresh regenerates it.
- **One-click navigation** from a focus item or risk reference to the exact line on Files
  changed.
- **Visible cost and missing data.** Each generation's model call count, tokens and cost appear
  in a log line and in the banner. The banner states which inputs were missing or truncated.

**Non-goals** (each is a decision; do not "restore" it)

- **Deriving intent from the Generate action.** That would be a second model call. Without a
  stored intent the brief is built without it and says so (DR-6).
- **Regenerating automatically** after a new commit. The brief is marked stale; only the user
  regenerates it (DR-46).
- **Reading diff hunk bodies.** Only paths, counts, roles and the line numbers from hunk headers
  reach the model (DR-1).
- **"Prior PRs touching these files" inside the brief.** `PrBrief.history` is not filled. Prior
  PRs stay in the Blast radius card (DR-38).
- **An MCP tool for the brief** (DR-38).
- **The review's own summary on Overview.** The banner paragraph is the brief summary. The review
  summary stays on the Agent runs tab (DR-39).
- **Inline markdown and clickable URLs in model-written text.** The mock renders risk
  explanations through `mdLite` (`docs/design/extracted/screen_pr_detail.jsx:34`). The brief
  renders all model text as plain text (DR-29).
- **A structured `{file, start_line, end_line}` risk reference.** `file_refs` stays a string list
  with a fixed grammar (DR-48).
- **A closed enum for `Risk.kind`.** It stays a free string; unknown kinds get a fallback icon
  (DR-49).
- **Changing the `risk_brief` default model** (openai / gpt-4.1) in any of the three registry
  copies (DR-50).
- **Generating a brief inside e2e flows.** The e2e stack has no model stub. e2e asserts a seeded
  brief (DR-55).
- **Showing the reason of a failed generation the page did not start** — a known limitation.
  After a reload during a generation that then fails, GET shows the earlier state (the previous
  brief or the empty state) with no failure reason, because the last failure is not persisted
  (DR-59).

## User stories

- **US-1** As a reviewer, I want to generate a brief from the Overview tab, so that I learn what
  the PR does and why before I read the diff.
- **US-2** As a reviewer, I want each risk to have a title and the file it concerns, so that I
  know what can break and where.
- **US-3** As a reviewer, I want a list of `file:line — why it matters` that opens Files changed
  at that line, so that I start reading at the right place.
- **US-4** As a reviewer, I want the brief to come back on reload without being regenerated, and
  to regenerate it on demand, so that I neither wait nor pay twice.
- **US-5** As a reviewer, I want to see when the brief was made for an older commit, so that I
  do not trust a brief that no longer matches the diff.
- **US-6** As a reviewer, I want the latest review's verdict and score next to the brief, so that
  the whole picture is on one screen.
- **US-7** As the person paying for model calls, I want to see that one generation made one model
  call and what it cost, so that I can account for it.
- **US-8** As a reviewer, I want the brief to say which inputs were missing or truncated, so that
  I know how much to trust it.
- **US-9** As a workspace owner, I want PR, issue and document text treated as data, and briefs
  confined to their workspace, so that nobody can steer the model or read another workspace's
  briefs.
- **US-10** As a reviewer, I want Intent and Blast radius placed beside the new parts, so that I
  do not switch between screens.

## Acceptance criteria (EARS)

Design references used below:
- `BriefCard` = `docs/design/extracted/screen_pr_detail.jsx:65-80`.
- `RiskPillRow` = `screen_pr_detail.jsx:23-37`.
- `RISK_ICON` and `RISK_SEV` = `screen_pr_detail.jsx:20-21`.
- `VerdictBanner` (mock) = `docs/design/extracted/findings.jsx:78-100`.
- Screenshots (in `docs/design/screenshots/pr-brief/`): `1.webp` (filled Overview), `2.png`
  (Files changed, reviewer-ordered), `3.webp` and `4.webp` (the parts this feature adds,
  outlined), `5.webp` (focused file on Files changed).
- Where the extracted mock and the screenshots differ, the screenshots win (`client/INSIGHTS.md`,
  2026-10-02).

### Overview composition

**AC-1 [client]** WHEN the Overview tab is shown, the system shall render these parts top to
bottom:
1. a "PR Brief" section label with the `FileText` icon (`screen_pr_detail.jsx:138`);
2. the brief banner;
3. the Intent card, then the Blast radius card directly below it, each full width (amended
   2026-10-03 from the mock's two-column grid, user-authorized: side by side, the Blast
   radius card's long mono paths and graph were cramped into half the width);
4. the full-width Review focus card (`1.webp`);
5. the existing Description section (`OverviewTab.tsx:31-36`).

Verify: unit — the rendered Overview's sections appear in that DOM order.

**AC-2 [client]** The Intent and Blast radius cards shall render one under the other at every
viewport width, Intent first (amended 2026-10-03 with AC-1; it previously applied only below
900 px).
Verify: unit — both cards are separate direct children of the brief section, Intent first;
manual — at desktop width the Blast radius card sits below the Intent card, full width.

**AC-3 [client]** The Intent card shall show a "Risk areas" block with the `AlertTriangle` icon.
The block sits below the in-scope / out-of-scope lists, separated by a 1 px divider
(`BriefCard` :72-74, `4.webp`).
Verify: unit — the Intent card contains a divider followed by the "Risk areas" label and the
risk list.

**AC-4 [client]** The Review focus card shall have the header "Review focus — read these first",
the `ListChecks` icon, and a count badge equal to the number of focus items shown (`1.webp`).
Verify: unit — a brief with 4 focus items renders the header and a badge reading "4".

**AC-5 [client]** The Intent and Blast radius cards shall keep rendering from their existing
endpoints (`GET /pulls/:id/intent`, `GET /pulls/:id/blast`), whether or not a brief exists.
Verify: unit — with no brief, both cards render their existing content; with a brief, they
render the same content.

### Brief states

**AC-6 [client]** WHILE no brief exists for the PR and no generation is in flight, the banner
shall show an empty state with a primary "Generate brief" button.
Verify: unit — GET returns `{brief: null, generating: false}` → the button is shown.

**AC-7 [client]** WHILE no brief exists for the PR, the Risk areas block and the Review focus
card shall each show a one-line "not generated yet" placeholder.
Verify: unit — `brief: null` → both placeholders are shown.

**AC-8 [client]** WHEN the user activates "Generate brief", the client shall send exactly one
`POST /pulls/:id/brief`.
Verify: unit — one click results in one mutation call. e2e cannot observe this (no model stub,
DR-55).

**AC-9 [client]** WHILE a generation is in flight, the system shall show skeleton rows in place
of the summary, the Risk areas list and the Review focus list. A generation is in flight while
the POST is pending, or while GET reports `generating: true`.
Verify: unit — a pending mutation, and separately `generating: true`, each render the three
skeletons.

**AC-10 [client]** WHILE a generation is in flight, the "Generate brief" button, the refresh icon
and the stale notice's Regenerate action shall be disabled.
Verify: unit — during a pending mutation a second click sends no request.

**AC-11 [client]** WHILE GET reports `generating: true`, the client shall re-request
`GET /pulls/:id/brief` every 3 s until `generating` is `false`.
Verify: unit (fake timers) — `generating: true` then `false` → exactly one re-request after 3 s,
and none after `false`.

**AC-12 [client]** IF a generation fails and no brief exists, THEN the banner shall show an
inline error with the failure message and a Retry button that sends one POST.
Verify: unit — a 502 `llm_timeout` response with `brief: null` → the error text and Retry are
shown.

**AC-13 [client]** IF a generation fails and a brief exists, THEN the client shall keep showing
the existing brief with an inline error that names the failure.
Verify: unit — a 422 `llm_not_configured` response leaves the earlier summary on screen next to
the error text.

**AC-14 [client]** IF a brief request fails with any status, THEN the client shall show the
failure only inline, with no global error toast.
Verify: unit — after a failed generate, no toast is raised (the mutation opts out of the global
`MutationCache` toast, `client/src/lib/providers.tsx:36-46`).

### Banner

**AC-15 [client]** WHEN a brief exists, the banner shall show the brief's `summary` as its
paragraph, in the position of `VERDICT.summary` in the mock `VerdictBanner` (`findings.jsx:93`,
`1.webp`).
Verify: unit — the summary text renders inside the banner.

**AC-16 [client]** WHERE the PR has at least one review of kind `review`, the banner shall show
the verdict elements of the newest such review:
- the verdict label with its icon;
- the "N findings · M blockers" badge;
- the PR score ring (`findings.jsx:86-96`, `1.webp`).

The newest review is the one `selectLatestReview` already picks
(`_components/DiffTab/helpers.ts:11-13`). N is that review's findings. M is its CRITICAL
findings that are not dismissed, as the run accordion counts them (`ReviewRunAccordion.tsx:55-56`).
Verify: unit — two reviews → the verdict and score are the newer review's.

**AC-17 [client]** IF the PR has no review of kind `review`, THEN the banner shall show the brief
summary with no verdict icon, findings badge or score ring.
Verify: unit — no reviews → none of the three elements render.

**AC-18 [client]** WHEN a brief exists, the banner shall show the generation's cost and tokens
below the score column, as `$<cost> <in>K→<out>K` (`findings.jsx:97-99`, `1.webp`). The cost is
formatted by the existing `formatCost` (`client/src/lib/cost.ts:13`), so an unknown cost reads
"—".
Verify: unit — `cost_usd 0.014, tokens 8200/1300` → "$0.014 8.2K→1.3K"; `cost_usd null` → "—".

**AC-19 [client]** The banner's cost element shall carry the brief's `model` (`provider/model`)
as its tooltip text.
Verify: unit — the element's `title` equals the brief's `model`.

**AC-20 [client]** WHEN the user activates the banner's refresh icon (`RefreshCw`, `1.webp`) or
the stale notice's Regenerate action, the client shall send one `POST /pulls/:id/brief`.
Verify: unit — each control triggers one mutation call.

**AC-21 [client]** WHERE at least one entry of the brief's `inputs` has status `missing` or
`truncated`, the banner shall show one muted line naming each such input with its reason. For
example: "Built without: linked issue (GitHub unavailable) · Truncated: specs (over budget)".
Verify: unit — `inputs` with a missing `linked_issue` and a truncated `specs` → both appear in
the line; all `used` → no line.

**AC-22 [client]** WHERE the brief's `dropped.risks + dropped.review_focus` is above 0, the
banner shall show the muted note "N items referencing unknown files were removed", where N is
that sum.
Verify: unit — `dropped {risks: 1, review_focus: 1}` → "2 items referencing unknown files were
removed".

**AC-23 [client]** WHILE the brief is stale, the banner shall show "Generated for `<first 7
characters of head_sha>` — the PR has new commits" with a Regenerate action. The brief is stale
when the response's `stale` is `true`, or when its `head_sha` differs from the page's live
`pr.head_sha`.
Verify: unit — `stale: true` shows the notice; `stale: false` with a different live head also
shows it; equal SHAs with `stale: false` → no notice.

### Risk areas and Review focus

**AC-24 [client]** The system shall render each risk as a bordered pill, as in `1.webp` and
`4.webp`. The pill holds:
- the kind icon from `RISK_ICON` (`security` Shield, `db_migration` Database, `breaking_api`
  AlertOctagon, `perf` Zap, `deps` Boxes), coloured by `RISK_SEV` (high `--crit`, medium
  `--warn`, low `--info`);
- the title;
- the first `file_refs` entry in mono accent text;
- a chevron.

Verify: unit — a `deps`/`medium` risk renders the Boxes icon in `--warn`, its title, its first
ref and a chevron.

**AC-25 [client]** IF a risk's `kind` is not one of the five `RISK_ICON` keys, THEN its pill
shall use the `AlertTriangle` icon.
Verify: unit — `kind: "license"` renders AlertTriangle.

**AC-26 [client]** WHEN the user activates a risk's chevron, the system shall toggle a panel under
that pill. The panel shows the risk's `explanation` and every entry of its `file_refs`
(`RiskPillRow` :33-36).
Verify: unit — activating the chevron shows the explanation and all refs; activating it again
hides them.

**AC-27 [client]** WHERE a brief has zero risks, the Risk areas block shall show "No notable
risks flagged." (`brief.noRisks`).
Verify: unit — `risks: []` renders that text.

**AC-28 [client]** The system shall render each focus item as a bulleted row: `file:line` as a
mono accent link, then " — " and the item's `reason` (`1.webp`).
Verify: unit — `{file: "src/config.ts", line: 12, reason: "live key"}` renders
"src/config.ts:12" followed by "— live key".

**AC-29 [client]** WHERE a brief has zero focus items, the Review focus card shall show "No focus
lines — nothing the brief could ground in this diff".
Verify: unit — `review_focus: []` renders that text and a "0" badge.

**AC-30 [client]** The system shall render `summary`, risk `title`, risk `explanation` and focus
`reason` as plain text. No HTML is interpreted and no URL becomes a link.
Verify: unit — a summary of `<img src=x onerror=alert(1)> https://evil.example` renders those
characters literally, with no `img` and no `a` element.

### Navigation to Files changed

**AC-31 [client]** WHEN the user activates a focus item whose file is among the PR's files, the
client shall navigate to `?tab=diff&file=<path>&line=<line>` on the same PR page.
Verify: unit — the router receives that URL; e2e — on seeded PR #482, clicking the seeded focus
item ends on a URL containing `tab=diff` and shows that file's name.

**AC-32 [client]** WHEN the user activates a risk reference whose file is among the PR's files,
the client shall navigate to `?tab=diff&file=<path>`. A `path:N` or `path:N-M` reference adds
`&line=<N>`.
Verify: unit — `src/a.ts:12-18` → `line=12`; `package.json` → no `line` parameter.

**AC-33 [client]** IF the user activates a focus item or risk reference whose file is not among
the PR's files, THEN the system shall show the inline message "File not in this PR's diff" next
to that item and stay on Overview.
Verify: unit — a blast-only path shows the message and the router is not called.

**AC-34 [client]** The "File not in this PR's diff" message shall contain a link that opens the
file on GitHub in a new tab. The link points at the brief's `blast.indexed_sha`, or at the PR
head SHA when that is absent, which is the rule the blast tree already uses
(`_components/BlastRadiusCard/helpers.ts:148-159`).
Verify: unit — the link's `href` is `https://github.com/<owner>/<repo>/blob/<indexed_sha>/<path>#L<line>`
and its `target` is `_blank`.

**AC-35 [client]** WHEN Files changed opens with a `file` parameter naming a PR file, the system
shall expand that file's role group and its file card, overriding the collapsed defaults. The
defaults are docs and boilerplate groups collapsed (`_components/DiffTab/constants.ts:24`) and
cards over 200 changed lines collapsed (`client/src/components/diff-viewer/FileCard/FileCard.tsx:62-64`).
Verify: unit — `file=package-lock.json` (boilerplate, over 200 lines) renders that card's lines.

**AC-36 [client]** WHEN Files changed opens with `file` and `line`, and that line is a rendered
new-side line of that file, the system shall scroll that line's row into view once the diff has
rendered.
Verify: unit — `scrollIntoView` is called on the row whose new-side number is `line`; manual —
in a browser the row is inside the viewport within 1 s of the tab opening (jsdom has no layout).

**AC-37 [client]** WHILE a `file` parameter targets a file card, that card shall have an accent
border (`5.webp`).
Verify: unit — the targeted card's border uses the accent colour; the other cards do not.

**AC-38 [client]** WHILE a `line` parameter targets a rendered new-side line, that line's row
shall carry a highlight background.
Verify: unit — only the targeted row has the highlight.

**AC-39 [client]** IF the `line` parameter is absent, or is not a rendered new-side line of the
targeted file, THEN the system shall scroll the targeted file card's header into view.
Verify: unit — `line=9999` → `scrollIntoView` is called on the card header.

**AC-40 [client]** IF the `file` parameter names no file of the PR, THEN Files changed shall
render as it does without parameters, with no error.
Verify: unit — `file=nope.ts` renders the normal diff and no error state.

**AC-41 [client]** WHILE either "Smart order" or "Original order" is selected, the system shall
apply the behaviour of AC-35 to AC-39.
Verify: unit — the targeted line is scrolled to and highlighted in both orders.

**AC-42 [client]** WHEN the PR page is loaded with `?tab=diff&file=<path>&line=<n>` in its URL,
the system shall target the same file and line as an in-app navigation does.
Verify: unit — mounting with those search params produces the AC-35 to AC-38 behaviour.

### Reading the brief

**AC-43 [server]** WHEN `GET /pulls/:id/brief` is called, the system shall return the envelope
`{brief, generating, stale}` (contract C-1) without a model call.
Verify: integration — with a fake LLM injected, GET returns the stored brief and the fake records
0 calls.

**AC-44 [server]** IF no brief is stored for the PR, THEN GET shall return `brief: null` and
`stale: false`.
Verify: integration — a PR with no stored brief returns `{brief: null, generating: false,
stale: false}`.

**AC-45 [server]** WHEN GET returns a stored brief, the system shall compute `stale` at read time
as `true` exactly when the brief's `head_sha` differs from the PR's current `head_sha` in the
database. An unknown current SHA counts as not stale.
Verify: integration — after the PR row's `head_sha` changes, GET returns `stale: true`; before,
`false`.

**AC-46 [server]** WHILE a generation for the PR is in flight, GET shall return
`generating: true`.
Verify: integration — with a fake LLM held mid-call, GET returns `generating: true`; after
release, `false`.

**AC-47 [client]** WHEN the PR page loads and a brief is stored, the client shall render that
brief from the GET response without sending a POST.
Verify: unit — no mutation call on mount when GET returns a brief; e2e — on the seeded PR #482
the seeded summary text is visible on Overview after a reload, on a stack with no model key.

### Generation input

**AC-48 [server]** IF the PR has 0 stored files, THEN `POST /pulls/:id/brief` shall respond 422
`files_unavailable` without a model call.
Verify: integration — a PR row with no `pr_files` → 422 and 0 fake-LLM calls.

**AC-49 [server]** WHEN a generation runs, the system shall include in the prompt every input
whose `inputs` status is `used` or `truncated`:
- PR title;
- PR description;
- linked issue;
- intent;
- blast summary with changed symbols and caller `file:line` list;
- per-file diff stats;
- spec documents.

Verify: integration — with all inputs available, the prompt captured by the fake LLM contains
each one.

**AC-50 [server]** The per-file diff stats shall consist of, for each file:
- path;
- Smart Diff role (core | tests | wiring | docs | boilerplate);
- additions;
- deletions;
- the list of new-side changed line ranges taken from the patch's hunk headers.

Verify: unit — a patch with hunks `@@ -10,3 +12,7 @@` and `@@ -40,2 +45,4 @@` yields the ranges
`12-18` and `45-48`.

**AC-51 [server]** The prompt shall contain no diff hunk body: no line of any file's patch other
than the numbers taken from its hunk headers.
Verify: integration — a seeded patch line carrying a unique marker string never appears in the
prompt captured by the fake LLM.

**AC-52 [server]** IF no intent is stored for the PR, THEN the system shall generate the brief
without intent, record `intent` as `missing` with reason `not_derived`, and make no intent
derivation call.
Verify: integration — no `pr_intent` row → one fake-LLM call in total, `inputs` shows intent
missing, and no `pr_intent` row is created.

**AC-53 [server]** The system shall include a linked issue only when the PR description
references it with a GitHub closing keyword and a same-repository issue number. A bare `#N`
mention or a cross-repository reference yields `linked_issue` `missing` with reason
`no_linked_issue`.
Verify: unit — "Fixes #12" → issue 12; "see #12" and "Fixes acme/other#12" → `no_linked_issue`.

**AC-54 [server]** IF fetching the linked issue from GitHub fails, or no GitHub token is
configured, THEN the system shall record `linked_issue` as `missing` with reason
`github_unavailable` and continue the generation.
Verify: integration — a mock GitHub client that throws → 200, one fake-LLM call, `inputs` shows
the reason.

**AC-55 [server]** The spec documents input shall be the de-duplicated union of the documents
attached, for this PR's repository, to enabled agents directly or through their enabled skills
(SPEC-01). They are ordered by agent name and then attachment position, and read from the clone
working tree.
Verify: integration — two enabled agents sharing one document plus one disabled agent → each
enabled document appears once, in that order, and the disabled agent's document is absent.

**AC-56 [server]** IF no document is attached for the repository, or the clone cannot be read,
THEN the system shall record `specs` as `missing` with reason `none_attached` or
`clone_unavailable` respectively.
Verify: integration — no attachments → `none_attached`; attachments but no clone path →
`clone_unavailable`.

**AC-57 [server]** WHERE the blast radius is degraded with any reason other than
`files_unavailable`, the system shall include the blast summary and record `blast` as `used`
with the degraded reason as its `reason`.
Verify: integration — a stub repo-intel returning `degraded: true, reason: 'no_data'` → `blast`
`used`, reason `no_data`, and the summary is in the prompt.

**AC-58 [server]** IF the blast radius reason is `files_unavailable` or it has zero changed
symbols, THEN the system shall record `blast` as `missing` and validate output paths against the
PR's files only.
Verify: integration — zero changed symbols plus a model focus item on a non-PR path → `blast`
missing and the item dropped.

**AC-59 [server]** IF the number of stored files is lower than the PR's `files_count`, THEN the
system shall record `diff_stats` as `truncated` with reason `file_list_truncated`.
Verify: integration — `files_count: 140` with 100 stored files → that status and reason.

**AC-60 [server]** Every stored brief shall carry an `inputs` list with exactly one entry for
each of `intent`, `blast`, `diff_stats`, `description`, `linked_issue` and `specs`, each with
status `used`, `truncated` or `missing`, and a `reason` whenever the status is not `used`.
Verify: integration — a generated brief's `inputs` has six entries, one per source.

**AC-61 [server]** The assembled prompt (system plus user content) shall measure at most 8,000
tokens with the `cl100k_base` tokenizer (`server/src/adapters/tokenizer/index.ts:14-40`).
Verify: integration — a PR with roughly 30,000 tokens of inputs → the prompt captured by the
fake LLM counts at most 8,000 tokens.

**AC-62 [server]** WHILE the assembled prompt exceeds 8,000 tokens, the system shall cut inputs
in this order until it fits:
1. spec documents, dropped whole, last first;
2. linked issue body, truncated to 1,500 characters, then dropped;
3. PR description, truncated to 2,000 characters;
4. blast caller list, lowest-ranked caller first;
5. per-file rows, lowest churn (additions + deletions) first, down to zero rows if needed (no
   30-file floor);
6. the text of the blast summary, then of the intent, then of the PR title, truncated until the
   prompt fits.

The diff-stats header and the system prompt are never cut. Generation always proceeds: no input
size ever refuses a generation (DR-56).
Verify: unit — inputs over budget in each tier are cut in exactly that order, and a lower tier is
untouched while a higher tier still suffices; a fixture whose intent alone exceeds 8,000 tokens
yields zero file rows, a truncated intent and a prompt of at most 8,000 tokens.

**AC-63 [server]** WHEN an input is cut by the budget, the system shall record it in `inputs` as
`truncated` (partly kept) or `missing` (fully dropped) with reason `over_budget`. The
`diff_stats` entry also carries `omitted`, the number of file rows cut, and a truncated PR title
is recorded under `description`.
Verify: unit — specs dropped whole → `missing/over_budget`; description truncated →
`truncated/over_budget`; 12 file rows cut → `diff_stats` `truncated/over_budget` with
`omitted: 12`.

### The model call

**AC-64 [server]** WHEN `POST /pulls/:id/brief` passes its checks, the system shall make exactly
one structured model call for that generation.
Verify: integration — the fake LLM records exactly 1 `completeStructured` call per POST, and the
stored `usage.llm_calls` is 1.

**AC-65 [server]** The system shall send the model call to the provider and model resolved for
the `risk_brief` feature of the caller's workspace (`server/src/modules/settings/feature-models.ts`).
Verify: integration — a workspace override `{provider: openrouter, model: x/y}` → the openrouter
fake receives model `x/y`, and the default provider's fake receives nothing.

**AC-66 [server]** The model request shall carry `maxRetries: 0`, `disableReasoning: true` and
`maxTokens: 8000` (contract C-4). (Amended 2026-10-03 from 4000, user-authorized before
implementation: matches the onboarding module, where OpenRouter reasoning upstreams cut JSON
mid-object at 4000 — `server/INSIGHTS.md` 2026-10-02.)
Verify: integration — the captured request has exactly those three values.

**AC-67 [server]** The system shall place every untrusted input (see *Untrusted inputs*) inside
an untrusted-data block with a constant label, following the repository's `wrapUntrusted`
convention (`reviewer-core/src/prompt.ts:38-44`).
Verify: integration — a PR body containing `</untrusted>` arrives escaped inside its block, and
each listed input sits inside a block with its label.

**AC-68 [server]** The system prompt shall state that content inside untrusted-data blocks is
data to analyse, never instructions to follow.
Verify: unit — the system prompt contains that rule.

**AC-69 [server]** The system shall strip control characters (U+0000–U+001F except tab and
newline, and U+007F) from untrusted inputs before they enter the prompt.
Verify: unit — a body containing U+0007 and U+001B arrives without them.

### Output validation

**AC-70 [server]** IF the model output does not parse against the brief output schema
(contract C-4), THEN the system shall respond 502 `llm_invalid_output` and store nothing.
Verify: integration — a fake returning a malformed object → 502, and the stored brief is
unchanged.

**AC-71 [server]** Before comparing paths, the system shall normalise every model-supplied path
by removing a leading `./` or `/` and converting backslashes to `/`.
Verify: unit — `./src\\a.ts` matches the PR file `src/a.ts`.

**AC-72 [server]** IF a focus item's file is neither among the PR's files nor among the blast
map's caller files, THEN the system shall drop that item.
Verify: integration — a model focus item on `src/invented.ts` is absent from the stored brief.

**AC-73 [server]** IF a risk reference's file is neither among the PR's files nor among the blast
map's caller files, THEN the system shall remove that reference and drop the risk when no
reference remains.
Verify: unit — a risk with one invented and one real reference keeps only the real one; a risk
with only invented references is dropped.

**AC-74 [server]** IF a risk reference does not match the grammar `path`, `path:N` or `path:N-M`
(N ≥ 1, M ≥ N), THEN the system shall remove that reference.
Verify: unit — `a.ts:0`, `a.ts:9-3` and `a.ts:x` are removed; `a.ts`, `a.ts:3` and `a.ts:3-9`
are kept.

**AC-75 [server]** IF a risk reference's line range on a PR file with a patch intersects none of
that file's new-side changed ranges, THEN the system shall reduce the reference to the bare
path.
Verify: unit — changed range `12-18` with reference `a.ts:40-52` → `a.ts`; `a.ts:15-30` is kept.

**AC-76 [server]** IF a focus item's line on a PR file with a patch lies outside every new-side
changed range of that file, THEN the system shall drop that item.
Verify: unit — changed range `12-18` with line 19 → dropped; line 12 → kept.

**AC-77 [server]** IF a focus item's file is in the blast map but not among the PR's files, THEN
the system shall keep the item only when its line equals a caller line the blast map lists for
that file.
Verify: unit — blast caller `src/server.ts:88` with item line 88 → kept; line 87 → dropped.

**AC-78 [server]** WHERE a focus item's or risk reference's file is a PR file whose `patch` is
null, the system shall check the path only.
Verify: unit — a binary PR file with line 5 → the item is kept.

**AC-79 [server]** After validation, the system shall keep at most 5 risks, ordered high, then
medium, then low, with ties kept in model order.
Verify: unit — 7 valid risks of mixed severity → 5 stored, in that order.

**AC-80 [server]** After validation, the system shall keep at most 6 focus items in model order,
dropping exact duplicates of the same `file:line`.
Verify: unit — 8 valid items including one duplicate → the first 6 distinct ones.

**AC-81 [server]** The system shall cut stored model text to these limits: `summary` 400
characters, risk `title` 120, risk `explanation` 600, focus `reason` 200.
Verify: unit — a 450-character summary is stored at 400 characters.

**AC-82 [server]** The system shall store in `dropped` the number of risks and focus items removed
by the path and line checks (AC-72 to AC-77). Items cut by the caps of AC-79 and AC-80 are not
counted.
Verify: unit — one invented path and one out-of-range line among 3 focus items →
`dropped.review_focus: 2`.

### Storing and returning the brief

**AC-83 [server]** WHEN a generation succeeds, the system shall store the validated brief for the
PR in place of any earlier one, with:
- `head_sha` — the SHA the brief was generated for: the PR's `head_sha` in the database at
  generation time, which holds GitHub's live head after the last detail open (AC-98, DR-58);
- `generated_at`, `model`, `usage`, `inputs` and `dropped`.

Verify: integration — two successful POSTs leave one stored brief, whose `generated_at` is the
second one's.

**AC-84 [server]** WHEN a generation succeeds, POST shall respond 200 with the envelope
`{brief, generating: false, stale}` (contract C-1).
Verify: integration — the POST response body equals a subsequent GET's body.

**AC-85 [server]** The stored `usage` shall carry:
- `llm_calls` — the attempts the engine reports;
- `tokens_in`, `tokens_out` and `cost_usd` — as the provider reports them, null when unknown;
- `duration_ms` — of the model call.

Verify: integration — the mock provider's usage (100/50 tokens, $0.001) is stored as given, with
`llm_calls: 1`.

### Failures and guards

**AC-86 [server]** IF the provider resolved for `risk_brief` has no API key configured, THEN POST
shall respond 422 `llm_not_configured`, naming the provider and "Settings → Models", without a
model call.
Verify: integration — empty secrets → 422 with that code and a message containing the provider
name and "Settings → Models".

**AC-87 [server]** IF the provider rejects the request with a 4xx status, THEN POST shall respond
422 `llm_request_rejected`, naming the model.
Verify: integration — a fake throwing status 404 → 422 with that code.

**AC-88 [server]** IF the model call does not finish within 120 s, THEN POST shall respond 502
`llm_timeout`.
Verify: integration — a fake that never settles plus an injected short deadline → 502
`llm_timeout`.

**AC-89 [server]** IF the model call fails for any reason not covered by AC-70, AC-86, AC-87 or
AC-88, THEN POST shall respond 502 `llm_failed`.
Verify: integration — a fake throwing status 503 → 502 `llm_failed`.

**AC-90 [server]** IF a generation fails, THEN the system shall leave the previously stored brief
unchanged.
Verify: integration — a stored brief, then a POST failing with timeout → GET returns the original
brief byte for byte.

**AC-91 [server]** IF a POST arrives while a generation for the same PR is in flight, THEN the
system shall respond 409 `generation_in_progress` without a model call.
Verify: integration — the fake is held mid-call, a second POST returns 409, and the fake records
1 call.

**AC-92 [server]** IF a workspace sends more than 3 generate requests within 60 s, THEN the
system shall respond 429 `rate_limited` without a model call.
Verify: integration — the 4th POST within the window returns 429 (an in-module limit, because the
rate-limit plugin is off under test, `server/INSIGHTS.md` 2026-10-02).

**AC-93 [server]** IF the PR id does not belong to the caller's workspace, THEN GET and POST
`/pulls/:id/brief` shall respond 404 without reading that PR's brief or making a model call.
Verify: integration — a PR of a second workspace → 404 on both routes, and 0 fake-LLM calls.

**AC-94 [server]** WHEN a generation ends, successfully or not, the system shall write exactly
one log line through an injected logger:
`brief: pr=<id> llm_calls=<n> model=<provider/model> tokens_in=<n|unknown> tokens_out=<n|unknown> cost_usd=<x|unknown> duration_ms=<n> status=<ok|failed> reason=<code|none> dropped_risks=<n> dropped_focus=<n> truncated=<sections|none>`.
Verify: integration — a captured logger receives one line with `llm_calls=1 status=ok`; on a
timeout, one line with `status=failed reason=llm_timeout`.

### Contract, labels and seed

**AC-95 [server, client]** The `PrBrief` contract change (C-3) shall be identical in
`server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`.
Verify: unit — both `vendor-shared-sync` tests pass, and a sample brief with `summary` and
`review_focus` parses in both packages.

**AC-96 [server]** The seed shall contain a stored brief for the seeded PR #482 with `head_sha`
`a1b2c3d4e5f6`, at least one risk and at least one focus item. Each item passes the checks of
AC-71 to AC-78 against the seeded files.
Verify: integration — after `seed`, GET returns the brief with `stale: false`, and re-validating
it removes nothing; e2e — see AC-31 and AC-47.

### Decisions added after review

**AC-97 [server]** IF a risk reference with a line range targets a file that is in the blast map
but not among the PR's files, THEN the system shall keep the range only when it contains a
caller line the blast map lists for that file, and otherwise reduce the reference to the bare
path (DR-57).
Verify: unit — blast caller `src/server.ts:88`: reference `src/server.ts:80-90` is kept;
`src/server.ts:10-20` becomes `src/server.ts`.

**AC-98 [server]** WHEN `GET /pulls/:id` loads the PR from GitHub, the system shall persist
GitHub's live `head_sha` into `pull_requests.head_sha` (DR-58).
Verify: integration — a mock GitHub client returning head `bbb222` for a PR stored with `aaa111`
→ after the GET the PR row holds `bbb222`, and a brief stored for `aaa111` now reads
`stale: true`.

**AC-99 [server]** IF `GET /pulls/:id` serves the offline fallback, THEN the system shall leave
`pull_requests.head_sha` unchanged (DR-58).
Verify: integration — a mock GitHub client that throws → the PR row keeps its earlier
`head_sha`.

## Edge cases

- **EC-1** The user double-clicks "Generate brief". → AC-10, AC-91
- **EC-2** The user reloads or navigates away during a generation. → AC-11, AC-46
- **EC-3** A new commit is pushed after the brief was generated. → AC-23, AC-45
- **EC-4** No intent has been derived for the PR. → AC-52
- **EC-5** The repository is not indexed, or the blast radius is degraded. → AC-57, AC-58
- **EC-6** The PR body mentions `#N` without a closing keyword, or references another repository.
  → AC-53
- **EC-7** GitHub is unreachable or no token is configured. → AC-54
- **EC-8** No documents are attached for the repository, or the clone is missing. → AC-56
- **EC-9** Nobody has opened the PR, so it has no stored files. → AC-48
- **EC-10** The PR has more files than GitHub returned (100-file page). → AC-59
- **EC-11** The model names a file that is neither in the PR nor in the blast map. → AC-72, AC-73
- **EC-12** The model names a line outside the changed ranges, or a deleted-side line. → AC-76,
  AC-75
- **EC-13** A focus item targets a binary or oversized file (`patch: null`). → AC-78
- **EC-14** Every risk or every focus item is removed by validation. → AC-27, AC-29, AC-22
- **EC-15** The model returns more items than the caps, or duplicates. → AC-79, AC-80
- **EC-16** The model returns over-long text. → AC-81
- **EC-17** The model spells a path `./src/a.ts` or with backslashes. → AC-71
- **EC-18** The model returns an unknown risk kind. → AC-25
- **EC-19** A risk reference is malformed (`a.ts:0`, `a.ts:9-3`). → AC-74
- **EC-20** The PR has never been reviewed. → AC-17
- **EC-21** The `risk_brief` provider has no API key (default openai / gpt-4.1). → AC-86
- **EC-22** The provider rejects the model id. → AC-87
- **EC-23** The model does not answer within 120 s. → AC-88
- **EC-24** The model returns JSON that fails the schema. → AC-70
- **EC-25** A regeneration fails while a brief is stored. → AC-90, AC-13
- **EC-26** The inputs still exceed 8,000 tokens after cutting tiers 1–4, or even with zero file
  rows. → AC-62, AC-63
- **EC-27** A risk reference with a line range targets a blast-only file. → AC-97
- **EC-28** A deep link names a file not in the PR. → AC-40
- **EC-29** A deep link names a line that is not rendered (deleted side, outside hunks). → AC-39
- **EC-30** A focus item or risk reference points at a blast-only file. → AC-33, AC-34
- **EC-31** A PR id from another workspace is requested. → AC-93
- **EC-32** PR text, issue text or a document contains instructions aimed at the model. → AC-67,
  AC-68, AC-69
- **EC-33** Model text contains HTML or URLs. → AC-30
- **EC-34** More than 3 generations per minute from one workspace. → AC-92
- **EC-35** The viewport is narrower than 900 px. → AC-2
- **EC-36** A generation fails after the user reloaded, so the page did not start it. → Non-goal
  (known limitation)
- **EC-37** The database `head_sha` lags the live head that GitHub reports. → AC-98, AC-99,
  AC-23
- **EC-38** The PR description is empty. → AC-60 (`description` `missing`, reason `empty`)

## Non-functional requirements

**NFR-1 [client]** Every focus item, risk reference, risk chevron, the "Generate brief" button
and the refresh icon shall be a native button, reachable with Tab and activated with Enter (WCAG
2.2 AA, 2.1.1).
Verify: unit — each control is a `button` element, and Enter on a focused focus item navigates.

**NFR-2 [client]** Each risk chevron shall expose `aria-expanded` matching its panel's open
state.
Verify: unit — `aria-expanded` is `false`, then `true` after activation.

**NFR-3 [client]** Every new or changed UI string of this feature shall come from the `brief`
namespace (`client/messages/en/brief.json`). `block.risks` reads "Risk areas", and
`unavailableHint` no longer tells the user to run a review.
Verify: unit — the rendered Overview contains no raw dot-path key, and the two reworded values
render.

**NFR-4 [server]** `GET /pulls/:id/brief` shall make no call to GitHub or to a model provider.
Verify: integration — with a throwing mock GitHub client and a fake LLM, GET succeeds and neither
records a call.

## Module interactions

### Generation (POST)

```mermaid
sequenceDiagram
  participant client
  participant api
  participant db as Postgres
  participant gh as GitHub
  participant llm as LLM
  client->>api: POST /pulls/:id/brief
  api->>db: PR in caller workspace, files, intent, attached docs list
  alt PR not in workspace or zero files
    api-->>client: 404 or 422 files_unavailable
  end
  api->>gh: linked issue by closing keyword
  gh-->>api: issue, or error recorded as missing
  api->>api: blast facts, diff stats, budget cuts, untrusted blocks
  api->>llm: one structured call on the risk_brief model
  alt timeout, rejected or invalid output
    llm-->>api: error
    api-->>client: 422 or 502, earlier brief kept
  else success
    llm-->>api: summary, risks, review_focus
    api->>api: validate paths and lines, apply caps
    api->>db: replace stored brief with head_sha and usage
    api-->>client: 200 envelope
  end
```

| Boundary | Direction, mode | Data | On failure or delay |
|---|---|---|---|
| client → api | sync HTTP, up to 120 s | POST without body / GET | inline error, no toast (AC-12–14); polling while `generating` (AC-11) |
| api → Postgres | sync | PR row (workspace-scoped), `pr_files`, `pr_intent`, settings, attachments, stored brief | 404 for a foreign PR (AC-93); 422 with zero files (AC-48) |
| api → repo-intel (in-process) | sync | blast summary, changed symbols, callers, degraded reason | degraded → `used` with reason (AC-57); unusable → `missing` (AC-58) |
| api → clone working tree | sync | attached document text | `clone_unavailable` (AC-56) |
| api → GitHub | sync | linked issue title and body | `github_unavailable`, generation continues (AC-54) |
| client → api (`GET /pulls/:id`, pulls module) | sync HTTP | live PR detail; persists GitHub's `head_sha` | offline fallback leaves `head_sha` untouched (AC-98, AC-99) |
| api → LLM | sync, one call, 120 s deadline | prompt ≤ 8,000 tokens; output ≤ 8,000 tokens | 422 `llm_not_configured` / `llm_request_rejected`, 502 `llm_timeout` / `llm_invalid_output` / `llm_failed`, earlier brief kept (AC-70, AC-86–90) |

### Brief states (as the Overview shows them)

```mermaid
stateDiagram-v2
  [*] --> Empty
  Empty --> Generating : Generate brief
  Generating --> Ready : success
  Generating --> FailedEmpty : failure with no stored brief
  Generating --> ReadyWithError : failure with a stored brief
  FailedEmpty --> Generating : Retry
  ReadyWithError --> Generating : refresh
  Ready --> Generating : refresh
  Ready --> Stale : new head commit
  Stale --> Generating : Regenerate
```

### Contracts (all **proposed**; snake_case on the wire; both `vendor/shared` copies in lock-step)

**C-1 — `GET /pulls/:id/brief`**, and the 200 response of `POST /pulls/:id/brief`

| Field | Type | Req | Notes |
|---|---|---|---|
| `brief` | `PrBrief` (C-3) \| null | req | null when none is stored |
| `generating` | boolean | req | a generation for this PR is in flight |
| `stale` | boolean | req | computed on read (AC-45) |

GET errors: 404 when the PR is not in the caller's workspace.

**C-2 — `POST /pulls/:id/brief`**: no request body (an absent or empty body is accepted). The
200 response is C-1. Errors use the existing `{error: {code, message}}` body:

| Status | `code` | When |
|---|---|---|
| 404 | not found | PR not in the caller's workspace (AC-93) |
| 409 | `generation_in_progress` | same PR already generating (AC-91) |
| 422 | `files_unavailable` | zero stored files (AC-48) |
| 422 | `llm_not_configured` | no key for the resolved provider (AC-86) |
| 422 | `llm_request_rejected` | provider 4xx (AC-87) |
| 429 | `rate_limited` | over 3 per 60 s per workspace (AC-92) |
| 502 | `llm_timeout` | no answer within 120 s (AC-88) |
| 502 | `llm_invalid_output` | output fails C-4 (AC-70) |
| 502 | `llm_failed` | any other model failure (AC-89) |

**C-3 — `PrBrief` (changed; existing `Risk`, `Risks`, `Intent` and `BlastRadius` reused unchanged)**

| Field | Type | Req | Notes |
|---|---|---|---|
| `summary` | string, ≤ 400 chars | req | **new** |
| `risks` | `Risks` (`{risks: Risk[]}`) | req | `Risk.file_refs` grammar `path` \| `path:N` \| `path:N-M` |
| `review_focus` | `{file: string, line: int ≥ 1, reason: string ≤ 200}[]` | req | **new** |
| `intent` | `Intent` \| null | req | **changed to nullable**: snapshot used, null when missing |
| `blast` | `BlastRadius` \| null | req | **changed to nullable**: snapshot used |
| `history` | `PrHistory` | optional | **changed to optional**; not filled (Non-goal) |
| `head_sha` | string | req | **new** |
| `generated_at` | ISO string | req | **new** |
| `model` | string `provider/model` | req | **new** |
| `usage` | `{llm_calls: int, tokens_in: int\|null, tokens_out: int\|null, cost_usd: number\|null, duration_ms: int}` | req | **new** |
| `inputs` | `{source: intent\|blast\|diff_stats\|description\|linked_issue\|specs, status: used\|truncated\|missing, reason?: string, omitted?: int}[]` | req | **new**; `omitted` = file rows cut by the budget, on `diff_stats` only (AC-63); reasons: `not_derived`, `no_linked_issue`, `github_unavailable`, `none_attached`, `clone_unavailable`, `over_budget`, `file_list_truncated`, `empty`, or a `BlastDegradedReason` |
| `dropped` | `{risks: int, review_focus: int}` | req | **new** |

**C-4 — api → LLM structured call**
- **Request parameters:**
  - model: from `risk_brief` (AC-65);
  - `maxRetries: 0`, `disableReasoning: true`, `maxTokens: 8000`;
  - a deadline of 120 s that the api enforces itself, since `timeoutMs` is ignored by OpenRouter
    (`server/INSIGHTS.md` 2026-09-19).
- **Output schema:** `{summary: string, risks: Risk[], review_focus: {file, line, reason}[]}`.
- **Prompt vocabulary:** the prompt asks for `Risk.kind` from `security | db_migration |
  breaking_api | perf | deps`.

**C-5 — Files changed deep link (client URL)**: `?tab=diff&file=<URL-encoded path>&line=<positive
integer, optional>` on `/repos/:repoId/pulls/:number`.

## Inputs and provenance

| Input | Comes from | Produced by | Freshness | Trusted |
|---|---|---|---|---|
| PR title | `pull_requests` | GitHub (PR author) | last list sync | no |
| PR description | `pull_requests.body` | GitHub (PR author) | last detail open | no |
| Linked issue title and body | GitHub API, live | issue author | at generation | no |
| Intent (intent, in/out of scope) | `pr_intent` | LLM (L03), from PR text | as stored, may be older than head | no |
| Blast summary, changed symbols, callers, `indexed_sha` | repo-intel index (in-process) | indexer over repo files | last index | no (names from repo content) |
| File paths, additions, deletions | `pr_files` | GitHub, written on detail open (`server/INSIGHTS.md` 2026-09-23) | last detail open | no (paths are author-controlled) |
| New-side changed ranges | hunk headers of `pr_files.patch` | derived by api | last detail open | no (validated as numbers) |
| File role | path classification (Smart Diff) | api, deterministic | at generation | derived |
| Spec documents | clone working tree, via SPEC-01 attachments | repo authors | last clone sync | no |
| `risk_brief` model choice | workspace settings | workspace user | at generation | yes |
| `head_sha` | `pull_requests.head_sha` | GitHub, via list sync and every live detail open (AC-98) | last list sync or live detail open | yes |
| Latest review verdict, score, findings | `GET /pulls/:id/reviews` | earlier review runs | as stored | LLM output, shown as stored |
| Summary, risks, focus items | LLM output | model | at generation | no |

## Untrusted inputs

| Untrusted input | Required handling | Where |
|---|---|---|
| PR title, PR description | inside an untrusted-data block with a constant label; control characters stripped; description cut by the budget | AC-67, AC-68, AC-69, AC-62 |
| Linked issue title and body | only a keyword-linked, same-repository issue is fetched; block-wrapped; stripped; cut by the budget | AC-53, AC-67, AC-69, AC-62 |
| Intent text | block-wrapped (it is model output derived from PR text) | AC-67 |
| Spec document text | block-wrapped; only documents attached in this workspace for this repository; dropped whole by the budget | AC-55, AC-67, AC-62 |
| File paths, symbol and caller names | block-wrapped; output paths compared after normalisation | AC-67, AC-71 |
| LLM output (summary, risks, focus) | schema-validated; every path checked against the PR files or blast map; lines checked against changed ranges; text length-capped; rendered as plain text | AC-70, AC-72–AC-81, AC-30 |
| PR id in the URL | resolved inside the caller's workspace before any read | AC-93 |

## Design review

| ID | Finding (Pass 1) | Evidence | Decision → destination |
|---|---|---|---|
| DR-1 | The model cannot choose lines it never sees | `platform.ts:189-194`; `adapters/git/diff-parser.ts:14-79` | accepted → AC-50, AC-51, AC-75, AC-76 |
| DR-2 | The no-brief, generating and failed states are not drawn | `screen_pr_detail.jsx:65-80` | accepted → AC-6, AC-7, AC-9, AC-12 |
| DR-3 | A failed regeneration over a stored brief | onboarding `service.ts:346-349` | accepted → AC-13, AC-90 |
| DR-4 | Reload or navigation during a long generation | onboarding `service.ts:224-230` | accepted → AC-11, AC-46 |
| DR-5 | Files missing when the PR was never opened; 100-file cap | `server/INSIGHTS.md` 2026-09-23; `octokit.ts:80-91` | accepted → AC-48, AC-59. Truncation is detected as stored count < `files_count` |
| DR-6 | No intent derived yet | `intent/routes.ts:60-76`; `run-executor.ts:137` | accepted → AC-52; Non-goal (no auto-derive) |
| DR-7 | Blast degraded or empty | `brief.ts:66-73`; `seed.ts:100` | accepted → AC-57, AC-58 |
| DR-8 | Validation can remove everything | — | accepted → AC-27, AC-29, AC-22, AC-82 |
| DR-9 | Output size undefined | `1.webp` (3 risks, 4 focus items) | accepted → AC-79, AC-80, AC-81 |
| DR-10 | Focus target with `patch: null` | `platform.ts:193` | accepted → AC-78 |
| DR-11 | Deleted-side lines cannot be anchored | `diff-viewer/annotations.ts:34-37` | accepted → AC-76 (new side only), AC-39 |
| DR-12 | Path spelling varies | `diff-viewer/annotations.ts:67-73` | accepted → AC-71 |
| DR-13 | The Description section is not in `1.webp` | `OverviewTab.tsx:31-36` | accepted (kept, below Review focus) → AC-1 |
| DR-14 | `brief.json` strings conflict with the new flow | `client/messages/en/brief.json` | accepted → NFR-3 |
| DR-15 | Overview layout differs from the design | `OverviewTab.tsx:22-36` vs `1.webp` | accepted (compose and move, not rebuild) → AC-1, AC-3, AC-4, AC-5 |
| DR-16 | VerdictBanner exists only on Agent runs, with no cost or refresh | `ReviewRunAccordion.tsx:139-146`; `VerdictBanner.tsx:30-57`; `findings.jsx:97-99` | accepted (reuse and extend) → AC-15–AC-20 |
| DR-17 | Risk areas: pill row (mock) vs stacked pills (screenshots) | `screen_pr_detail.jsx:23-37`; `1.webp`, `4.webp` | accepted (screenshots win) → AC-24, AC-26 |
| DR-18 | The Review focus card exists only in screenshots | `1.webp`, `3.webp`, `4.webp` | accepted → AC-4, AC-28 |
| DR-19 | Files changed has no deep link and no focus state | `page.tsx:66-67`; `DiffTab.tsx:16-22`; `5.webp` | accepted → AC-35–AC-42 |
| DR-20 | The shipped Intent card has extras the screenshot lacks (confidence, Recalculate, sources) | `IntentCard.tsx:70-106` | accepted (kept as shipped) → AC-5 |
| DR-21 | The Blast card is built as drawn; caller links go to GitHub | `BlastTree.tsx:49-54` | accepted (unchanged) → AC-5, AC-34 |
| DR-22 | Bound the synchronous model call | `server/INSIGHTS.md` 2026-09-19 | accepted → AC-66, AC-88, C-4 |
| DR-23 | The linked issue is unreliable and not persisted | `server/INSIGHTS.md` 2026-09-22; `intent/service.ts:185-216` | accepted → AC-53, AC-54 |
| DR-24 | LLM failure modes; missing key is a raw 500 today | `container.ts:182-211` | accepted → AC-86–AC-89, C-2 |
| DR-25 | Concurrency of generations | onboarding `service.ts:215-230` | accepted → AC-10, AC-91 |
| DR-26 | Rate limit | SPEC-02 AC-16; security skill A06; `server/INSIGHTS.md` 2026-10-02 | accepted → AC-92 |
| DR-27 | Global mutation toast duplicates inline errors | `client/INSIGHTS.md` 2026-09-19; `providers.tsx:36-46` | accepted → AC-14 |
| DR-28 | Prompt inputs are attacker-controllable | `reviewer-core/src/prompt.ts:38-44`; `intent/prompt.ts:51-80` | accepted → AC-67, AC-68, AC-69 |
| DR-29 | LLM output shown in the UI | security skill, Agentic AI (ASI09) | accepted → AC-30, AC-81; Non-goal (markdown/URLs) |
| DR-30 | `pr_brief` has no `workspace_id` | `db/schema/reviews.ts:82-87` | accepted → AC-93 |
| DR-31 | Attached documents are scoped through agents and repositories | `db/schema/project-context.ts:15-51` | accepted → AC-55 |
| DR-32 | P1: all P3 items as ACs | `1.webp`, `5.webp` | accepted → AC-16, AC-26, AC-32, AC-33, AC-9, NFR-3 |
| DR-33 | P2: "Built without" line | course P1 "says which data is missing" | accepted → AC-21, AC-60 |
| DR-34 | P3: survive reload mid-generation | — | accepted → AC-11, AC-46 |
| DR-35 | P4: one column below 900 px | long mono paths in the Blast card | accepted → AC-2 |
| DR-36 | P5: keyboard access | `vendor/ui` MonoLink `onClick` renders a button | accepted → NFR-1, NFR-2 |
| DR-37 | P6: keep the Description section | `OverviewTab.tsx:31-36` | accepted → AC-1 |
| DR-38 | P7: non-goals (auto-derive, auto-regenerate, MCP, Prior PRs, hunk bodies) | — | accepted → Non-goals |
| DR-39 | Q1: whose summary the banner shows | `data.jsx:19-21` | accepted (brief summary; verdict from the latest review) → AC-15, AC-16, AC-17; Non-goal |
| DR-40 | Q2: whose cost the banner shows | `findings.jsx:97-99` | accepted (brief generation cost; model as tooltip) → AC-18, AC-19 |
| DR-41 | Q3: one call vs schema-repair retries | `openrouter.ts:112`; intent `maxRetries 1` | accepted → AC-64, AC-66, AC-70 |
| DR-42 | Q4: which specs | `project-context/service.ts:68-74` | accepted (union over enabled agents) → AC-55, AC-56 |
| DR-43 | Q5: budget unit and truncation order | `adapters/tokenizer/index.ts:14-40` | accepted → AC-61, AC-62, AC-63 |
| DR-44 | Q6: line validation strictness | — | accepted → AC-75–AC-78 |
| DR-45 | Q7: blast-only files | `BlastRadiusCard/helpers.ts:148-159` | accepted → AC-33, AC-34. The click shows the message; the message holds the GitHub link |
| DR-46 | Q8: staleness | SPEC-02 AC-33; `pulls/routes.ts:59,71` | accepted (notice, no auto-regenerate) → AC-23, AC-45; stored SHA source → DR-58 |
| DR-47 | Q9: contract shape | `brief.ts:197-203` | accepted → C-1, C-3, AC-95 |
| DR-48 | Q10: `file_refs` shape | `data.jsx:43-45` | accepted (string grammar) → AC-74; Non-goal (structured refs) |
| DR-49 | Q11: `Risk.kind` vocabulary | `screen_pr_detail.jsx:20-21` | accepted → AC-24, AC-25, C-4; Non-goal (enum) |
| DR-50 | Q12: default model openai / gpt-4.1 | `platform.ts:59-64`; `client/INSIGHTS.md` 2026-09-22 | accepted (unchanged; clear 422) → AC-86; Non-goal |
| DR-51 | Q13: rate-limit numbers | — | accepted → AC-91, AC-92 |
| DR-52 | Q14: observability of "one call" | `server/INSIGHTS.md` 2026-10-02 (logger silent under test) | accepted → AC-94, AC-85, AC-18 |
| DR-53 | Q15: deep-link format | — | accepted → C-5, AC-31, AC-35–AC-42 |
| DR-54 | Q16: risk click behaviour | — | accepted → AC-26, AC-32 |
| DR-55 | Q17: seed fixture brief; no e2e LLM stub | `e2e/CLAUDE.md:5-6`; `seed.ts:189-204` | accepted → AC-96, AC-47, AC-31; Non-goal (generation in e2e) |
| DR-56 | Pass 2 OQ-1: inputs still over budget after every cut | — | decided: never refuse; cut file rows below the 30-file floor down to zero, then truncate the blast summary, intent and PR title text; record `omitted` → AC-62, AC-63 |
| DR-57 | Pass 2 OQ-2: risk reference with a range on a blast-only file | — | decided: keep the range only if it contains a listed caller line, else bare path → AC-97 |
| DR-58 | Pass 2 OQ-3: which SHA the brief stores | `pulls/routes.ts:59,71` (only the list sync writes `head_sha`) | decided: `GET /pulls/:id` persists GitHub's live `head_sha`, and the offline fallback leaves it untouched; the brief stores the SHA it was generated for; `stale` compares against `pull_requests.head_sha` → AC-98, AC-99, AC-83, AC-45 |
| DR-59 | Pass 2 OQ-4: failure reason after a reload | — | decided: accepted as a known limitation → Non-goals |

## Traceability

| AC / NFR | From (US / EC / design review) | Packages | Verify |
|---|---|---|---|
| AC-1 | US-10, DR-13, DR-15, DR-37 | client | unit |
| AC-2 | EC-35, DR-35 | client | unit, manual |
| AC-3 | US-2, DR-15 | client | unit |
| AC-4 | US-3, DR-18 | client | unit |
| AC-5 | US-10, DR-20, DR-21 | client | unit |
| AC-6 | US-1, DR-2 | client | unit |
| AC-7 | US-1, DR-2 | client | unit |
| AC-8 | US-1 | client | unit |
| AC-9 | US-1, DR-2, DR-32 | client | unit |
| AC-10 | EC-1, DR-25 | client | unit |
| AC-11 | EC-2, DR-4, DR-34 | client | unit |
| AC-12 | DR-2, DR-24 | client | unit |
| AC-13 | EC-25, DR-3 | client | unit |
| AC-14 | DR-27 | client | unit |
| AC-15 | US-1, DR-39 | client | unit |
| AC-16 | US-6, DR-16, DR-39 | client | unit |
| AC-17 | EC-20, DR-39 | client | unit |
| AC-18 | US-7, DR-40 | client | unit |
| AC-19 | US-7, DR-40 | client | unit |
| AC-20 | US-4, DR-16 | client | unit |
| AC-21 | US-8, DR-33 | client | unit |
| AC-22 | EC-14, DR-8 | client | unit |
| AC-23 | US-5, EC-3, EC-37, DR-46 | client | unit |
| AC-24 | US-2, DR-17, DR-49 | client | unit |
| AC-25 | EC-18, DR-49 | client | unit |
| AC-26 | US-2, DR-32, DR-54 | client | unit |
| AC-27 | EC-14, DR-8 | client | unit |
| AC-28 | US-3, DR-18 | client | unit |
| AC-29 | EC-14, DR-8 | client | unit |
| AC-30 | US-9, EC-33, DR-29 | client | unit |
| AC-31 | US-3, DR-53, DR-55 | client | unit, e2e |
| AC-32 | US-2, DR-54 | client | unit |
| AC-33 | EC-30, DR-45 | client | unit |
| AC-34 | EC-30, DR-45 | client | unit |
| AC-35 | US-3, DR-19 | client | unit |
| AC-36 | US-3, DR-19, DR-53 | client | unit, manual |
| AC-37 | US-3, DR-19 | client | unit |
| AC-38 | US-3, DR-19 | client | unit |
| AC-39 | EC-29, DR-11 | client | unit |
| AC-40 | EC-28 | client | unit |
| AC-41 | US-3, DR-53 | client | unit |
| AC-42 | US-3, DR-53 | client | unit |
| AC-43 | US-4 | server | integration |
| AC-44 | US-4 | server | integration |
| AC-45 | US-5, EC-3, DR-46, DR-58 | server | integration |
| AC-46 | EC-2, DR-4 | server | integration |
| AC-47 | US-4, DR-55 | client | unit, e2e |
| AC-48 | EC-9, DR-5 | server | integration |
| AC-49 | US-1, US-10 | server | integration |
| AC-50 | DR-1 | server | unit |
| AC-51 | DR-1, DR-38 | server | integration |
| AC-52 | EC-4, DR-6 | server | integration |
| AC-53 | EC-6, DR-23 | server | unit |
| AC-54 | EC-7, DR-23 | server | integration |
| AC-55 | DR-31, DR-42 | server | integration |
| AC-56 | EC-8, DR-42 | server | integration |
| AC-57 | EC-5, DR-7 | server | integration |
| AC-58 | EC-5, DR-7 | server | integration |
| AC-59 | EC-10, DR-5 | server | integration |
| AC-60 | US-8, EC-38, DR-33 | server | integration |
| AC-61 | DR-43 | server | integration |
| AC-62 | EC-26, DR-43, DR-56 | server | unit |
| AC-63 | US-8, EC-26, DR-43, DR-56 | server | unit |
| AC-64 | US-7, DR-41 | server | integration |
| AC-65 | DR-50 | server | integration |
| AC-66 | DR-22, DR-41 | server | integration |
| AC-67 | US-9, EC-32, DR-28 | server | integration |
| AC-68 | US-9, EC-32, DR-28 | server | unit |
| AC-69 | EC-32, DR-28 | server | unit |
| AC-70 | EC-24, DR-41 | server | integration |
| AC-71 | EC-17, DR-12 | server | unit |
| AC-72 | EC-11, DR-29 | server | integration |
| AC-73 | US-2, EC-11 | server | unit |
| AC-74 | EC-19, DR-48 | server | unit |
| AC-75 | EC-12, DR-44 | server | unit |
| AC-76 | EC-12, DR-11, DR-44 | server | unit |
| AC-77 | EC-30, DR-44 | server | unit |
| AC-78 | EC-13, DR-10 | server | unit |
| AC-79 | EC-15, DR-9 | server | unit |
| AC-80 | EC-15, DR-9 | server | unit |
| AC-81 | EC-16, DR-9, DR-29 | server | unit |
| AC-82 | EC-14, DR-8 | server | unit |
| AC-83 | US-4, DR-46, DR-58 | server | integration |
| AC-84 | US-4 | server | integration |
| AC-85 | US-7, DR-52 | server | integration |
| AC-86 | EC-21, DR-24, DR-50 | server | integration |
| AC-87 | EC-22, DR-24 | server | integration |
| AC-88 | EC-23, DR-22 | server | integration |
| AC-89 | DR-24 | server | integration |
| AC-90 | EC-25, DR-3 | server | integration |
| AC-91 | EC-1, DR-25, DR-51 | server | integration |
| AC-92 | EC-34, DR-26, DR-51 | server | integration |
| AC-93 | US-9, EC-31, DR-30 | server | integration |
| AC-94 | US-7, DR-52 | server | integration |
| AC-95 | DR-47 | server, client | unit |
| AC-96 | DR-55 | server | integration, e2e |
| AC-97 | EC-27, DR-57 | server | unit |
| AC-98 | US-5, EC-37, DR-58 | server | integration |
| AC-99 | EC-37, DR-58 | server | integration |
| NFR-1 | DR-36 | client | unit |
| NFR-2 | DR-36 | client | unit |
| NFR-3 | DR-14, DR-32 | client | unit |
| NFR-4 | US-4 | server | integration |

## Open questions

None. The four questions raised while writing Pass 2 were answered by the user and are recorded
as DR-56 to DR-59 in *Design review*.
