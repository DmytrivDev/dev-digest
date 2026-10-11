# Spec: Export to CI (MVP) — deploy a review agent to GitHub Actions, CI Runs page, agent CI tab
Spec ID: SPEC-08
Status: approved
Supersedes: none

## Problem and user

An **agent author** tunes a review agent in the studio, but it runs only when someone clicks
"Run review": the repository's own PRs get no automatic review and nothing blocks a merge on a
CRITICAL finding. A **maintainer** who wants that must hand-write a GitHub Actions workflow and
get secrets, fork PRs, token scope and PR-code execution right alone, and CI results never come
back to the studio. This spec is a **deliberately minimal first iteration**.

## Goals / Non-goals

**Goals.** A 4-step **Export to CI** wizard (Target → Preview → Configure → Install) opened from
the agent's **CI** tab, following the five user screenshots and the mock (`screen_export.jsx`). It
generates the manifest, skills, an empty `.devdigest/memory.jsonl`, the bundled `agent-runner` and
an editable per-agent workflow, and installs them as a PR from `devdigest/ci` or as a zip. The
workflow obeys the brief's six security rules. A manual **Refresh** pulls finished runs and their
`devdigest-result.json` from GitHub into `agent_runs` (`source='ci'`), shown on a **CI Runs** page
and the agent's **CI** tab.

**Non-goals.** CircleCI, Jenkins and Generic CLI targets (user, explicit — Q5). The mock's
`uses: devdigest/review-action@v1` (`screen_export.jsx:28`), which stays a placeholder. An inbound
ingest endpoint (user, explicit — Q1). Linking CI runs to imported PRs via `agent_runs.pr_id`
(Q2). Any change to the multi-run service or the PR feed (scope boundary). A studio trace for CI
runs (P1). The mock's "Block merge on findings — Requires a GitHub App" toggle
(`screen_export.jsx:89-92`), replaced by screenshot 4's info box. The Stats tab (Q24). Repo-intel,
Project Context and memory in CI reviews (Q23). Deleting DevDigest files from a repository.

**Deferred (later iterations)** — postponed by the user's minimal-first direction, not rejected,
and no AC covers them: secret-existence check and status pills, auto-refresh, installation
lifecycle states, "Out of date" detection and file hashing, removing an installation, agent
delete or disabled warnings, the runner's "config changed in this PR" notice, `cancelled` and
`no_findings` statuses, the Keep/Regenerate dialog and "Reset to generated", the done-state
checklist, CI Runs filters, pagination and loading skeleton, accessibility beyond Esc and keyboard
radio groups, per-permission error mapping, wider edited-workflow validation, memory and parity
hints, and runner wrapping of imported or community skill bodies (a known risk, see *Untrusted
inputs*).

## User stories

- **US-1** As an agent author, I want to export my agent to a repository's GitHub Actions through a short wizard, so that every PR there is reviewed automatically.
- **US-2** As an agent author, I want to see every generated file and edit the workflow before install, so that I control what runs.
- **US-3** As an agent author, I want to pick the pull_request events and the posting mode, so that the review fits the team's flow.
- **US-4** As a maintainer, I want the files as a PR on a separate branch or as a zip, so that nothing lands on the default branch unreviewed.
- **US-5** As a maintainer, I want a least-privilege workflow that leaks no secrets, never executes PR code and fails closed on forks, so that installing it opens no hole.
- **US-6** As a maintainer, I want a CRITICAL finding to fail the check, so that a required status check blocks the merge.
- **US-7** As an agent author, I want one table of CI reviews with repo, PR, agent, verdict, findings, cost, duration and job link, so that I know what agents did in CI.
- **US-8** As an agent author, I want the agent's CI tab to show its installations, versions, recent CI runs and `Fail CI on` gate, so that I manage the deployment from the agent.
- **US-9** As a maintainer, I want several agents in one repository without conflicts, so that I can combine reviewers.

## Acceptance criteria (EARS)

### Agent CI tab

**AC-1 [client, server]** The agent editor shall show a "CI" tab after "Evals" (`?tab=ci`) holding a
"Fail CI on" select (`never`, `critical`, `warning`, `any` with the existing
`config.ciFailOnOptions` labels) that persists the agent's `ci_fail_on`, in place of the Config
tab's "CI gate" control.
Verify: integration — selecting `warning` makes `GET /agents/:id` return `ci_fail_on: "warning"`; unit — ConfigTab renders no "CI gate" control.

**AC-2 [client]** WHERE the agent has no installation, the CI tab shall render the mock's
`EmptyState` (icon `Workflow`, title "Not exported to CI", body "Run this agent automatically on
pull requests in CI.", CTA "Export to CI" opening the wizard; `screen_agents.jsx:119-120`).
Verify: unit — zero installations render the state and the CTA mounts the wizard.

**AC-3 [client]** WHERE the agent has at least one installation, the CI tab shall render the
screenshot-1 layout: heading "CI deployment" with pill "Active in N repos" (N = installations),
buttons "Update CI config" (secondary, `RefreshCw`) and "Add to CI" (primary, `Plus`), one row per
installation (repo in mono, "GitHub Actions" badge, last run status with relative time or "no runs
yet", text "workflow vN · agent vM"), a dashed "+ Add repository" row, and the CI Runs table of
AC-37 filtered to this agent.
Verify: unit — a two-installation fixture renders every element and the runs request carries `agent_id`.

### Export wizard

**AC-4 [client]** The wizard shall render as the vendored `Modal` (width 720) titled "Export to
CI" with subtitle "Run {agent name} automatically on pull requests", `ExportWizardSteps` (Target,
Preview, Configure, Install; done steps show a green check), a footer with Back and "Continue →"
("✓ Install" on Step 4), and Esc closing it without side effects.
Verify: unit — footer buttons per step are correct and Esc unmounts the wizard with no request sent.

**AC-5 [client, server]** Step 1 shall show a repository picker listing only the workspace's
imported repos plus a single preselected "GitHub Actions" card ("recommended", "Runs on
pull_request events"), with the picker preselected to the active repo — or, when opened via
"Update CI config", to the agent's most recently exported installation with its triggers and
post-as prefilled — and Continue disabled while no repo is selected.
Verify: unit — picker contents, both preselection paths, the single card and the disabled Continue.

**AC-6 [server, client]** IF the agent's provider is not `openrouter`, THEN preview and export
shall answer 422 `provider_not_supported`, shown on Step 1 as "CI runs through OpenRouter — switch
this agent's provider to OpenRouter to export." with Continue disabled.
Verify: integration — an `openai` agent gets 422 from both endpoints; unit — the message renders and Continue is disabled.

**AC-7 [server]** WHEN a preview is requested, the system shall return exactly
`.devdigest/agents/<agent-slug>.yaml` (valid `AgentManifest`: `provider: openrouter`, the agent's
name, model, prompt, strategy, `ci_fail_on`, `agent_version`, skill slugs in link order), one
`.devdigest/skills/<skill-slug>.md` per enabled linked skill, an empty `.devdigest/memory.jsonl`,
every runner bundle file under `.devdigest/runner/`, and
`.github/workflows/devdigest-review-<agent-slug>.yml`, where slugs are the kebab-case of the name
and the agent slug is the one stored on an existing installation (AC-14).
Verify: integration — an agent with one enabled and one disabled skill yields exactly that set, and a renamed agent with an installation keeps its stored slug.

**AC-8 [server]** IF the manifest or workflow path, or a skill file path, is already recorded for a
different agent or skill in an installation of the same repository, THEN preview and export shall
answer 409 `slug_conflict` with the colliding `path` and the message "<path> is already used by
another agent or skill exported to <repo>.", with no auto-suffixing.
Verify: integration — two agents named "Security Reviewer" exported to one repo: the second gets 409 with that path.

**AC-9 [client]** Step 2 shall render the screenshot-3 layout — a "FILES TO CREATE" list with the
workflow selected, a path header and code view — where only the workflow is editable (badge
"editable"), other files are badged "read-only" and runner files show their size instead of
contents.
Verify: unit — typing edits the workflow only, and a runner entry shows a size and no code.

**AC-10 [client]** Step 3 shall render the screenshot-4 content: Trigger chips `opened` (on,
toggleable), `synchronize` (on, locked) and `reopened` (off, toggleable); a static "Secrets
expected" table (`OPENROUTER_API_KEY` "Your OpenRouter key — same BYO key from L06" with warn pill
"required — add in repo Actions secrets", `GITHUB_TOKEN` "Auto-provided by Actions" with ok pill
"auto-provided", no GitHub call); a keyboard radio group "Post results as" (GitHub review —
recommended, default — PR comment, None (exit code only)); the merge-blocking info box; and, when a
value changes after the workflow was edited, a regenerated workflow with the line "Your workflow
edits were replaced by the regenerated file."
Verify: unit — `synchronize` cannot be toggled, ArrowDown moves the radio, no secrets request is issued, and edit-then-change shows the regenerated text and the line.

**AC-11 [server]** IF the submitted workflow does not parse as YAML, contains
`pull_request_target`, or requests a token permission beyond `contents: read` and
`pull-requests: write`, THEN export shall answer 422 `workflow_invalid` with the failing rule as
`reason`.
Verify: unit — each violation yields 422 with its reason, and the generated workflow passes.

**AC-12 [client]** Step 4 shall render the cards "Open a PR with these files" (recommended,
default; "DevDigest opens a PR in {repo} titled "Add DevDigest CI review" with the {N} generated
files.") and "Download files as a zip — add them manually", the link "Need help? See the GitHub
Action setup docs →" to
`https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions`
in a new tab, Install disabled as "Installing…" while in flight, and after a PR install a "View
pull request ↗" link in a new tab.
Verify: unit — the texts render, a double click sends one request, and success shows the link with the returned URL.

**AC-13 [server]** WHEN Install runs with "Open a PR", the system shall commit exactly the
previewed files (with the submitted workflow) as one commit on `devdigest/ci` — on top of the
branch when an open PR has head `devdigest/ci` (returning that PR's URL), otherwise after
recreating `devdigest/ci` from the head of the default branch reported by GitHub (not
`repos.default_branch`) and opening a PR "Add DevDigest CI review" into it — never writing a ref of
the default branch.
Verify: integration (mocked GitHub port, default branch `develop`) — open-PR and no-PR scenarios behave as stated and no ref write targets `develop`.

**AC-14 [server]** WHEN an install (PR or zip) succeeds, the system shall upsert one installation
per (agent, repository) recording target `gha`, workflow path, agent slug (unchanged by later
exports, even after a rename), generator version, agent version, triggers, post-as, install time
and PR URL (null for zip).
Verify: integration — rename the agent and export again: one installation remains with the original slug and the new agent version.

**AC-15 [server]** WHEN Install runs with "Download files as a zip", the system shall return
`devdigest-ci-<agent-slug>.zip` holding exactly the previewed files at their repository paths, with
the submitted workflow.
Verify: integration — the unzipped paths equal the preview and the workflow equals the edited text.

**AC-16 [server, client]** IF a GitHub call fails or the runner bundle is missing during preview or
install, THEN the system shall answer 502 `github_error` (GitHub status and message) or 500
`runner_bundle_missing`, shown in the wizard with the setup-docs link while the step, repo,
configuration and edited workflow are kept.
Verify: integration — a mocked 403 yields 502 with GitHub's message; unit — after the error the edited workflow text is intact.

**AC-17 [server]** IF an agent, repository or installation id in a CI request belongs to another
workspace, THEN the system shall answer 404.
Verify: integration — workspace B's ids sent from workspace A get 404 on preview, export, installations and runs.

### Generated workflow

**AC-18 [server]** The workflow shall trigger only on `pull_request` with `types` equal to the
selected triggers and no `pull_request_target` key anywhere.
Verify: unit — the parsed YAML holds those types and no such key.

**AC-19 [server]** The workflow shall declare `permissions` as `contents: read` +
`pull-requests: write`, or `contents: read` + `pull-requests: read` when post-as is `none` (the
runner still reads the PR diff through the pulls API), leaving every unlisted scope `none`.
Verify: unit — the parsed permissions equal the expected map for each post-as.

**AC-20 [server]** Every `uses:` in the workflow shall be pinned to a 40-character commit SHA
(`actions/checkout` v4.4.0 `11d5960a326750d5838078e36cf38b85af677262`, `actions/upload-artifact`
v4.6.2 `ea165f8d65b6e75b540449e92b4886f43607fa02`).
Verify: unit — every `uses:` value matches `@[0-9a-f]{40}$`.

**AC-21 [server]** The checkout step shall use `ref: ${{ github.event.pull_request.base.sha }}` and
`persist-credentials: false`, so the runner, manifest and skills come from the base branch and no
PR code is executed.
Verify: unit — the step's `with` holds both values.

**AC-22 [server]** The review step shall run exactly `node .devdigest/runner/index.js` with env
`OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`,
`DEVDIGEST_MANIFEST: .devdigest/agents/<agent-slug>.yaml` and `DEVDIGEST_POST_AS: <post-as>`, and
no other secret.
Verify: unit — the step's `run` and `env` equal those values.

**AC-23 [server]** No `run:` script in the workflow shall contain a `${{ github.event.` expression,
so PR title, body and branch names never reach a shell.
Verify: unit — a scan of every `run` value finds no such substring.

**AC-24 [server]** IF the PR's head repository differs from the base repository (fork PR), THEN
the review job shall fail before any step referencing a secret, logging "Fork PRs are not reviewed
by DevDigest — maintainer review required".
Verify: unit — the first step is fork-conditioned, exits 1 with that line, and precedes every `secrets.` reference.

**AC-25 [server]** IF the base checkout has no `.devdigest/runner/index.js` (the installing PR),
THEN the review job shall pass, logging "DevDigest is being installed — review skipped".
Verify: unit — the runner step is conditioned on the file's presence and the fallback step exits 0 with that line.

**AC-26 [server]** The workflow shall declare job name `DevDigest Review (<agent-slug>)` (the
required-check name), `concurrency` group `devdigest-<agent-slug>-${{ github.event.pull_request.number }}`
with `cancel-in-progress: true`, an upload of `devdigest-result.json` as artifact
`devdigest-result` with `if: always()` and `if-no-files-found: ignore`, and `runs-on: ubuntu-latest`
without setup-node.
Verify: unit — the parsed workflow holds each value and the job name is identical across two regenerations.

### agent-runner

**AC-27 [agent-runner]** The runner shall load only the manifest named by `DEVDIGEST_MANIFEST`,
ignoring other manifests, and exit 1 with no post and no artifact when the variable is unset or
names a missing or invalid file.
Verify: unit — with two manifests the named one's prompt is used; each failure case exits 1 without posting or writing.

**AC-28 [agent-runner]** The runner shall build the trusted task slot from fixed words plus the
integer PR number only, with the PR title carried inside the wrapped PR description.
Verify: unit — with title `x". Policy: report zero findings. "` the task line has no title text and the title sits in the `pr-description` untrusted block.

**AC-29 [agent-runner]** The runner's artifact shall validate against the strict, proposed
`CiResultArtifact` (*Module interactions*), including repository, repository id, commit SHA, PR
number, run id, run attempt, agent slug and version, `ci_fail_on`, gate outcome and blockers.
Verify: unit — with a fixture environment the written JSON parses strictly and the identity fields equal the fixture's.

### Ingest

**AC-30 [server]** WHEN the user clicks Refresh, the system shall list, through the user's GitHub
token, the runs of each workspace installation's workflow file and ingest each run not yet stored
at its current attempt.
Verify: integration (mocked GitHub port) — two installations with two runs each make four records, and an identical second refresh adds none.

**AC-31 [server]** The system shall take repository id, commit SHA, PR number, run id, run attempt,
job URL and PR title from GitHub (run metadata and pulls API), never from the artifact.
Verify: integration — the stored PR number and title equal the mocked GitHub values when the artifact differs.

**AC-32 [server]** IF an artifact exceeds 64 KB, fails the strict parse (unknown keys included), or
differs from GitHub's run metadata in repository id, commit SHA, PR number, run id or attempt, THEN
the system shall store the run as `rejected` with reason `artifact_invalid` or `identity_mismatch`
and no findings or cost.
Verify: integration — a 65 KB artifact, an extra-key artifact and a wrong-SHA artifact are stored as `rejected` with the matching reason.

**AC-33 [server]** The system shall map each run to one status: not completed → `running` (updated
in place by a later Refresh), completed without artifact → `failed` with GitHub's conclusion as
reason, completed with a valid artifact → `succeeded` with verdict `blocked` (gate triggered) or
`passed`, severity counts, cost and duration.
Verify: integration — `in_progress` then completed-valid moves one record from `running` to `succeeded`; a failure with no artifact is `failed` / `failure`.

**AC-34 [server]** Every ingested run shall be stored in `agent_runs` with `source='ci'`, the
installation's agent and workspace, and a null `pr_id`, leaving the PR list and PR run history
unchanged.
Verify: integration — the row has `source='ci'` and `pr_id` null, and `GET /repos/:id/pulls` and `GET /pulls/:id/runs` are equal before and after ingest.

**AC-35 [server, client]** IF a GitHub call fails during Refresh, THEN the CI Runs page shall show
an inline error with GitHub's message while still listing earlier runs.
Verify: integration — a mocked 403 returns the error with the stored runs; unit — the client renders both.

**AC-36 [server]** WHEN listing CI runs, the system shall return only runs of the current
workspace's installations, at most 50, newest first.
Verify: integration — workspace B's runs are absent for workspace A, even when both imported the same `owner/name`.

### CI Runs page

**AC-37 [client]** WHERE CI runs exist, `/ci-runs` (sidebar item "CI Runs", icon `Workflow`) shall
render the header "CI Runs" / "Agent reviews executed inside CI · not local runs", a "Refresh"
button ("Refreshing…" while pending), and a table with columns Timestamp, Repository, Pull request
(#N + title as plain text, ellipsis on overflow), Agent, Source ("GitHub Actions"), Dur., Findings
(per-severity counts or "—"), Cost (`formatCost`), Verdict (blocked crit, passed ok, or "—"),
Status (Succeeded ok, Failed crit, Running accent, Rejected warn with the reason as title) and
"Job ↗" (new tab, `rel="noopener noreferrer"`).
Verify: unit — a fixture renders every column, the title `<img src=x onerror=alert(1)>` shows as literal text with no `img` element, and Refresh calls the endpoint.

**AC-38 [client]** WHERE the workspace has no CI runs, `/ci-runs` shall render the mock's
`EmptyState` (icon `Workflow`, title "No CI runs yet", body "Once you export an agent to CI, every
automated review shows up here.", CTA "Set up CI for an agent" to `/agents`;
`screen_cizruns.jsx:19-20`).
Verify: unit — an empty list renders the state and the CTA routes to `/agents`.

## Edge cases

- **EC-1** Two agents in one repo use separate manifests and workflows → AC-7, AC-22, AC-27.
- **EC-2** An agent renamed after export keeps its slug → AC-14; a slug collision is refused → AC-8.
- **EC-3** A fork PR fails closed → AC-24 and is stored as `failed` → AC-33.
- **EC-4** A same-repo PR edits the runner, manifest or skills: base copies run → AC-21 (the notice is deferred → Non-goal).
- **EC-5** A PR title with injected instructions → AC-28, AC-37.
- **EC-6** `OPENROUTER_API_KEY` not added: the runner hard-fails and the run is `failed` → AC-33.
- **EC-7** The studio token lacks a permission: GitHub's message is shown and the state kept → AC-16.
- **EC-8** `devdigest/ci` has an open PR, or survives a closed or merged PR, or the default branch is not `main` → AC-13.
- **EC-9** Double click on Install → AC-12.
- **EC-10** An OpenAI or Anthropic agent → AC-6.
- **EC-11** Workflow edited, then Configure changed → AC-10; an edit adding `pull_request_target` or `contents: write` → AC-11.
- **EC-12** A forged, oversized or mismatched artifact → AC-32.
- **EC-13** A run cancelled by a newer push or an artifact older than 90 days → `failed` → AC-26, AC-33.
- **EC-14** The PR that installs DevDigest runs its own workflow → AC-25.
- **EC-15** The same `owner/name` imported in two workspaces → AC-17, AC-36.
- **EC-16** GitHub down or rate-limited during Refresh → AC-35.
- **EC-17** `Fail CI on` changed after export: CI keeps the exported value until re-export → AC-5, AC-7.
- **EC-18** The runner bundle is not built in the studio → AC-16.
- **EC-19** A CI run's PR is also imported in the studio → AC-34.

## Non-functional requirements

**NFR-1 [client]** Every new UI string shall live under the `ci` namespace (`agents` for the tab
label), with the unused older keys (`publishDialog.*`, `exportWizard.blockMerge*`) removed.
Verify: unit — the wizard, CI tab and CI Runs page rendered with the real `en` messages show no raw `ci.` or `agents.` key.

**NFR-2 [client]** New UI shall be composed of the vendored `client/src/vendor/ui` primitives
(`Modal`, `ExportWizardSteps`, `Chip`, `Badge`, `FormField`, `EmptyState`, `Button`, `MonoLink`)
with colors only from the design CSS variables, matching the five screenshots and the artboards
`export`, `ci-runs`, `e-ci`, `agent-ci`.
Verify: manual — side-by-side comparison with the screenshots (no automated pixel check exists); unit — no `#hex` or `rgb(` literal in the new components.

**NFR-3 [server, client, agent-runner]** The value of `OPENROUTER_API_KEY` or `GITHUB_TOKEN` shall
never appear in a studio request, response, DB row or log, nor in the runner's stdout, stderr,
artifact or posted body.
Verify: unit — CI schemas have no secret-value field and a runner run with sentinel secrets (success and hard-fail) finds neither sentinel in its output; integration — export plus ingest leaves no sentinel in DB rows or the server log.

## Module interactions

Boundaries: client ↔ api (new CI endpoints), api ↔ GitHub REST (export, ingest, PR titles), and
GitHub Actions ↔ runner ↔ OpenRouter ↔ GitHub inside the target repo. CI never calls the studio.

```mermaid
sequenceDiagram
  participant client
  participant api
  participant GitHub
  client->>api: POST preview with repo_id, triggers, post_as
  api-->>client: files
  client->>api: POST export-ci with action and edited workflow
  api->>GitHub: GET repo for default branch
  api->>GitHub: find open PR with head devdigest/ci
  alt open PR exists
    api->>GitHub: commit files on devdigest/ci
  else none
    api->>GitHub: recreate devdigest/ci from default head and commit
    api->>GitHub: open PR Add DevDigest CI review
  end
  api-->>client: installation and pr_url
```

```mermaid
sequenceDiagram
  participant GitHub
  participant runner as Actions runner
  participant OpenRouter
  GitHub->>runner: pull_request event
  alt fork PR
    runner-->>GitHub: job fails with fixed message, no secrets
  else runner missing on base
    runner-->>GitHub: job passes, review skipped
  else same-repo PR
    runner->>GitHub: GET PR diff via API
    runner->>OpenRouter: review wrapped diff and description
    OpenRouter-->>runner: findings
    runner->>GitHub: post unless post_as none
    runner-->>GitHub: exit 1 if gate triggered, upload artifact
  end
```

```mermaid
sequenceDiagram
  participant client
  participant api
  participant GitHub
  client->>api: POST ci refresh
  loop each installation of the workspace
    api->>GitHub: list runs, download devdigest-result, GET PR title
    api->>api: size cap, strict parse, identity check, store ci run
  end
  api-->>client: counts and per-repo errors
```

Failures: GitHub error or missing bundle on export → AC-16, invalid edit → AC-11, wrong provider →
AC-6, slug collision → AC-8, runner hard-fail (no artifact) → AC-33, bad artifact → AC-32,
Refresh error → AC-35.

**Contracts** (proposed unless noted; snake_case; every id workspace-checked per AC-17):

| Boundary | Request | Response | Errors |
|---|---|---|---|
| `POST /agents/:id/ci/preview` | `repo_id`, `triggers` (must include `synchronize`), `post_as` (`github_review\|pr_comment\|none`) — all required | `{ files: [{ path, contents: string\|null, editable, size_bytes }] }` | 404, 409 `slug_conflict` {`path`}, 422 `provider_not_supported`, 500 `runner_bundle_missing`, 502 `github_error` {`status`, `message`} |
| `POST /agents/:id/export-ci` (existing path; `CiExportInput` changed, `eval-ci.ts:455-463`) | `repo_id` (replaces `repo`/`base`), `target: gha`, `action: open_pr\|zip`, `triggers`, `post_as`, optional `workflow_contents` | `{ installation, pr_url }`, or `application/zip` | as preview, plus 422 `workflow_invalid` {`reason`} |
| `GET /agents/:id/ci/installations` | — | `{ installations }`; `CiInstallation` (`eval-ci.ts:469-475`) gains `repo_id`, `workflow_path`, `agent_slug`, `generator_version`, `agent_version`, `triggers`, `post_as`, `pr_url`, `last_run` {`status`, `ran_at`}\|null | 404 |
| `POST /ci/refresh` | — | `{ ingested, rejected, failed, running, errors: [{ repo, status, message }] }` | — |
| `GET /ci/runs?agent_id=` | optional `agent_id` | `{ runs }` ≤ 50, newest first; `CiRun` (replaces `eval-ci.ts:490-502`): `id`, `repo`, `pr_number`, `pr_title\|null`, `agent_id\|null`, `agent_name`, `commit_sha`, `status` (`running\|succeeded\|failed\|rejected`), `reason\|null`, `verdict` (`blocked\|passed\|null`), `critical`, `warning`, `suggestion`, `cost_usd`, `duration_ms` (nullable), `job_url`, `ran_at` | 404 |
| `devdigest-result.json` (`CiResultArtifact`, `eval-ci.ts:509-519`) | strict, ≤ 64 KB; adds `repository`, `repository_id`, `commit_sha`, `run_id`, `run_attempt`, `agent_slug`, `agent_version`, `ci_fail_on`, `gate_triggered`, `blockers`; `pr_number` required | — | — |
| `AgentManifest` (`eval-ci.ts:433-449`) | adds `agent_version` | — | — |
| Runner env | adds required `DEVDIGEST_MANIFEST`; existing `DEVDIGEST_POST_AS`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER` (`agent-runner/README.md:89-98`) | — | — |

Studio token needs (researcher, docs.github.com fine-grained permissions table): export needs
Contents write, Workflows write and Pull requests write (classic `repo` + `workflow`); ingest needs
Actions read; repo metadata needs Metadata read.

## Inputs and provenance

| Input | Source | Freshness | Trusted |
|---|---|---|---|
| Agent config, version, `ci_fail_on` | DB, user | at preview | yes |
| Linked enabled skills | DB; manual/extracted or imported/community | at preview | manual yes, imported **no** |
| Workspace repos | DB, user import | at Step 1 | yes |
| Default branch, repo id | GitHub `GET /repos` | at install | yes |
| Runner bundle | studio's `agent-runner` build | at preview | yes |
| Edited workflow | user in wizard | at install | validated (AC-11) |
| PR diff, title, body, branch names | GitHub, in CI | per run | **no** |
| LLM findings | OpenRouter | per run | **no** (grounded) |
| Run metadata (repo id, SHA, PR, run id, attempt, URL, conclusion) | GitHub Actions API | at Refresh | yes |
| `devdigest-result.json` | GitHub artifact written by the runner | at Refresh | **no** |
| PR title for CI Runs | GitHub pulls API | at ingest | **no** |
| `OPENROUTER_API_KEY` | repo Actions secrets | CI runtime | secret, never leaves CI |

## Untrusted inputs

| Untrusted input | Required handling | AC / NFR |
|---|---|---|
| PR diff, title, body, branch names | never in a `run:` script, never in the trusted task slot, PR code never executed, forks fail closed | AC-23, AC-28, AC-21, AC-24 |
| LLM findings | grounded, deterministic gate (`agent-runner/src/run.ts:130-138`) | AC-29 |
| Artifact | 64 KB cap, strict parse, identity checked against GitHub, workspace-confined | AC-31, AC-32, AC-36 |
| PR title on screen | from GitHub, rendered as text | AC-31, AC-37 |
| Edited workflow | validated before commit | AC-11 |
| Imported/community skills | **deferred, known risk:** the studio wraps them (server `INSIGHTS.md:53`) but the runner passes them raw (`agent-runner/src/skills.ts:17-26`), so in CI their body acts as trusted prompt text | Deferred |
| Secrets | never handled by the studio, never printed by the runner | NFR-3 |
| Ids (tenancy) | installations inherit the workspace through the agent (`server/src/db/schema/ci.ts:4-12`) | AC-17, AC-36 |

## Design review

Provenance: **explicit** = chosen by the user; **default** = Pass-1 default the user accepted;
**MVP** = cut to *Deferred* by the minimal-first direction.

| # | Finding (evidence) | Decision | Destination |
|---|---|---|---|
| 1 | Studio local, CI cannot reach it | explicit — pull, identity from GitHub | AC-30..AC-32 |
| 2 | Only a GHA generator exists (`screen_export.jsx:3-8`) | explicit — GHA only | AC-5, Non-goal |
| 3 | A skipped job passes required checks (researcher, docs troubleshooting-required-status-checks) | explicit — fork fail-closed | AC-24 |
| 4 | Runner allows one manifest per repo (`agent-runner/src/manifest.ts:40-44`) | explicit — per-agent workflow + manifest path | AC-7, AC-22, AC-27 |
| 5 | Slug on rename / collision (OQ-1) | explicit — stored at first export, collisions refused | AC-7, AC-8, AC-14 |
| 6 | Job name unique across workflows (OQ-2) | explicit — `DevDigest Review (<agent-slug>)` | AC-26 |
| 7 | Installing PR has no base runner (OQ-3) | explicit — pass with log line | AC-25 |
| 8 | No repo picker (`screen_export.jsx:100`, `ci.json:57-59`) | default | AC-5 |
| 9 | Runner missing from the file list; "editable" scope (`screen_export.jsx:69`) | default — runner read-only, workflow only editable | AC-7, AC-9 |
| 10 | Edits lost on Configure change | MVP — regenerate + line | AC-10 |
| 11 | Secret status (`screen_export.jsx:78`) | MVP — static table | AC-10 |
| 12 | Provider ≠ OpenRouter (`agent-runner/src/index.ts:39`) | default — refuse | AC-6 |
| 13 | `synchronize` off leaves the required check pending | default — locked | AC-10 |
| 14 | `none` needs no PR write | default | AC-19 |
| 15 | `repos.default_branch` unreliable (server `INSIGHTS.md:30`); branch reuse (`octokit.ts:279-336`) | default | AC-13 |
| 16 | Install errors | MVP — GitHub's message + docs link | AC-16 |
| 17 | CI tab states and Fail CI on (`screen_agents.jsx:117-133`, `ConfigTab.tsx:111-115`) | default + MVP | AC-1..AC-3 |
| 18 | Mock `OPENAI_API_KEY`, GitHub App toggle, `review-action@v1` | screenshot / requirement wins | AC-10, AC-22, NFR-1, Non-goals |
| 19 | CI Runs lacks repo, verdict, job link (`screen_cizruns.jsx:37,51`) | P1 accepted | AC-37 |
| 20 | Artifact has no identity fields (`eval-ci.ts:509-519`) | brief rule 6 | AC-29, AC-32 |
| 21 | CI run with `pr_id` changes the PR feed (researcher, `run.repo.ts:40-70`, `pulls/routes.ts:163-173`) | default — never link | AC-34 |
| 22 | PR title in task slot (`agent-runner/src/run.ts:126`, server `INSIGHTS.md:74`) | default | AC-28 |
| 23 | Merge-commit checkout runs PR code (researcher, securitylab pwn requests) | default — base SHA | AC-21 |
| 24 | P4 hardening (pins, concurrency, artifact, ubuntu-latest) | accepted | AC-20, AC-26 |
| 25 | P6 zip wording; help-link target not drawn | accepted; derived link | AC-12, AC-15 |
| 26 | Runner bundle absent here (`.gitignore:3-6` vs `agent-runner/.gitignore`) | default — clear error | AC-16 |
| 27 | Older `ci.json` keys (`ci.json:70-71,77-102`) | default — remove | NFR-1 |
| 28 | Lifecycle states, Out of date, remove, warnings, notice, cancelled, filters, checklist, a11y extras, error mapping, skill wrapping, Stats | MVP / default | Deferred, Non-goals |

## Traceability

| AC / NFR | From | Packages | Verify |
|---|---|---|---|
| AC-1 | US-8, DR-17 | client, server | integration, unit |
| AC-2 | US-8, DR-17 | client | unit |
| AC-3 | US-8, DR-17 | client | unit |
| AC-4 | US-1 | client | unit |
| AC-5 | US-1, DR-2, DR-8, EC-17 | client, server | unit |
| AC-6 | EC-10, DR-12 | server, client | integration, unit |
| AC-7 | US-2, US-9, EC-1, DR-4, DR-9 | server | integration |
| AC-8 | US-9, EC-2, DR-5 | server | integration |
| AC-9 | US-2, DR-9 | client | unit |
| AC-10 | US-3, EC-11, DR-10, DR-11, DR-13 | client | unit |
| AC-11 | US-5, EC-11 | server | unit |
| AC-12 | US-4, EC-9, DR-25 | client | unit |
| AC-13 | US-4, EC-8, DR-15 | server | integration |
| AC-14 | US-8, EC-2, DR-5 | server | integration |
| AC-15 | US-4, DR-25 | server | integration |
| AC-16 | EC-7, EC-18, DR-16, DR-26 | server, client | integration, unit |
| AC-17 | US-5, EC-15 | server | integration |
| AC-18 | US-3, US-5 | server | unit |
| AC-19 | US-5, DR-14 | server | unit |
| AC-20 | US-5, DR-24 | server | unit |
| AC-21 | US-5, EC-4, DR-23 | server | unit |
| AC-22 | US-5, US-9, EC-1 | server | unit |
| AC-23 | US-5, EC-5 | server | unit |
| AC-24 | US-5, EC-3, DR-3 | server | unit |
| AC-25 | EC-14, DR-7 | server | unit |
| AC-26 | US-6, EC-13, DR-6, DR-24 | server | unit |
| AC-27 | US-9, EC-1, DR-4 | agent-runner | unit |
| AC-28 | US-5, EC-5, DR-22 | agent-runner | unit |
| AC-29 | US-7, DR-20 | agent-runner | unit |
| AC-30 | US-7, DR-1 | server | integration |
| AC-31 | US-7, EC-12, DR-1 | server | integration |
| AC-32 | US-5, EC-12, DR-20 | server | integration |
| AC-33 | US-6, US-7, EC-3, EC-6, EC-13 | server | integration |
| AC-34 | US-7, EC-19, DR-21 | server | integration |
| AC-35 | US-7, EC-16 | server, client | integration, unit |
| AC-36 | US-7, EC-15 | server | integration |
| AC-37 | US-7, EC-5, DR-19 | client | unit |
| AC-38 | US-7 | client | unit |
| NFR-1 | DR-18, DR-27 | client | unit |
| NFR-2 | US-1, US-7, US-8 | client | manual, unit |
| NFR-3 | US-5 | server, client, agent-runner | unit, integration |

(DR-N = row N of *Design review*.)

## Open questions

None blocking. OQ-1, OQ-2 and OQ-3 were answered by the user (Design review rows 5–7); every item
under *Deferred* is postponed by the user and blocks no AC.
