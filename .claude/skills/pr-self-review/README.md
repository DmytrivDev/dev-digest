# pr-self-review — sources and rationale

**Version 1.0.0** · authored 2026-09-18

Why this skill is shaped the way it is. The procedure itself is in [SKILL.md](SKILL.md).

## What it reuses instead of inventing

Nothing here defines a severity scale, a gate policy or a score formula. All three already
exist in the product and are reused so a self-review reads like a product review:

| Borrowed | From |
|---|---|
| `Severity = CRITICAL \| WARNING \| SUGGESTION`, `FindingCategory`, `Verdict`, the `Finding` shape | `server/src/vendor/shared/contracts/findings.ts:11` |
| `gateTriggered(findings,'critical')`, `SEV_RANK`, `countBlockers` | `reviewer-core/src/output/to-review.ts:23` |
| score = 100 − 35·C − 12·W − 3·S | `reviewer-core/src/review/reduce.ts` |
| severity rubric, verdict semantics, findings discipline, anti-inflation wording | `docs/agent-prompts/general-reviewer.md` (lifted near-verbatim into `.claude/agents/pr-reviewer.md`) |
| prompt conventions the reviewer prompt must obey | `docs/agent-prompts/README.md` |
| the lock-step assertion | `server/test/vendor-shared-sync.test.ts` — **run**, not reimplemented |
| defensive script style, argv flags, "never crash the workflow" | `.claude/hooks/insights-stop.mjs`, `.claude/skills/engineering-insights/scripts/append-insight.mjs` |

"Block on ≥1 CRITICAL" is not a bar invented here — it is the product's own shipped default
(`ci_fail_on: 'critical'`, `contracts/knowledge.ts:187`).

## Design decisions

**Report-only, no hook.** `gh` is not installed on this machine, so PRs are opened in a
browser and there is no `gh pr create` to intercept; the only local chokepoint would be
`git push`. A `PreToolUse` hook on it was considered and rejected by the repo owner. The
upgrade path stays open — `.claude/hooks/insights-stop.mjs` is a working template for a
blocking hook — but a bypassable gate that people trust beats an enforced one they resent.

**Routing is data, not prose.** See [routing.md](routing.md). The short version: the same
diff must dispatch the same reviewers every run, and prose gets re-interpreted.

**Reviewers read their skill by path, never via the `Skill` tool.** Three reasons:
`next-best-practices` has `user-invocable: false` (which blocks a human's slash command,
not a file read); the Skill tool matches on description text, which is exactly the
nondeterminism this design removes; and a subagent that read its standard has it verbatim
in context, whereas one that hoped a tool loaded it fails silently.

**Reviewers get `Read`/`Grep`/`Glob` and no Bash.** They review a working tree the
developer is still editing. Rather than hand them a shell to run their own `git diff`,
phase 1 pre-cuts one patch per reviewer — the read-only guarantee is then structural, not
a promise in a prompt.

**Tests never block; typecheck does.** `server/test/indexer-pipeline.test.ts` fails 6 tests
on any clean Windows checkout (see [baseline.json](baseline.json)). A gate that is red on a
fresh clone gets ignored, and an ignored gate is worse than none.

**Attribution beats baselining.** Architecture violations and typecheck errors count only
when they sit in a changed file. No stored counts to drift — which matters because
`onion-architecture/SKILL.md` §5 explicitly warns that a second copy of its violation
inventory "would only drift".

**INCOMPLETE is a third verdict.** A phase that could not run is not a pass. This inverts
`insights-stop.mjs`'s "never block on infrastructure failure" on purpose: that hook must
not wedge a session; this gate must not pass a review it never performed.

**Reports live in `.devdigest/cache/`.** Already gitignored — and load-bearing, not
cosmetic: a report written to a tracked path would land in the very diff it just reviewed,
and every later run would review its own output.

## Two false positives found while building this, both fixed

Recorded because both are the failure mode that kills gates, and both looked reasonable
when written:

1. **Content regexes matched prose.** A skill's own markdown was routed to `security` (the
   word "token") and `typescript-expert` (an `Omit<` in a fenced example). Fix: content
   triggers apply only to source extensions, and `unrouted_paths` is a hard exclusion.
2. **The `.it.test.ts` naming rule flagged every new server test.** Most server tests are
   unit tests that correctly lack the suffix. Narrowing it to "imports something DB-ish"
   was still wrong — `server/test/jobs.test.ts` has `import type { Db }`, a type-only
   import used to type a mock. Fix: strip type-only imports before looking for a runtime
   database dependency.

## Known coverage gap

This skill's own `scripts/*.mjs` get no domain reviewer: they are plain JS, and
`typescript-expert` would have nothing useful to say. They are covered by the `security`
route (`.claude/skills/**/scripts/*.mjs`) and nothing else. Stated here rather than papered
over by routing a skill that cannot help.

## Changelog

- **1.0.0** (2026-09-18) — initial version. Five phases, 11 routed skills, 6-subagent cap,
  three-state verdict.
