---
name: workflow-retro
description: "Retrospective of a finished multi-agent run (spec-creator, /implement, a Workflow script, any session that dispatched subagents): how many agents ran and in what order, token spend, what each agent found hard or easy, what was duplicated, missed or lost — plus concrete proposals. Output goes to chat and one append-only entry in docs/retro/ledger.md, module insights included. Source: this conversation's context by default; `deep` parses the session transcripts. Manual only — run it as /workflow-retro, never automatically."
argument-hint: "[deep] [--since <ISO>] [--until <ISO>] [--session <id>]"
disable-model-invocation: true
---

# /workflow-retro — analysis and proposals for a finished multi-agent run

**Manual only.** Runs when the user types `/workflow-retro`. Never start it yourself: not at
the end of a workflow, not from a hook, not as a "helpful" follow-up. You may *mention* that
it exists when a multi-agent run finishes, nothing more.

It produces two things and nothing else:
1. **Chat** — a short summary plus the proposals (step 6).
2. **Ledger** — one entry appended to `docs/retro/ledger.md` (step 5), which is also where
   **module insights** go. The retro never writes a package `INSIGHTS.md` and never edits an
   agent, skill, spec or plan — it *proposes*; the user decides.

## Data source — pick the mode from the arguments

| Mode | When | What it sees |
|---|---|---|
| **in-context** (default) | `/workflow-retro` | What this conversation already holds: the dispatches you made and their order, each `Agent` result's `<usage>` (`subagent_tokens`, `tool_uses`, `duration_ms`), every hand-back text, resumes (`SendMessage`), `AskUserQuestion` rounds. Costs no extra reading. |
| **deep** | `/workflow-retro deep` | Everything above **plus** the session transcripts via `scripts/collect-run.mjs`: nested agents (depth 2, e.g. a `researcher` dispatched by `spec-creator`), per-agent fresh vs cached tokens, peak context, tool mix and errors, files read by several agents, results that never reached their caller, forced hand-backs, the main session's own tokens. |

In-context rules:
- Every number is quoted from a `<usage>` block or a hand-back. Never estimate, never
  reconstruct from memory.
- What the context cannot show is written as **"not visible in-context"**, never guessed:
  nested agents, the main session's own spend, duplicated reads, lost results.
- **Recommend `deep`** (in chat, one line) when a hand-back mentions subagents it dispatched,
  research that "did not return", a report that looks incomplete, or when the user cares
  about exact cost.

Deep mode:

```bash
node .claude/skills/workflow-retro/scripts/collect-run.mjs [--since <ISO>] [--until <ISO>] [--session <id>] \
  --out "<scratchpad>/workflow-retro"
```

`--session` defaults to `$CLAUDE_CODE_SESSION_ID`. `--since`/`--until` (ISO, UTC — transcript
timestamps are UTC) cut one workflow out of a longer session. Read `retro-data.md` first,
then every file in `briefs/` and `handbacks/`. Transcripts live in
`~/.claude/projects/<cwd-slug>/<session>.jsonl` and `<session>/subagents/agent-<id>.{jsonl,meta.json}`
(all depths in one flat folder); the collector only reads them.

## Workflow

```
- [ ] 1. Delimit the run and pick the mode
- [ ] 2. Gather the evidence (in-context or deep)
- [ ] 3. Analyse each agent
- [ ] 4. Analyse the workflow and write proposals
- [ ] 5. Append the ledger entry
- [ ] 6. Report in chat
```

### 3. Analyse each agent

Five questions per subagent, each answered with evidence — a number, a short quote from its
brief or hand-back, or `file:line`:

| Question | Evidence |
|---|---|
| **Hard** — what slowed it or went wrong? | tool errors, forced hand-back, repeated reads, long duration for few calls, "not established" / "could not confirm" in the hand-back, a question bounced to the caller |
| **Easy** — what went cleanly, and why? | few calls for the outcome; a brief that pre-supplied facts (quotes, `file:line`) |
| **Duplicated** — what did it redo? | facts its brief already held; the same fact in two hand-backs; (deep) files read by several agents |
| **Missed / lost** — what was not delivered? | each numbered ask in the brief vs the hand-back; (deep) `result-not-delivered`, `late-background-result` |
| **Brief quality** — was it set up to succeed? | missing scope or output shape; facts the caller had but did not pass; stale facts passed as current |

An agent that read 40 files is not "thorough" unless those reads show up in its answer.

### 4. Analyse the workflow and write proposals

Workflow: launch order and parallelism (what was serialized for no reason), waste (tokens on
unused results), rework (resumes, fix rounds), human-in-the-loop (questions asked, and
whether the answers changed the outcome). Compare cost by **fresh** tokens in deep mode —
totals are dominated by cheap cache reads. No USD unless the user gave a price list.

**Proposals are mandatory** — the retro is not only analytics. Write at least one, or state
"none" with the reason. Each proposal has:
- **Target** — one of: agent definition (`.claude/agents/<name>.md` § section), skill
  (`.claude/skills/<name>/…`), brief/orchestration habit, spec/plan, tooling or this skill
  itself.
- **Evidence** — the finding it fixes.
- **Expected effect** — tokens saved, a loss prevented, a step removed.
- **Status** — `proposed` (default). Write `applied` only if the user already applied it in
  this session; the retro itself never applies anything.

**Module insights** — non-obvious facts about a package (`server`, `client`,
`reviewer-core`, `e2e`, `mcp`) that the agents uncovered during the run: a gotcha, a stale
`INSIGHTS.md` entry, a code fact the spec or plan missed. Verify each in code (`file:line`)
before writing it, and group them by package. They go to the ledger, not to `INSIGHTS.md`.

### 5. Append the ledger entry

Write the entry to a scratch file, then append it with the script. Never use `Write` or
`Edit` on the ledger. The script is append-only, creates the file with its header on first
use, and skips a duplicate heading.

```bash
node .claude/skills/workflow-retro/scripts/append-ledger.mjs --entry "<scratchpad>/retro-entry.md"
```

Entry template (the heading format is enforced):

```markdown
## YYYY-MM-DD — <workflow, e.g. "SPEC-02 spec-creator (2 passes)">
Source: in-context | deep (session `<id>`, <since> → <until>) · Outcome: <one line>

| Agents | Order | Tokens | Duration | Resumes | User questions |
|---|---|---|---|---|---|
| <n> | <a → b ∥ c> | <total; deep: fresh / cached> | <wall> | <n> | <n> |

**Per agent**
- `<agent>` — Hard: … · Easy: … · Duplicated: … · Missed/lost: … · Brief: …

**Findings**
- <workflow-level findings, with numbers>

**Proposals**
| # | Proposal | Target | Evidence | Expected effect | Status |
|---|---|---|---|---|---|

**Module insights**
- **server** — <fact> (`file:line`)
- **client** — …

**Not visible** (in-context only): <what deep mode would add>
```

Keep quotes from briefs and hand-backs to a line or two — the ledger is committed, and a
brief can carry the user's own words.

### 6. Report in chat

At most ten lines:
- outcome;
- agents and their order;
- tokens;
- the top 1–3 problems;
- the proposals as a numbered list (proposal → target);
- the ledger path;
- for an in-context run, a one-line pointer to `deep` if it would add something.

## Known limits of the collector (deep)

- Reads through `Bash` (`cat`/`sed`/`head`…) are detected heuristically. `Read` calls are exact.
- Token usage is de-duplicated per API message (`message.id`), because streamed blocks repeat it.
- `result-not-delivered` means the child's completion notice never appears in the parent's
  transcript. Before calling the work wasted, check whether the parent's hand-back used those
  facts anyway.
- It has not been verified whether agents launched by a `Workflow` script land in the same
  `subagents/` folder. If they are missing from `retro-data.md`, say so instead of reporting a
  smaller run.
