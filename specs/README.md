# specs — feature specifications (Spec Driven Development)

One specification per **feature**, across every package it touches. A spec answers
**what** is built and how we know it works; **how** it is built is the job of
`docs/plans/<slug>.plan.md` (`implementation-planner`), and what we learned building it goes
to the package `INSIGHTS.md`.

Written by the `spec-creator` agent (`.claude/agents/spec-creator.md`) in two passes: it first
analyses the request and the design and returns questions and proposals; the spec file is
written only after the user has answered them.

## Naming

`specs/SPEC-NN-<slug>.md` — `NN` is a repo-wide running number (the highest existing `SPEC-NN`
plus one, zero-padded to two digits), `<slug>` is kebab-case (`SPEC-03-skills-drawer.md`).
The number never changes and is never reused, even when a spec is superseded.

The older per-package specs (`client/specs/`, `server/specs/`, `reviewer-core/specs/`,
`L0N-<feature>.md`) are history of L01–L04. They are read, cited and superseded — never
extended. `e2e/specs/` holds browser flows, not specifications.

## Status lifecycle

`draft` → `approved` → `implemented`. A spec is `draft` until the user approves it. It becomes
`implemented` when `plan-verifier` reports every AC verified and the user confirms; `spec-creator`
then flips the status. Once
`approved`, its substance is not edited: a changed decision is a **new** spec whose
`Supersedes:` names the old one, and the old one gains only a `Superseded by:` header line.

## Template

```markdown
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft | approved | implemented
Supersedes: <link, if this spec replaces an earlier decision>

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Module interactions
## Inputs and provenance
## Untrusted inputs
## Design review
## Traceability
## Open questions
```

`Module interactions`, `Design review` and `Traceability` are this repo's additions to the
course template: the first holds cross-module requirements (who calls whom, with what data,
what happens when the other side fails), the second records every design gap and UX proposal
and what the user decided about it, the third is a matrix `AC / NFR → From (US / EC /
design review) → Packages → Verify` with one row per criterion.

Numbering inside a spec: `US-N` user stories, `AC-N` acceptance criteria, `EC-N` edge cases,
`NFR-N` non-functional requirements — no gaps, never reused.

## What a spec contains — and what it does not

| In the spec | In the plan (`docs/plans/`), not here |
|---|---|
| Workflow diagrams — user flow, feature states (Mermaid) | Files and modules to create |
| Service communication diagrams — client ↔ API ↔ reviewer-core ↔ LLM ↔ GitHub ↔ MCP | Function and class names |
| Contracts at a boundary — endpoint / event / MCP tool, wire fields, required vs optional, error cases | DB tables, columns, migrations |
| Acceptance criteria, edge cases, NFRs | Libraries, algorithms, order of work |

A contract says what crosses a boundary and what the caller may rely on. Once it says how the
other side produces it, it belongs in the plan.

## Acceptance criteria — EARS

EARS (Easy Approach to Requirements Syntax; Mavin et al., Rolls-Royce, IEEE RE'09). Specs are
written in **English**, with the standard EARS keywords in capitals — **WHEN, WHILE,
IF … THEN, WHERE** — and **shall** as the marker of a mandatory requirement.

| Pattern | Shape |
|---|---|
| Ubiquitous | The system shall log every authentication attempt. |
| Event-driven | WHEN the user submits the sign-in form, the system shall validate the credentials. |
| State-driven | WHILE a sync is in progress, the system shall display its progress. |
| Unwanted behavior | IF validation fails three times within 60 seconds, THEN the system shall temporarily lock the account. |
| Optional feature | WHERE MFA is enabled, the system shall require a TOTP code after the password. |

Each criterion is numbered `AC-N`, tagged with the package(s) it lands in
(`AC-3 [server, client]`), states one observable behaviour (exactly one **shall**), and ends
with a verification hint — the level and the observation, never the test file:

```markdown
**AC-3 [server]** IF the GitHub API returns 403 rate-limited, THEN the system shall mark the
run `failed` with reason `github_rate_limited`.
Verify: integration — the run row has status `failed` and that reason.
```

Levels: `unit` · `integration` (DB-backed `*.it.test.ts`) · `e2e` (browser flow in `e2e/`) ·
`manual` (only when nothing automated can observe it — say why). NFRs follow the same shape.

Vague wording is rewritten until it is checkable:

| Vague | Checkable |
|---|---|
| "Should work fine on large repositories" | WHEN a repository exceeds the indexing threshold, the system shall build the overview from deterministic facts only, without reading every file in full. |
| "Should not crash if the model is unavailable" | IF the structured model call fails, THEN the system shall show the deterministic overview together with the reason for the degradation. |
| "Should suggest where to start reading" | The system shall order the reading path by file rank in the import graph. |

## Design source

The design mock is unpacked to `docs/design/extracted/` (`INDEX.md` maps every artboard to
the file that renders it). Regenerate after the mock changes:

```bash
node scripts/extract-design.mjs
```

## Index

| Spec | Feature | Status | Packages | Supersedes |
|---|---|---|---|---|
| [SPEC-01](SPEC-01-project-context.md) | Project Context — repo markdown docs attached to agents and skills, injected into runs | approved | server, client, reviewer-core | none (reverses `client/specs/L02-skills.md` R3 tab order) |
