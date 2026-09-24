---
name: engineering-insights
description: Captures non-obvious engineering insights into the touched package's INSIGHTS.md (client, server, reviewer-core, e2e). Use during a session the moment you hit something a future agent would otherwise relearn — a gotcha, a working approach, a dead-end antipattern, a codebase convention, a tool/library quirk, a recurring error+fix, or an open question — and again at session end, on "wrap up" / "retro", or when /engineering-insights is invoked. Reads the existing file first, never duplicates, writes only substantial file-grounded entries, and appends via a script that cannot overwrite prior content.
---

# Engineering Insights

Capture durable engineering insights into the **INSIGHTS.md of the package the work
touched**, so the next session doesn't relearn them. Read what's already there, add only
what's new and substantial, never overwrite.

## Where to write (package routing)

| Work touched | File |
|---|---|
| client (`@devdigest/web`) | `client/INSIGHTS.md` |
| server (`@devdigest/api`, incl. repo-intel) | `server/INSIGHTS.md` |
| reviewer-core (`@devdigest/reviewer-core`) | `reviewer-core/INSIGHTS.md` |
| e2e (`@devdigest/e2e`) | `e2e/INSIGHTS.md` |
| spans several packages | write the part relevant to each, to each file |
| pure root config / CI only | usually not a package insight — skip it |

Never write insights into this SKILL.md itself.

## What counts (the 7 sections)

Each `INSIGHTS.md` has these fixed sections — every entry goes under exactly one:

- **What Works** — approaches and solutions that proved effective here.
- **What Doesn't Work** — failed approaches, dead ends, antipatterns. **Highest-value
  section and the one most often skipped — prioritize it.**
- **Codebase Patterns** — project conventions, architecture decisions, naming patterns.
- **Tool & Library Notes** — quirks and gotchas discovered about dependencies.
- **Recurring Errors & Fixes** — an error you'd hit again, plus its fix.
- **Session Notes** — brief dated summaries of what a session accomplished.
- **Open Questions** — what needs more investigation or was left unresolved.

## Concrete, not banal

The bar: **an entry must be specific enough that an agent reading it cold knows exactly
what to do or avoid, without re-investigating.** If it would be obvious to anyone reading
the code, don't write it.

| ❌ Noise | ✅ Useful cold |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out after 30 items — use `Promise.allSettled()` in batches of 10" |
| "use async/await carefully" | "context enrichment is best-effort: on unindexed/error, omit the section, never throw — `server/…:NN`" |

Ground every entry in evidence: `path/file.ts:NN`.

## Workflow

Copy this checklist and work through it:

```
- [ ] 1. Gate check — was this session substantial?
- [ ] 2. Read the touched package's INSIGHTS.md in full
- [ ] 3. Draft ≤5 candidates, ranked by signal
- [ ] 4. Dedup against what's already there
- [ ] 5. Append each survivor via the script
- [ ] 6. One-line summary
```

1. **Gate check.** Did the session produce something substantial — a problem solved, a
   decision made, a non-obvious discovery? Trivial edits don't qualify. If nothing
   qualifies → **write nothing** and say so. Skipping the *check* is never allowed;
   writing nothing is a valid outcome of it.
2. **Read first.** Read the touched package's `INSIGHTS.md` in full before drafting —
   even if it was already read earlier this session, since entries may have been appended
   since.
3. **Draft ≤5 candidates**, ranked by signal (user corrections and gotchas highest;
   nice-to-know patterns lowest). Each candidate = the proposed text + its target section
   + `file:line` evidence.
4. **Dedup.** Do not duplicate an entry already in the file — the same fact in different
   words still counts as covered. Never restate a recorded insight to "refresh" it. If
   reality now contradicts an entry, append a new dated note that supersedes it; leave the
   old one in place.
5. **Append via the script** (below). Automatic — no approval prompt.
6. **Summary.** One line: what was written, to which file, what was skipped and why.

## Appending (run exactly this)

Never edit an `INSIGHTS.md` by hand and **never use the `Write` tool on one** — `Write`
replaces the whole file and would destroy prior content. Append through the script, which
inserts one line into one section and rewrites nothing else:

```bash
node .claude/skills/engineering-insights/scripts/append-insight.mjs \
  --package server \
  --section "Codebase Patterns" \
  --text 'Concrete, actionable insight. Evidence: `server/src/x.ts:42`.'
```

`--date YYYY-MM-DD` is optional and defaults to today. Run it once per entry.

The script enforces the guarantees, so they can't be forgotten:

- **Append-only** — it splices one line under one heading; the header, preamble, section
  headings and every existing entry are preserved byte-for-byte.
- **Verified before writing** — if the resulting file would drop any existing line, it
  refuses and leaves the file untouched.
- **Idempotent** — a candidate that duplicates an existing entry anywhere in the file
  exits as `SKIPPED (duplicate)` and writes nothing.
- **Validated** — an unknown package or section name is rejected with the valid list.

Read its output: `APPENDED` means written, `SKIPPED` means the insight was already there
(not a failure), `ERROR` means nothing was written and the file is unchanged.

## Rebuilding the index (run after every append)

```bash
node .claude/skills/engineering-insights/scripts/build-index.mjs
```

This regenerates `<package>/INSIGHTS.index.md` — one line per entry carrying its section,
date, a short hook and, the part that matters, its **source line number**. It is a derived
file: it never opens `INSIGHTS.md` for writing, so append-only is untouched, and if the two
ever disagree the source wins (delete the index and rebuild). `--check` exits non-zero when
an index is stale; `--package <name>` limits it to one.

Why it exists: these files have outgrown free reading. `server/INSIGHTS.md` is ~50KB, about
13k tokens, and grows every session — and every agent that touches the server pays that
before doing any useful work. In one feature it was paid three times over for the same text
(dispatcher, planner, implementer). The index is ~11KB and lets a reader decide what is
relevant, then pull just those entries with `sed -n '<line>p' server/INSIGHTS.md`.

It is a **finding aid, not a substitute**. The session protocol in the root `CLAUDE.md` says
to read the package's `INSIGHTS.md`, and it still means the source file — an entry's value is
in its detail, and the hook is deliberately too short to act on. Where the index genuinely
replaces a full read is one step out: a dispatcher briefing a subagent can scan the index,
read the three relevant entries, and quote them into the prompt, instead of making the
subagent load 50KB to discover that two entries applied.

## Common mistakes

1. Not running the wrap-up consistently — the primary failure mode; the loop only
   compounds if it happens every session.
2. Generic entries that lack the context needed to act on them cold.
3. File bloat — past ~200 entries the signal-to-noise ratio drops.
4. Conflicting entries left unresolved, which leaves the next agent guessing.
5. Skipping **What Doesn't Work** — the negative learnings are the most valuable ones.

## Maintenance (not per-session)

Append-only keeps files growing, so prune out of band — quarterly: drop entries covering
code that was deleted or refactored away, update entries whose approach has evolved, and
consolidate near-duplicates into one clearer entry. Resolve contradictions explicitly
rather than leaving both. Split a file into domain files before it becomes unreadable.
Treat `INSIGHTS.md` as a reviewed draft: an incorrect entry propagates into every future
session until someone corrects it.
