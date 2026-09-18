# Reviewer dispatch template

The orchestrator fills the placeholders and sends the result as the `prompt` to one
`pr-reviewer` subagent. Send every subagent in a **single message** so they run
concurrently.

The standing rules — severity, verdict, findings discipline, grounding, output shape —
live in `.claude/agents/pr-reviewer.md` and are already in the subagent's context. Do not
restate them here; this template only says *which* rules and *which* files.

---

## Template

```
Review this slice of the current change set against the `{{SKILL}}` rules.

## Your standard
Read `{{SKILL_PATH}}` in full first. It is the only standard you apply.
{{ALSO_READ_LINE}}

## Your diff
`{{PATCH_PATH}}`
It holds the complete diff for your files. New-side line numbers in it are what you cite.
Untracked new files appear at the end under `=== NEW UNTRACKED FILE: <path> ===` with every
line numbered — they have no hunks of their own, so treat every line as added.

## Your files ({{FILE_COUNT}})
{{FILE_LIST}}

Report on these files only. Anything else belongs to another reviewer.

## Do not report
{{SUPPRESS_BLOCK}}
- Pre-existing code you did not change. Only the added and changed lines are in scope.

Return one fenced json block, nothing else.
```

---

## Filling it

| Placeholder | Source |
|---|---|
| `{{SKILL}}` | `routes[].skill` |
| `{{SKILL_PATH}}` | `routes[].path` |
| `{{ALSO_READ_LINE}}` | when `routes[].also_read` is non-empty: `Also read: <paths>` — otherwise an empty line |
| `{{PATCH_PATH}}` | `.devdigest/cache/pr-self-review/diffs/<skill>[-<slice>].patch` |
| `{{FILE_COUNT}}` | `routes[].files.length` |
| `{{FILE_LIST}}` | one path per line, `- ` prefixed |
| `{{SUPPRESS_BLOCK}}` | `routes[].suppress` as a `- ` bullet when present; omit the line when null |

## Why the subagent reads its skill by path

It is told to `Read` the `SKILL.md`, never to invoke the `Skill` tool. Three reasons:

1. `next-best-practices` carries `user-invocable: false`. That stops a *human* typing
   `/next-best-practices`; reading the file is unaffected. Path-reading makes the fan-out
   uniform across all skills regardless of their frontmatter.
2. The Skill tool matches on description text. That is exactly the nondeterminism this
   design exists to remove — the same diff must produce the same reviewer set every run.
3. A subagent that reads its standard has it verbatim in context. One that hopes a tool
   loaded it does not, and the failure is silent.

## When `pr-reviewer` is not available

`.claude/agents/*.md` is read at session start, so in the session that first adds the agent
the type does not exist yet. Dispatch `Explore` instead (read-only) and paste the standing
rules from `.claude/agents/pr-reviewer.md` — severity, verdict, findings discipline,
grounding, output shape — above the template, because a generic agent does not carry them.
Note the fallback in the report: `Explore` has `Bash`, so the read-only guarantee is then
a prompt instruction rather than a tool restriction.

## Handling a bad response

1. Not a parseable JSON block ⇒ re-send once: *"Return only the fenced json block, no
   prose."*
2. Still unparseable ⇒ mark the run **INCOMPLETE** and name the skill in the report. It
   never silently becomes a PASS — a review that did not happen is not a review that found
   nothing.
