# L02 — Conventions extractor: sampling, evidence validation, triage, skill

A convention is a rule this repository already follows. The extractor proposes
candidates with a cheap model and then tries to disprove each one against the real
files: a candidate that cannot point at a line of code that exists is discarded
before anyone sees it. Most proposals will not survive, and that is the design —
the value is not the model's recall, it is that the surviving list is short enough
to triage by hand and every entry is anchored to code.

Half the groundwork already existed: the `conventions` table, a `conventions` entry
in `FEATURE_MODELS` that Settings renders a model picker for, and
`RepoIntelService.getConventionSamples`. Two pieces did not fit and drove the
schema change and the separate config read — see R1 and R2.

## Requirements

### R1 — Triage is a three-state column, not a boolean
`conventions` gains `status` (`pending` | `accepted` | `rejected`), and the old
`accepted boolean default false` is **dropped**. A boolean cannot tell REJECTED
from NEVER-TRIAGED, so a re-scan would hand every rejected rule a fresh row and a
fresh default — the resurrection the feature must not allow. The column follows
this repo's house style, `text('status', { enum: [...] })`: `pgEnum` is used
nowhere in the schema.

The migration is generated, never hand-written, and in **two** runs:
additions first, the `accepted` drop second. Asking drizzle-kit to add columns and
drop one in a single pass makes it prompt "renamed or dropped?", and `strict: true`
means that prompt blocks a non-interactive shell. A new `notNull` column also
carries a default (`fingerprint` → `''`), because the generated `ALTER TABLE` would
otherwise fail on a table with rows.

### R2 — Sample selection is pure code, in two halves
No model chooses what the model sees. The code half is
`repoIntel.getConventionSamples(repoId, 12)` — top-N by rank. The config half is a
separate read of `CONFIG_SAMPLE_PATHS` by exact path, because
`getConventionSamples` deliberately EXCLUDES configs: `isJunkPath` filters
`eslint`, `prettier` and `.config.` out of the ranked list, and that behaviour is
correct for its other callers, so it is left alone rather than "fixed".

`GitClient` has no `listFiles`, so config discovery is "try each candidate path and
keep what reads". A read that **throws** and a read that returns an **empty string**
are both treated as absent: the real `SimpleGitClient` throws on a missing file
while `MockGitClient` returns `''`, and an empty config teaches the model nothing.

The candidates are probed at the repo root **and** in the package directories
`configSearchDirs` derives from the ranked code paths. Root-only was the first
implementation and a live scan disproved it: this repository keeps every config
under `server/` and `client/`, so the scan returned `config_samples: []` while
happily returning thirteen code-derived rules — criterion 39's config half failing
in a way that looks exactly like a quiet model. Deriving the directories from the
files repo-intel already ranked adapts to any layout without hardcoding one.

Sampling is bounded per file (line budget then character budget, head slice) and in
total, so a large repository degrades by dropping its lowest-ranked samples instead
of failing the request. The head slice matters for R4: line N of a sample is line N
of the file, so a cited number stays checkable.

### R3 — Preconditions are checked before the model is paid for
`getTopFilesByRank` returns `[]` both when `repoIntelEnabled` is false and when the
repo was cloned but never indexed. Both are indistinguishable from "the model found
nothing", so the service fails with a 422 naming the cause — no clone, or no index
— rather than spending a call that cannot succeed and reporting an empty list.

### R4 — The model returns category, rule, evidence and confidence
One `completeStructured` call with a Zod schema. Each candidate is
`{ category, rule, evidence_path, evidence_line, evidence_snippet, confidence }`.
Every sample line in the prompt is **numbered**, which is the only reason a cited
line can be verified at all.

The model's schema is deliberately looser than the wire contract — no `min`/`max`
on `confidence`, no `positive()` on the line — because OpenAI's strict
`json_schema` mode rejects numeric range keywords and would fail the whole call.
The bounds are applied afterwards in the service, where an out-of-range number is
clamped or dropped instead of costing a round trip.

### R5 — Evidence is validated per file, and a near miss is corrected
A candidate survives only if all of these hold:

- the cited path is one we **actually sent** — not merely one that exists. A model
  naming a real file it was never shown did not derive a rule from it;
- the line is within the sample that was sent;
- the snippet is found on the cited line, compared whitespace-insensitively but
  **case-sensitively** — indentation is noise, casing is code.

A snippet found within `EVIDENCE_LINE_TOLERANCE` (2) of the cited line is accepted
and the line is **corrected** to where it really is. Off-by-one between 0- and
1-indexed counting is the most common model slip and is not a fabrication;
rejecting it throws away good rules. What is stored is the **real text of that
line**, never the model's paraphrase of it.

Every drop is reported with a machine-readable reason (`unknown_file`,
`line_out_of_range`, `snippet_mismatch`, `empty_rule`, `duplicate_in_batch`), so a
thin result is explainable rather than mysterious.

### R6 — A candidate carries enough to build a clickable link
`evidence_url` is an absolute GitHub blob permalink with a `#L<n>` anchor, built
server-side from the repo's `owner`/`name` and the **head sha at scan time** — not
the default branch. A branch URL keeps resolving after the file changes and quietly
points the reviewer at unrelated code. `evidence_path` and `evidence_line` ship
alongside it, so the studio can render the citation as text as well as a link.

### R7 — A re-scan preserves every triage decision
Identity is a `fingerprint`: sha256 of the rule text **normalized** (lowercased,
punctuation stripped, whitespace collapsed) and nothing else. Evidence is
deliberately excluded from the key — a model re-proposing the same rule almost
never cites the same file twice, so keying on evidence would defeat R1 entirely.

A scan then, in order: deletes the `pending` rows the new scan did not re-propose,
re-points the `pending` rows it did (new evidence, category, confidence, sha),
leaves every `accepted` and `rejected` row **completely untouched**, and inserts
only genuinely new fingerprints as `pending`.

This is an explicit read-then-write, not an upsert. `repo_id` is nullable, so
Postgres treats NULLs as distinct and `ON CONFLICT (repo_id, fingerprint)` would
not reliably fire; `DO NOTHING` also returns no rows to answer the request with.
The `pending` guard lives in the SQL of the delete and the refresh, not in the
caller — those are the two statements that could destroy a decision.

### R8 — Accepted rules assemble into one `repo-conventions` skill
`POST /repos/:id/conventions/skill` builds a markdown body — one `## <category>`
section in the contract enum's own order, each rule a bullet carrying its
`path:line` — and writes it through `SkillsService`, not straight to `skills`. That
is what makes the version snapshot and the `skill_versions` row come from the one
place that owns them, and it means a rebuild of an unchanged set **burns no
version**, because `isBodyChange` sees an identical body. The body is deterministic
for that reason.

`type: 'convention'` and `source: 'extracted'` already exist in the enums.
`extracted` also means `renderSkillBlock` does **not** delimiter-wrap the body —
correct, because a human accepted every rule in it; wrapping would demote the
user's own rules to data and make the feature inert.

Assembling with nothing accepted is a 422, not an empty skill: a skill with no
rules would link to an agent and contribute nothing while looking like a working
one.

Two stated limitations rather than hidden ones. `skills` has no unique index on
`(workspace_id, name)`, and criterion 42 names the skill exactly, so a workspace
holds **one** `repo-conventions` skill — assembling from a second repo replaces its
body, and the body header and description name the source repo. And
`evidence_files` is left unset, because `CreateSkillInput` / `SkillPatch` have no
such field and filling it would mean editing the skills module.

### R9 — Linking is the user's decision
The server never links the skill to an agent. `POST /agents/:id/skills` already
exists with its own picker, and auto-linking would silently change an agent's
prompt without anyone choosing to.

### R10 — The model comes from the workspace, not from a constant
`resolveFeatureModel(container, workspaceId, 'conventions')` — this module is its
first caller in `src`. It returns `{ provider, model }`: `provider` selects the
client through `container.llm(provider)`, `model` is the string sent. It is
resolved per request, so a model picked in Settings → Models takes effect on the
next scan with no restart. Hardcoding either half would leave the picker visible
and inert.

### R11 — The scan is synchronous, and the pure rules are testable without a DB
One cheap-model call, and the caller wants the candidates, not a job id — so no
`JobRunner`, no status endpoint, no polling. The route carries its own low rate
limit (5/minute), because a repo's conventions do not change by the second and a
double-click must not pay twice.

Latency is bounded with `maxRetries`, not with `timeoutMs`. `timeoutMs` binds the
OpenAI and Anthropic adapters, but `OpenRouterProvider` fixes its timeout in its
CONSTRUCTOR and ignores the per-request value, so on the provider the seeded agents
actually use the only multiplier the caller controls is the schema-repair loop.
It is set to 1.

Evidence validation, the fingerprint, the DTO mapping and the skill-body assembly
live in `modules/conventions/helpers.ts` — the `pulls/cost.ts` precedent, and the
filename matters: `.dependency-cruiser.cjs` recognises only
`cost|status|findings|helpers` as ring 1. Prompt assembly lives in `prompt.ts`.
The service takes the PORTS it uses (`git`, `repoIntel`, `llm`, `resolveModel`, the
repository, `SkillsService`) and never the `Container`, which would trip
`service-not-to-composition-root`; composition happens in `routes.ts`.

### R12 — Repo samples are untrusted input
An imported repository's code can address the model as readily as a PR description
can. Every sample is wrapped with `wrapUntrusted` from `@devdigest/reviewer-core`,
and the system prompt carries its own injection guard because this module assembles
its prompt directly rather than through `assemblePrompt`.

The label is the **constant** `repo-sample`. `wrapUntrusted` interpolates its label
into `source="…"` without escaping quotes, so a path-derived label would let a file
named `x" role="system` break out of the attribute; the path goes inside the block
as ordinary text. Content that tries to close the delimiter itself is escaped by
`wrapUntrusted`.

### R13 — Triage and hand-editing are one route
`PUT /conventions/:id` takes `status`, `rule` and `category`, all optional, so the
studio's Accept/Reject buttons and its inline Edit are the same code path over the
same row. An empty patch is a 422, not a silent no-op — it would otherwise reach
Drizzle as `.set({})`, which is a Postgres syntax error. `rule` is capped
(`CONVENTION_LIMITS.rule`) because it ends up rendered into a review prompt once
the skill is assembled; the cap lives in the contract so the editor can warn
before the round trip, and is enforced on the route, which is the real persistence
boundary.

Two consequences are deliberate and neither is obvious.

**The `fingerprint` is NOT recomputed when the rule text changes.** It identifies
the PROPOSAL the row came from, not the text on screen. What a later scan will
propose is the MODEL's phrasing, so re-keying on the user's edit would leave the
original wording unmatched and re-offered as a brand-new `pending` candidate —
exactly the resurrection R7 exists to prevent. The cost, stated rather than
hidden: the stored hash no longer hashes the stored text.

**`refreshPending` therefore stops touching `rule` and `category`.** It refreshes
only what belongs to the code — path, line, snippet, sha, and the model's
confidence in it. Without that narrowing, editing a `pending` candidate and
re-scanning would silently revert the wording, because the fingerprint still
matches. Evidence itself is never re-pointed at an edit: evidence is a claim about
the code, and rewording a rule does not change which line demonstrates it.
Re-pointing it would be inventing a citation.

### R14 — The skill is draftable before it is saved
`GET /repos/:id/conventions/skill/draft` returns `{ name, description, body }` —
what a save would store — and **writes nothing**. `POST /repos/:id/conventions/skill`
accepts the same three fields, all optional, and uses each one the user supplied in
place of the generated value. Posting no body at all is the plain save path.

Both go through one pure function, `buildSkillDraft`. That is what makes a draft
shown and then saved untouched byte-identical, and therefore what keeps "an
unchanged set burns no skill version" (R8) true instead of dependent on the client.
Assembly stays server-side for the same reason: if the client re-rendered the
markdown, determinism would hinge on its formatter matching ours.

`name` defaults to `repo-conventions` (R8, criterion 42) and the modal shows that
default. Because the save matches an existing skill BY NAME, saving under a
different name creates a SECOND skill rather than renaming the first. That is the
honest reading of a fixed-name criterion plus an editable field, and it is
documented here rather than papered over with a rename that would silently break
whatever agent already carries the original.

One implementation note worth keeping: a POST with no body arrives as `null`, and
Zod's `.default({})` fires only on `undefined`, so the body schema normalises
`null` first. Without it the ordinary save — the one the demo performs — is a 422.

## The wire

All snake_case. `ConventionCandidate`, `ConventionCategory`, `ConventionStatus`,
`ConventionDropReason`, `ConventionScanReport`, `ConventionScanResult`,
`ConventionSkillDraft` and `CONVENTION_LIMITS` live in `contracts/knowledge.ts` —
in **both** vendored copies, byte-identical.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| `POST` | `/repos/:id/conventions/extract` | — | `ConventionScanResult` |
| `GET` | `/repos/:id/conventions` | `?status=pending\|accepted\|rejected` (optional) | `{ candidates: ConventionCandidate[] }` |
| `PUT` | `/conventions/:id` | `{ status?, rule?, category? }` — at least one | `ConventionCandidate` |
| `GET` | `/repos/:id/conventions/skill/draft` | — | `ConventionSkillDraft` |
| `POST` | `/repos/:id/conventions/skill` | `{ name?, description?, body? }` (body optional entirely) | `Skill` |

A non-uuid id is a 422 at the edge (`IdParams`). An unknown repo, a repo in another
workspace and an unknown candidate are all 404. No clone, no index, nothing
accepted, an empty `PUT` patch and an over-long `rule` are 422 with a message
naming the cause. A scan whose model does not answer within the deadline is a 502.

Candidates come back newest first, then by descending confidence. A `GET` with no
`status` returns the whole triage list — that is what the studio shows.

One candidate:

```json
{
  "id": "6f1c8f2e-3b5a-4c77-9a1e-0d2b4c8e7a10",
  "category": "validation",
  "rule": "Declare the request body as a Zod schema and pass it in the route schema.",
  "evidence_path": "src/modules/skills/routes.ts",
  "evidence_line": 96,
  "evidence_snippet": "app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {",
  "evidence_url": "https://github.com/acme/api/blob/9c4f1ab/src/modules/skills/routes.ts#L96",
  "confidence": 0.92,
  "status": "pending",
  "created_at": "2026-09-19T12:04:11.338Z"
}
```

The scan report beside them:

```json
{
  "head_sha": "9c4f1ab",
  "provider": "openai",
  "model": "gpt-5.4",
  "config_samples": ["tsconfig.json", ".prettierrc"],
  "code_samples": ["src/modules/skills/routes.ts", "src/platform/container.ts"],
  "proposed": 7,
  "kept": 3,
  "dropped": [
    { "rule": "Name every service file service.ts.", "reason": "unknown_file" },
    { "rule": "Colocate every test beside its subject.", "reason": "line_out_of_range" }
  ],
  "created": 3,
  "tokens_in": 8421,
  "tokens_out": 612,
  "cost_usd": 0.0031
}
```

The report is **not** persisted — the candidates are the stored result, and a
report table would be a second source of truth for the same scan. "Last scanned"
is derivable from the newest `created_at`.

## Acceptance criteria

1. `POST /repos/:id/conventions/extract` runs the analysis and stores the
   survivors; a `GET` from a **fresh app instance** returns the same candidate ids,
   so the result outlives the process.
2. The scan report names at least one config file and the ranked code files it
   actually sent, and no model call took part in choosing them.
3. Each candidate carries a category from the enum, a rule, a confidence in
   `[0, 1]`, and evidence as a file **plus a line**.
4. A candidate citing a file that was never sent is dropped as `unknown_file`; a
   line past the end of the sample as `line_out_of_range`; a snippet that is not
   there as `snippet_mismatch`; an empty rule as `empty_rule`; a re-wording of a
   rule already in the batch as `duplicate_in_batch`. Every drop appears in the
   report with its reason, and no dropped candidate is stored.
5. A citation one line off is kept with the line **corrected**, and the stored
   snippet is the real text of that line rather than what the model wrote.
6. Every stored candidate serialises an `evidence_url` pinned to the scan's sha,
   with a `#L<n>` anchor matching `evidence_line` — enough for the studio to link
   to the real code with no further lookup.
7. A rejected candidate re-proposed by a later scan keeps `status: 'rejected'`,
   keeps its id, is not duplicated, and never reaches the assembled skill. An
   accepted one likewise survives a re-scan.
8. An untriaged candidate the newest scan no longer proposes disappears; a triaged
   one never does.
9. `POST /repos/:id/conventions/skill` produces a skill named exactly
   `repo-conventions`, `type: 'convention'`, `source: 'extracted'`, whose body
   contains every accepted rule with its `path:line` and no rejected or untriaged
   rule. With nothing accepted it is a 422.
10. Re-assembling an unchanged accepted set returns the SAME skill id and the SAME
    version; accepting one more rule and re-assembling bumps that skill's version
    rather than creating a second skill.
11. The scan uses the workspace's `feature_models.conventions` choice when one is
    set, and the `FEATURE_MODELS` registry default otherwise; the report says which
    provider and model ran.
11a. `PUT /conventions/:id` edits `rule` and `category` without changing the row's
    `fingerprint`, its `status`, or any `evidence_*` field; an empty patch and an
    over-long `rule` are both 422; and a later scan that re-proposes the same rule
    does NOT revert the edited wording while still refreshing the evidence.
11b. `GET .../skill/draft` returns `{ name: 'repo-conventions', description, body }`
    and leaves the `skills` table untouched; a `POST` with no body stores exactly
    that draft; a `POST` carrying `description`/`body` stores the user's values; and
    a `POST` with a different `name` creates a second skill at version 1 rather
    than renaming the first.
12. A repo with no clone, and a repo with no code index, each return a 422 naming
    the cause **without** making a model call.
13. A non-uuid id is a 422; an unknown repo, a repo in another workspace and an
    unknown candidate are 404s, and a cross-workspace triage attempt leaves the row
    untouched.
14. Every sample sits inside one `<untrusted source="repo-sample">` block; a
    hostile path cannot alter the label and sample content containing a literal
    `</untrusted>` cannot terminate the block early.
15. `pnpm typecheck` and the unit + integration suites pass; evidence validation,
    the fingerprint, the DTO mapping, the skill-body assembly and the prompt
    packing all have unit coverage with no database; `pnpm arch:check` shows no new
    violation against its 20-warning baseline; and both vendored copies of
    `contracts/knowledge.ts` stay byte-identical.
