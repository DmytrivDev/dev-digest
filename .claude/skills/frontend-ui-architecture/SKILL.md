---
name: frontend-ui-architecture
description: "Decides where frontend UI code belongs and how far to split it: component homes, file roles (constants, helpers, styles, barrels), business-logic and state placement, and the App Router server/client boundary. Use when creating, moving or renaming any React/Next.js file, extracting a helper or constant, choosing route-local vs shared vs design system, placing data fetching or business rules, or reviewing a PR that adds UI files. Applies even to one-file changes — that is how structure erodes."
metadata:
  version: 1.0.0
---

# Frontend UI Architecture

Answers one question: **where does this code belong, and how far do I split it?**

This is deliberately separate from `react-best-practices` (anti-patterns, hooks misuse,
memoization) and `next-best-practices` (which file does what, async APIs, runtime). Those
tell you how to write a component correctly. This tells you where to put it.

Every rule below carries its reasoning, because the reasoning is what lets you handle the
case this file did not anticipate. Where respected sources genuinely disagree, that is
marked as **[choice]** — it means we picked a side for consistency, not that the other side
is wrong. Sources for every claim are in [README.md](README.md).

## Order of decisions

Work outside-in. Each answer constrains the next:

1. **Radius** — who uses this? → picks the folder (§1)
2. **Anatomy** — what files does it need? → picks the file roles (§2)
3. **Split** — is it one component or several? → §3
4. **Logic** — where do the rules and the data live? → §4, §5
5. **Boundary** — server or client? → §6

## 1. Where a component lives

Three homes, chosen by **radius of use** — not by what the component looks like:

| Radius | Home | Import as |
|---|---|---|
| One route segment | `app/<route>/_components/<Name>/` | `./_components/<Name>` |
| Several routes | `src/components/<Name>/` | `@/components/<Name>` |
| Design system primitive | `src/vendor/ui/` | `@devdigest/ui` |

**Start in the narrowest home that fits and promote later.** A component invented for one
route belongs beside that route; moving it up when a second route needs it is a cheap,
mechanical refactor, while guessing wrong upfront produces a shared folder full of
single-consumer components that nobody dares touch.

Next.js guarantees this is safe: a route is not publicly reachable until it contains
`page.tsx` or `route.ts`, so any file may sit inside `app/`. The `_` prefix additionally
opts a folder out of routing — and protects against collisions with future Next.js file
conventions.

**Before creating a primitive, search `src/vendor/ui` first.** The design system already
ships `SEV` tokens, `Chip`, `SeverityBadge`, `CategoryTag`, `ConfidenceNum`, `Badge`,
`CircularScore` and the `ddpop` keyframe. Most "new" UI is composition of these, not new CSS.

**[choice] Features live inside route segments, not in a parallel `src/features/`.**
Feature-Sliced Design argues `app/` should be routing-only with domain code in `src/`;
Next.js explicitly declines to arbitrate and calls itself unopinionated. We colocate,
because routes here map 1:1 onto features and a parallel tree would mean every change
touches two places. If a feature ever outgrows its route or gets used by three or more
routes, promote it to `src/components/` rather than inventing a third tree.

## 2. Anatomy of a component folder

One folder per component. Each file has a single role, and you add a file only when there
is something to put in it:

```
FindingCard/
  FindingCard.tsx        component: JSX + composition only
  FindingCard.test.tsx   colocated test
  constants.ts           magic values, lookup maps, column config
  helpers.ts             pure functions extracted from the component body
  styles.ts              exported `s` object of CSSProperties
  index.ts               barrel: the folder's public API
  _components/           children used only by this component
```

**Why split by role rather than keeping one long file:** each of these has a different
reason to change and a different audience. A designer edits `styles.ts`, a test reads
`helpers.ts` without mounting React, and `constants.ts` is where you look when a value
appears wrong. Pure functions in `helpers.ts` are testable without a renderer — this is the
"humble object" idea: shrink the part that is hard to test until what remains is trivial.

**`index.ts` is the folder's public API — and the only barrel you may write.**
It re-exports the component and carries a one-line comment saying what the folder is for:

```ts
/* RunCostBadge — per-run generation cost (USD) for the PR list and the
   Agent-runs timeline. Public surface: the component itself. */
export { RunCostBadge } from "./RunCostBadge";
```

**[choice] Narrow barrels only.** This is the sharpest conflict in the whole field. Every
measurement runs against barrels — one real project went from ~11k modules per page to
~3.5k by deleting internal ones, and at 25k modules a test runner burns about seven minutes
before running a single assertion. Every encapsulation argument runs for them, because a
barrel is the only way TypeScript can express "this folder has a public face". We keep the
one-component barrel (small, cohesive, already the repo's convention) and forbid the thing
that actually causes the damage: **never write a barrel that aggregates many modules**, e.g.
a `src/components/index.ts` re-exporting everything. Import siblings by their real path.

Also avoid same-directory barrel imports (`FindingCard.tsx` importing from `./index`) —
that is a cycle that JavaScript tolerates and bundlers fail on with unhelpful errors.

## 3. When to split a component

There is no line count. Sources that publish one ("fits on a laptop screen", "more than
five props") disagree with sources that refuse to, and the refusers have the better
argument: length is a symptom, not the disease. **Long JSX is fine. Split when you hit an
actual problem:**

- **Two jobs.** A component either *implements* something or *composes* other components.
  Doing both is the most reliable signal to split.
- **Unrelated state.** State that has nothing to do with the component's purpose (a modal's
  open/closed flag) drags the whole subtree into re-rendering. Push it into its own
  component so React can skip the rest.
- **Reuse actually happened.** Not "might be reused" — a second caller exists.
- **The test is awkward.** If you cannot test a rule without mounting the component, the
  rule wants to be a function in `helpers.ts`.
- **Merge conflicts.** Two people editing one file every sprint is a structural signal.

Do **not** split for hypothetical reuse. A wrong abstraction is more expensive than
duplication, because every later case gets bent to fit it. Ask "haven't I written this
before?" twice; act on the third.

**Never define a component inside another component's render** — it gets a new identity
every render, so React unmounts and remounts the whole subtree, losing state and DOM focus.

**Naming:** folders and component files are PascalCase and match the component name. Only
PascalCase functions may return JSX; a camelCase `renderThing()` helper is not a component
and breaks reconciliation and hooks. Non-component files are lowercase
(`constants.ts`, `helpers.ts`). **[choice]** — there is no industry consensus here (Google
says `snake_case`, most React tooling says kebab-case); we match what the repo already does.

## 4. Constants, helpers, types

**Constants** live in the `constants.ts` next to the component that owns them, and move up
only when a second consumer appears. A value earns a name when it carries meaning that the
literal does not: a magic number is one that "occurs multiple times without an explicit
meaning". `0`, `1` and `-1` in an obvious context do not need naming; `SKELETON_ROWS = 6`
does.

Prefer `as const` objects over TypeScript `enum`. Numeric enums emit a reverse mapping and
silently accept any raw number, and enums are nominal in a structurally-typed language, so
two identical enums are incompatible. The TypeScript handbook itself says you "may not need
an enum when an object with `as const` could suffice". If you inherit an enum, initialize
every member explicitly — implicit members renumber themselves when reordered, which
corrupts anything already persisted. Never use `const enum`; it breaks under
`isolatedModules`, which is the one point all sources agree on.

**Constants that must stay in step belong in the same file, with the coupling written down.**
`COLUMN_KEYS` and `GRID` in the PR-list `constants.ts` must stay length-aligned or header
and cells misalign silently — the comment saying so is doing real work.

**Helpers** are pure functions lifted out of the component body. Pure means same input,
same output, no mutation of anything it did not create. React assumes purity and
double-invokes components in StrictMode specifically to expose violations.

**There is no `utils.ts` in this codebase, and there should not be.** A folder named
`utils` is where code goes to be forgotten: it has no owner, no cohesion, and nothing tells
you whether a function inside is still used. Name modules after the domain concept instead
— `lib/cost.ts`, `lib/github-urls.ts`, `lib/model-label.ts`. If you cannot name the module
after a concept, you have not found the concept yet, and the function probably belongs
beside its single caller.

**Types** come from `@devdigest/shared` (Zod contracts) whenever they describe something
crossing the wire — never hand-duplicate them. Component-local types stay in the component
file. Remember the wire is snake_case (`cost_usd`) while Drizzle/DB code is camelCase.

Import types with `import type`. Single-file transpilers have no type information and
cannot tell a type import from a value import, and a stray value import of a type-only
module can change runtime behaviour by pulling in side effects.

## 5. Where business logic lives

The decision that matters most, and the one with the most confused advice. Use this ladder:

1. **Pure rules → a plain function** in `helpers.ts` or a domain module in `lib/`.
   Formatting, calculation, validation, mapping. React's own rule is explicit: if a function
   calls no hooks, it must **not** be named `use*`. Pure logic needs no React at all, and
   keeping it out means you can test it without a renderer.
2. **Stateful or effectful logic → a custom hook** in `lib/hooks/`. A hook is the thin
   adapter that holds state, subscribes, or fetches — and then calls the pure functions.
   Hooks share *logic*, never *state*: two components calling the same hook get independent
   state. To share state, lift it.
3. **Server data → the query hook**, never component bodies. All API access goes through
   `lib/api.ts`; every data hook lives in `lib/hooks/*`. Never copy query results into
   `useState` — the copy silently stops receiving background updates.
4. **Components → render and trigger events.** A component reads props, renders, and calls
   handlers. Squeezing everything into components *or* into hooks is the failure mode at
   both extremes.

**[choice]** We do not add a clean/hexagonal layer (domain classes, ports, adapters). It buys
testability we already get from pure helpers, and the cost of carry — every future change
paying for indirection nobody reads — is real. Layering is worth it at a granularity larger
than this app currently has.

### Where state lives

Four buckets, in order of preference. Reach for the first that fits:

- **Server data** → TanStack Query via `lib/hooks/*`. It is not a fetching library, it is an
  async state manager; the cache *is* the state.
- **URL** → filters, sorting, pagination, the selected tab. If a user should be able to
  share or reload the page and see the same thing, it belongs in search params.
- **Local** → `useState` / `useReducer` in the component that uses it. Colocate it: state
  pushed down means React never visits the siblings.
- **Shared** → props first, then Context. Context is dependency injection (theme, active
  repo, toasts), not a state manager; every consumer re-renders on every change, so split
  contexts by concern and render providers as deep as they can go.

Never store what you can derive. If a value is computable from props or state, compute it
during render — storing it creates two sources of truth that drift.

## 6. The Next.js boundary

**Read [nextjs-architecture.md](nextjs-architecture.md)** before adding a route, a layout,
a Server Action, or any server-side data access. The essentials:

Two rules organize everything: **code crosses the boundary through imports, data crosses
through props.** And **ownership, not nesting, decides where a component renders** — a
Client Component can be the *parent* of a Server Component but never its *owner*.

`'use client'` marks an entry point, not a file-by-file annotation: the directive makes that
module and **all of its transitive imports** client modules. So put it at the top of the
client subtree and let the rest inherit — adding it everywhere is noise, and adding it too
high drags the whole tree into the bundle.

**Honest note about this repo:** 54 of 116 `.tsx` files are `'use client'`, including pages.
This is a client-rendered app that uses the App Router mainly for routing and layouts. Do
not "fix" that in passing — converting a page to a Server Component changes its data
fetching, its hooks and its tests. Follow the existing pattern unless a change is explicitly
about the rendering model.

## 7. Styles, tests, i18n

**Styles** live in `styles.ts` beside the component, exported as a single `s` object of
`CSSProperties`. Values that vary by state are functions (`s.card(focused, color, muted)`).
Colours come from CSS custom properties (`var(--border)`, `var(--crit)`) defined in
`vendor/ui/styles.css` — never hardcode a hex. Tailwind v4 is installed but the components
do not use utility classes; follow `styles.ts`.

One real trap, already paid for once: **never mix a CSS shorthand with its longhand**
(`border` together with `borderLeftWidth`). React warns and the result flickers between
renders. Use all-longhand.

**Tests** are colocated: `FindingCard.test.tsx` beside `FindingCard.tsx`. No tool forces
this — Vitest's default glob matches tests anywhere and Testing Library has no opinion — so
it is a project decision, chosen because a test that lives next to its subject gets updated
with it. Server tests live in `server/test/`, and a DB-backed one **must** use the
`*.it.test.ts` suffix or the CI split breaks.

**i18n**: one namespace file per feature area under `client/messages/en/`, dot-path keys
(`list.columns.cost`), read with `useTranslations("<ns>")`. Only the `en` locale exists, and
**a missing key renders the raw key rather than throwing** — so a typo ships silently. Add
the key when you add the string.

## Anti-patterns

- A `utils/` folder, or any module named for what it *is* rather than what it is *about*.
- A wide barrel re-exporting many modules; or importing from `./index` inside the folder.
- Storing derived values in state, or copying server data into `useState`.
- A "reusable" component or hook with exactly one caller, created for a future that has not
  arrived.
- `renderThing()` returning JSX, or a component defined inside another component.
- Promoting to `src/components/` on the first use rather than the second.
- Adding a cell to the PR-list row without updating both `COLUMN_KEYS` and `GRID`.

## Further reading

- [component-anatomy.md](component-anatomy.md) — file roles, barrels, naming, promotion
  mechanics, worked before/after examples.
- [logic-and-data.md](logic-and-data.md) — the logic ladder in depth, state buckets, query
  hook conventions, validation placement.
- [nextjs-architecture.md](nextjs-architecture.md) — server/client boundary, layouts vs
  templates, route groups, parallel routes, Server Actions, the Data Access Layer pattern.
- [README.md](README.md) — every source behind these rules, with the conflicts spelled out.

Structure rules here are not linted — this repo has no linter configured — so they hold only
by review and habit. That is precisely why the reasoning is written down: a rule you
understand survives, a rule you merely obey does not.
