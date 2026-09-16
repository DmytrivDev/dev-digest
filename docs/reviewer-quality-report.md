# Reviewer quality report — one real PR, two prompt versions

How good are the findings the configured reviewer actually produces? Measured on a
real pull request in a real project, not on the seeded demo data.

## Setup

| | |
|---|---|
| Repository | `DmytrivDev/shedemines` — a PHP / WordPress site (**not** the Node/TS stack the starter prompts assume) |
| Pull request | `#1 SEO: Schema.org markup and hreflang x-default` — +691 −0, 4 files |
| Agents | General / Security / Performance Reviewer, all `openrouter/deepseek/deepseek-v4-flash`, single-pass |
| Context fed | diff only — `Memory pulled: 0 items`, `Specs read: none` (those prompt slots are unfed in the starter) |

## Run 0 — the starter prompt (v1)

| Agent | Verdict | Score | Findings | Tokens | Cost |
|---|---|---|---|---|---|
| Performance | approved | 100 | 0 | 14,344 | $0.0014 |
| Security | approved | 100 | 0 | 15,646 | $0.0024 |
| General | comment | 88 | 1 | 18,881 | $0.0021 |
| **Total** | | | **1** | **48,871** | **$0.0059** |

One finding, and it was a good one: `Article.about` set to the publisher instead of
the article's subject (`inc/schema.php:555`, 90% confidence, grounded 1/1). The model
explicitly refused to be talked out of it by the PR description — "the PR description
confirms this is intentional, but it is still incorrect structured data" — which is the
`INJECTION_GUARD` rule in `reviewer-core/prompt.ts` doing its job.

**But two things were wrong with the setup, not with the model:**

1. The finding was filed under category **`security`**. It is an SEO/semantics defect,
   not an exploitable weakness. Cause: the prompt never defines what the five
   `FindingCategory` values mean, so the model guessed.
2. The prompt opens with *"you are reviewing a pull-request diff for a **Node.js
   (TypeScript, ESM) service**"* and then lists Fastify, Drizzle and zod. The diff is
   PHP. Half of the "what to look for" checklist (missing `await`, `??` vs `||`,
   Drizzle scoping) cannot apply to this code at all — which plausibly explains why the
   Security Reviewer found nothing in 691 lines of markup-generating PHP.

## The prompt change (v1 → v2)

Two edits to the General Reviewer, saved as agent version 2:

1. **Stack is now inferred, not asserted.** A new section tells the model to identify
   the language and framework from the diff itself and to review by *that* language's
   rules; the project's Node stack is demoted to "if (and only if) the diff matches it".
2. **The five categories are defined**, with the rule to pick by mechanism: `security`
   is only an exploitable weakness, wrong output — including malformed or semantically
   wrong structured data — is `bug`.

## Runs 1 and 2 — the same PR with v2

Both runs used the identical v2 prompt, minutes apart.

| | v1 | v2 — run 1 | v2 — run 2 |
|---|---|---|---|
| Findings | 1 | 2 | 4 |
| Verdict / score | comment / 88 | request_changes / 53 | comment / 70 |
| Categories | `security` (wrong) | `bug` | `bug` ×4 |
| Output tokens | 5,097 | 12,166 | 6,067 |
| Cost | $0.0021 | $0.0033 | $0.0023 |
| Duration | 91 s | 247 s | 133 s |
| Grounding | 1/1 | 2/2 | 4/4 |

### What got better

- **The category error is gone.** Every finding in both v2 runs is `bug`. The fix was
  four sentences of prompt.
- **PHP-specific defects appeared.** The strongest new finding — *"Potential PHP warning
  from null array access in FAQ retrieval"* (`inc/schema.php:430`, 95% confidence) —
  reasons about `get_field()` returning `null` and about `empty()` not suppressing the
  warning when the base value is null. **The repository owner confirmed this one is
  real.** It is a class of bug the Node-flavoured prompt was never looking for.
- **The stable finding stayed stable.** The `Article.about` defect was reported in all
  three runs. A finding that survives re-runs is much more likely to be real than one
  that appears once.

### What did not get better — and the main result

**Two runs of the same prompt on the same diff disagreed.** Not slightly: 2 findings vs
4, `request_changes` vs `comment`, score 53 vs 70. Even the one finding both runs share
was anchored at different lines (555 vs 530) with different confidence (90% vs 70%).

So the honest conclusion of this experiment is not "v2 is better than v1". It is:

> A single review run is an observation, not a measurement. Comparing prompt versions by
> one run each would have produced a confident, unfounded verdict. Anything that claims
> a prompt change improved review quality needs several runs per version.

The category fix is the only change here that can be asserted from this data, because it
held in 6 findings out of 6.

### Where the noise is

| Finding | Status |
|---|---|
| `Article.about` points at the publisher (all 3 runs, 90/90/70%) | **True positive** — semantically wrong structured data |
| PHP warning from null array access (95%) | **True positive**, confirmed by the repo owner |
| Overwriting existing `mainEntity` breaks the Article relationship — **CRITICAL**, 90% | **Unverified.** The argument is specific and plausible (Yoast sets `WebPage.mainEntity` to the Article node), but it is a claim about the *runtime output of a third-party plugin*, which is not in the diff. The prompt's own rule says a speculative issue is "at most a WARNING, never CRITICAL" — the model broke it. This is the single riskiest finding: a CRITICAL blocks merge. |
| Future `foundingDate` may be incorrect (70%) | Unverified, low confidence — the noise band |
| Inconsistent role for UN Women: funder vs provider (60%) | Unverified, low confidence — the noise band |

Two of six findings are confirmed real, one is a well-argued but unverifiable CRITICAL,
three are low-confidence guesses. That is a usable signal-to-noise ratio for a $0.002
review — as long as the reader treats CRITICAL as "check this", not as "this is true".

## Cost

A full three-agent review of a 691-line PR costs **$0.0059** and takes ~1.5 minutes.
Re-running one agent costs ~$0.002–0.003. Because cost tracks output tokens, a prompt
that produces more findings costs more: the 4-finding run was 60% more expensive than
the 1-finding run. At this price the economics are irrelevant for a human-reviewed PR —
the limiting factor is the reviewer's attention spent on false positives, not money.

## Next levers (in the order I would try them)

1. **Several runs per prompt version** before believing any comparison.
2. **Tighten the CRITICAL bar** — repeat the "no speculation above WARNING" rule inside
   the severity section, where the model is actually choosing. The `mainEntity` finding
   is the exact failure this would catch.
3. **Feed the unfed context slots.** `Specs read: none` and `Memory pulled: 0 items` mean
   the reviewer knows nothing about the project's conventions — every judgement is made
   from the diff alone.
4. **Give the Security Reviewer the same language-inference fix.** It still carries the
   Node/TS assumption, and it found nothing in a markup-generating PHP diff.

---

# Experiment 2 — the same reviewer on a matched stack (this project)

Experiment 1 left an obvious question: was the weak result caused by the prompt's
hidden "this is a Node/TypeScript service" assumption, or by the prompt in general?
So the same three agents (back on the **v1 starter prompt**) reviewed this very
repository's homework PR — a diff the prompt's assumptions actually fit.

| | |
|---|---|
| Repository / PR | `DmytrivDev/dev-digest` — PR #1, +5,290 −34, 67 files (TypeScript, Fastify, Next.js, Drizzle) |
| Prompt | v1 — the starter prompt, unmodified |

| Agent | Verdict | Score | Findings | Tokens | Cost | Duration |
|---|---|---|---|---|---|---|
| General | approve | 97 | 1 | 37,697 → 5,955 | $0.0048 | 210 s |
| Security | comment | 97 | 1 | 37,907 → 8,729 | $0.0048 | 133 s |
| Performance | approve | 100 | 0 | 38,127 → 2,899 | $0.0038 | 59 s |
| **Total** | | | **2** | **~120k** | **$0.0134** | |

## The two findings, verified

**Security Reviewer — true positive.** *"Path traversal in insights-stop.mjs via
unsanitized session_id"* (`.claude/hooks/insights-stop.mjs:49`, SUGGESTION, 60%).
Verified: the hook builds its marker path from `payload.session_id` with `join()`, and
`join` normalises `..`, so a crafted `session_id` would escape the temp directory. The
agent also rated it honestly — it noted this is a local dev tool whose payload comes
from the harness, and filed it as a SUGGESTION rather than inflating it.

**General Reviewer — false positive, and an instructive one.** *"formatCost crashes on
negative input"* (`client/src/lib/cost.ts:20`, SUGGESTION, 80%, category `security`).
The stated mechanism: `Math.log10(negative)` → `NaN` → `usd.toFixed(NaN)` → `RangeError`
→ the page crashes. Checked in node:

```
formatCost(-1)      -> "$-1"
formatCost(-0.5)    -> "$-1"
(-1).toFixed(NaN)   -> "-1"    // a string, not a throw
```

`toFixed` runs its argument through `ToIntegerOrInfinity`, where `NaN` becomes `0`.
Nothing throws and nothing crashes. The finding is confidently wrong about the one
step that mattered — and its form (exact line, plausible chain, 80% confidence) is
indistinguishable from the true positive above.

It is not worthless, though: it stumbled onto a real if minor gap. Negative input *is*
unhandled and produces garbage (`"$-1"` for `-0.5`). Right that there is a hole, wrong
about what falls into it.

## What experiment 2 settles

- **The stack mismatch was not the main problem.** On a perfectly matched TypeScript
  diff, the v1 General Reviewer still produced exactly one finding — and that one was
  false. The weak PHP result was not mostly about PHP.
- **The category bug is systemic, not stack-specific.** v1 again filed a robustness
  issue as `security`, exactly as it had on the PHP diff. The v2 category definitions
  fix a real defect in the prompt, not a quirk of one language.
- **Prompt quality dominates model quality.** Same model, same diff, same minute: the
  Security Reviewer's prompt produced a verified finding with honest severity, while the
  General Reviewer's produced a fabricated mechanism. The difference is the prompt.
- **Recall on a large diff is low.** Two findings across 5,290 changed lines and three
  agents. Whatever else this reviewer is, it is not a safety net — it is a cheap second
  pair of eyes that occasionally sees something real.

## Operational incident worth recording

Firing four large reviews at once (three agents via "Review all" plus one more) left two
General runs hung: their last event was `Reviewing 65 changed file(s) in one pass`, and
nothing followed for 30+ minutes. The configured ceiling is far lower — a 90 s
per-request timeout, ≤2 SDK retries and ≤3 schema-repair attempts bound a run at roughly
13 minutes. Both had to be cancelled (`POST /runs/:id/cancel`, which records them as
`cancelled` with `cost_usd: null`, so they do not pollute the numbers above). Serial runs
on the same diff completed normally in 1–3.5 minutes. Treat concurrent large-diff reviews
as unsafe until the hang is diagnosed.

## Bottom line

Across both experiments, 8 findings were produced for about $0.03 in total. Three are
verified real (`Article.about`, the PHP null-array access, the path traversal), one is a
verified false positive with a fabricated mechanism, one is an unverifiable CRITICAL that
broke the prompt's own "no speculation above WARNING" rule, and three are low-confidence
guesses nobody has checked. A reviewer at this price is worth running on every PR — and
worth trusting on none of them without reading the rationale.

## Cross-check with Claude Code

<!-- TODO (not done): run the same prompt against the same diff through Claude Code and
     record which findings both produce, which only one finds, and whether the CRITICAL
     mainEntity claim survives a reviewer that can read the whole repository. -->
