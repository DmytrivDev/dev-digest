# L02 — Conventions: scan a repo, triage what it proposes, ship a skill

One repo-scoped screen with one job: turn a model's guesses about this
repository's house rules into a skill a human vouched for. The scan is cheap and
noisy by design — most proposals die against the real files before anyone sees
them, and of what survives, most is still not worth keeping. **The page is a
triage tool, not a results page**, so everything on it is built for the question
"keep or drop, next" rather than for making the model look clever.

The server (see `server/specs/L02-conventions.md`) owns every rule that must
hold whatever the client does: evidence validation, the fingerprint that lets a
re-scan preserve decisions, and the assembly of the skill body. This spec covers
only the studio half.

## Requirements

### R1 — The page is repo-scoped and lives in SKILLS LAB
`/repos/:repoId/conventions`, titled `Conventions in <repo>`, reached from a
fourth `SKILLS LAB` item whose href carries the `:repoId` token that
`resolveHref` fills — the mechanism Pull Requests already uses. The section is
not `WORKSPACE`, for the reason recorded in `nav.ts`: what this page produces is
a skill, and WORKSPACE is what you review.

A stale or unknown `:repoId` (including the `_` placeholder the sidebar renders
when no repo is active) shows the shared `RepoNotFound` screen rather than an
API error, exactly as the PR list does.

### R2 — Run extraction and Re-scan are two buttons, not one
The empty state carries `Run extraction`; once candidates exist the header
carries `Re-scan`. They are not the same affordance: the first is an invitation
on a page with nothing else to do, the second is a secondary action on a page
whose content you are already working through. Keeping both under one label
would make the second look like a refresh, which it is not — it costs a model
call.

While a scan runs the button is disabled and reads `Scanning…`, with a line
saying it is one model call and may take up to a minute. That is not decoration:
the route is **synchronous** and rate-limited to five requests per minute, so a
page that looked idle would invite the double-click that burns the budget.

### R3 — A failed scan is explained where it happened
The scan's 4xx answers are ANSWERS: no clone, no index, nothing accepted, or the
rate limit. They are rendered as an inline banner carrying the server's own
wording, because the server names the cause better than this page could guess
it. Only two statuses are re-worded — 429 ("this repo allows 5 per minute") and
a network failure — because their raw text explains nothing to the person who
pressed the button.

This required a change in `lib/providers.tsx`: the global `MutationCache`
toasted every mutation error, so an expected 422 would have arrived as a system
toast on top of the inline explanation, framing a normal outcome as a
malfunction. Mutations now opt out with `meta: { quietError: true }`, and the
scan is the first user.

### R4 — A candidate card shows the rule, its evidence and the confidence
Category chip, the rule itself, an evidence block (citation header plus the real
line of code), and a confidence bar with its percentage. The citation is a
**link** to the GitHub permalink the server pinned to the scan's sha, opening in
a new tab — a convention you cannot check against the code is a claim, not
evidence.

`evidence_url` is nullable: the server leaves it unset when it could not resolve
a head at scan time. That case prints `path:line` as plain text. A link that
goes nowhere reads as a broken feature, and the citation is still useful without
one.

### R5 — Accept, Reject and Edit sit on the card, and Edit is inline
All three are one server route (`PUT /conventions/:id`), so they are one hook
and one code path. The card shows which state holds by disabling that action and
keeping the other reachable, so a rejection can be taken back without a special
"undo" affordance.

`Edit` turns the card into a form **in place**: the rule becomes a textarea, the
category a select, and the evidence block stays on screen throughout. Leaving
the evidence visible is the point — it is what the user is judging the wording
against — and it is also how you can see that nothing navigated away. A modal or
a detail route would cost the triage flow a round trip per candidate.

The editor enforces the contract's `CONVENTION_LIMITS.rule` and a non-empty
rule before the request, because the server answers 422 for both and a form that
learns its own rules from an error is a form that wasted a round trip.

The category picker and the two buttons share one row, so editing costs the card
two lines rather than doubling its height — you are editing one card inside a
list of a dozen, and a form that pushes the rest off screen loses the context
that made you edit it. The picker itself needed a design-system fix: the app
paints itself dark with CSS variables, but the browser paints the native
`<select>` popup, and without `color-scheme` on the theme root that popup opens
white-on-white. It is set in `vendor/ui/styles.css` per theme, so every select
in the studio is fixed, not only this one.

### R6 — Rejected candidates stay visible in their own view
A filter of four chips with counts — All · Pending · Accepted · Rejected —
defaulting to **Pending**, with the choice kept in `?status=`.

This is the studio half of the server's three-state triage. A page that simply
removed a rejected candidate would give the user no way to see that the decision
was kept, no way to change their mind, and no way to tell "rejected" from "the
scan dropped it". Keeping the view in the URL means a reload — which is exactly
how the criterion is checked — comes back to the same list.

### R7 — The scan report is shown, not hidden
After a scan, a collapsible panel reports what the scan sent (config and code
samples, chosen by code, no model involved), what it proposed, kept and created,
what it dropped and why, and what it cost. The report is not persisted, so it
appears only for a scan run in this session.

A thin result is the normal outcome of this feature — twelve proposals, three
survivors — and without the report that reads as a broken model. With it, the
page is making an argument: selection is deterministic, evidence was checked,
and here is what failed.

### R8 — Create skill appears only once something is accepted
The button is derived from the accepted count, never from a stored flag. With
nothing accepted the server answers 422, and a button that exists only to
produce that error is a trap.

### R9 — The modal shows the server's draft and lets the user change it
Opening it fetches `GET .../skill/draft` — what a save WOULD store, writing
nothing — and shows an explanation of what it was merged from, an editable
`Name`, `Description` and the assembled markdown `body`.

The client deliberately does **not** assemble that markdown. A draft shown and
then saved untouched must be byte-identical to what the save path writes,
because that is what keeps "an unchanged accepted set burns no skill version"
true; if the client re-rendered the body, determinism would depend on its
formatter matching the server's. For the same reason each field is an
**override**: what the user did not touch is omitted from the POST entirely,
which is precisely how the route reads a missing field.

The draft is fetched per opening (`staleTime: 0`, and the modal mounts the hook
only while open), because accepting one more rule changes the body.

**A name already in use is called out before the save, not after.** The route
matches an existing skill BY NAME, so the default name is usually an UPDATE:
the body is replaced and a new version written, and every agent carrying that
skill is affected from its next run. That is the right default — this is the
same repo's conventions — but it is invisible from a button labelled `Create
skill`, so the modal warns, names the version it would replace, and points at
the name field as the way to make a separate skill instead. The warning is
derived from the skills list against the CURRENT field value, so it disappears
the moment the name is free.

### R10 — A saved skill is announced with a way to reach it
Saving does not navigate. Triage rarely stops at the first skill, and a redirect
would make the user find their place in the list again. Instead the page shows a
banner naming the skill with a link to it, plus a toast, and the mutation
invalidates the `["skills"]` query — which is what makes the new skill appear on
`/skills` without a reload.

### R11 — Nothing here confirms twice
No `ConfirmDialog` and no `window.confirm`. Every action on this page is
reversible from the page itself: a rejection can be accepted, an edit can be
edited again, and a re-scan preserves triage by contract. A confirmation on a
reversible action trains people to click through confirmations.

## Acceptance criteria

1. `Conventions` appears in the sidebar's `SKILLS LAB` section and resolves to
   `/repos/:repoId/conventions` for the active repo; an unknown repo id shows
   `RepoNotFound` rather than an error.
2. With no candidates the page shows the empty state and `Run extraction`;
   with candidates it shows `Re-scan` in the header and no `Run extraction`.
3. While a scan is in flight the button is disabled and reads `Scanning…`.
4. A 429 renders in place as the rate-limit explanation, and a 422 renders the
   server's own cause; neither raises a system toast.
5. Each card shows the rule, its category, the confidence percentage, and the
   citation as a link carrying the scan's permalink and `target="_blank"`.
6. A candidate with `evidence_url: null` renders `path:line` as text and no
   link.
7. `Accept` and `Reject` send `{status}` to `PUT /conventions/:id`; the action
   that already holds is disabled and the other stays clickable.
8. `Edit` replaces the rule with a textarea **inside the same card**, with the
   evidence block still on screen; `Save` sends the trimmed rule and the chosen
   category; `Cancel` sends nothing and restores the card; an empty rule leaves
   `Save` disabled.
9. The filter shows counts for all four views, defaults to Pending, and writes
   the chosen view to `?status=`. A rejected candidate is absent from Pending
   and present in Rejected — after a reload as well.
10. After a scan the report shows `proposed · kept · new`, and expanding it
    lists the samples the scan sent and each dropped proposal with its reason.
11. `Create skill` is absent with nothing accepted and present with at least one
    accepted candidate.
12. The modal shows the server's `name`, `description` and `body` in editable
    fields, explains how many accepted conventions it was merged from, and
    offers `Cancel` and `Create skill`. Cancel writes nothing.
13. Saving an untouched draft posts `{}`; changing only the body posts only
    `body`.
13a. When a skill already carries the name in the field, the modal shows a
    warning naming it and its current version and saying the save replaces its
    body; renaming to a free name removes the warning.
14. After a save the page stays put, shows the skill's name with a link to
    `/skills/:id`, and the skill is on `/skills` without a reload.
15. `pnpm typecheck`, `pnpm test` and `pnpm build` all pass. The build is not
    optional here: this feature imports `@devdigest/shared` VALUES
    (`CONVENTION_LIMITS`, `ConventionCategory`, `SKILL_LIMITS`), and a webpack
    resolution failure on that barrel is invisible to both the type checker and
    the unit suites — it is what broke the dev server once already, and the
    `extensionAlias` in `next.config.mjs` is the standing fix.
