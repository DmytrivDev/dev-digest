# Component Anatomy

Detail behind §1–§3 of [SKILL.md](SKILL.md): file roles, barrels, naming, and the mechanics
of moving a component between homes.

## Contents

- [The five file roles](#the-five-file-roles)
- [Choosing the home](#choosing-the-home)
- [Promotion: moving a component up](#promotion-moving-a-component-up)
- [Barrels in practice](#barrels-in-practice)
- [Nesting `_components`](#nesting-_components)
- [Worked example: splitting an overgrown component](#worked-example-splitting-an-overgrown-component)
- [Naming reference](#naming-reference)

## The five file roles

Add a file only when it has content. A component with no magic values needs no
`constants.ts`, and creating empty scaffolding is noise.

### `<Name>.tsx` — the component

Holds JSX, composition, hook calls and event wiring. It should read top-to-bottom as a
description of the UI, not as a pile of computation. If you are scrolling past logic to
find the markup, the logic wants to move to `helpers.ts`.

Order inside the file: imports → module-level constants → the component → any small
internal subcomponent. Helper functions go in `helpers.ts`, not at the bottom of this file,
so they can be tested without importing React.

### `<Name>.test.tsx` — the test

Colocated so it moves with the component and gets updated in the same edit. Tests the
rendered output and the user-visible behaviour, not internals.

One recurring trap in this repo: **`—` (em-dash) is the app-wide empty marker**, so adding a
new empty-capable cell to a row breaks *existing sibling tests* that assert
`getByText("—")` — Testing Library throws "found multiple elements", which reads like an
unrelated failure. Give the shared fixture a non-empty default for the new field and
override it only in the tests that exercise emptiness.

### `constants.ts` — named values

Lookup maps, thresholds, column configuration, anything where a bare literal would hide
meaning:

```ts
/** Severity → CSS colour token. */
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

/** Fallback colour for an unknown severity. */
export const SEV_COLOR_FALLBACK = "var(--text-muted)";
```

When two constants are coupled, say so in a comment and keep them adjacent. `COLUMN_KEYS`
and `GRID` in `app/repos/[repoId]/pulls/constants.ts` must stay length-aligned; nothing
enforces it, and the failure is a silent visual misalignment rather than an error.

### `helpers.ts` — pure functions

Same input, same output, no side effects, no mutation of anything it did not create:

```ts
/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
```

Note the `Pick<>` parameter type — accept the narrowest shape the function actually needs.
It makes the function reusable and the test fixture one line instead of a whole record.

### `styles.ts` — the `s` object

A single exported `s`. Static styles are plain objects; state-dependent ones are functions:

```ts
export const s = {
  header: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  card: (focused: boolean, sevColor: string): CSSProperties => ({
    borderStyle: "solid",
    borderColor: focused ? sevColor : "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: sevColor,
  }),
};
```

All-longhand, always. Mixing `border` with `borderLeftWidth` makes React warn about updating
shorthand and non-shorthand properties in the same render, and the border visibly flickers.

### `index.ts` — the public API

One line of re-export plus a comment naming the component's purpose and surface. This is the
only file other folders should import from.

## Choosing the home

Ask **who imports this**, not what it looks like:

- **One route segment** → `app/<route>/_components/<Name>/`. The `_` prefix opts the folder
  and everything under it out of routing. Colocation would be safe even without it (a folder
  without `page.tsx`/`route.ts` is not routable), but the prefix also guards against a future
  Next.js file convention claiming the name.
- **Two or more routes** → `src/components/<Name>/`, imported as `@/components/<Name>`.
- **A design-system primitive** → `src/vendor/ui`, imported as `@devdigest/ui`. This is
  vendored, hand-mirrored code — check whether the primitive already exists before adding
  one, and remember `src/vendor/shared/` must be edited in lock-step with the server's copy.

**Promote on the second consumer, not the first.** One consumer means you are guessing at
the abstraction; two means you have evidence. Some sources argue for waiting until the
third — the disagreement is real, and either threshold beats promoting on zero.

## Promotion: moving a component up

Mechanical, and worth doing as its own commit so the diff stays readable:

1. Move the folder from `app/<route>/_components/<Name>/` to `src/components/<Name>/`.
2. Update the import in the original route to `@/components/<Name>`.
3. Add the import in the new consumer.
4. Check the barrel comment in `index.ts` still describes the component truthfully — its
   audience just changed, and a stale "used by the PR list" comment is worse than none.
5. Run `pnpm typecheck` and `pnpm test` in `client/`.

If the component turns out to need route-specific props to be shared (a `repoId`, a route
callback), that is a sign it is not ready to move. Either parameterize it properly or leave
it where it is.

## Barrels in practice

**Write:**

```ts
// src/components/RunCostBadge/index.ts
/* RunCostBadge — per-run generation cost (USD) for the PR list and the
   Agent-runs timeline. Public surface: the component itself. */
export { RunCostBadge } from "./RunCostBadge";
```

**Never write:**

```ts
// src/components/index.ts — a wide aggregator
export * from "./RunCostBadge";
export * from "./app-shell";
export * from "./diff-viewer";
// ...
```

The wide aggregator is what the benchmarks indict: importing one symbol forces the bundler
to fetch and transform every re-exported module, because it cannot know which file holds the
export until it has parsed them all. It also makes `export *` leak internals you never meant
to expose.

**Never import your own folder's barrel from inside it.** `FindingCard.tsx` importing from
`./index` creates `FindingCard.tsx → index.ts → FindingCard.tsx`. JavaScript tolerates the
cycle; bundlers fail on it with errors that point nowhere near the cause.

## Nesting `_components`

A component that owns children used nowhere else nests them:

```
RunTraceDrawer/
  RunTraceDrawer.tsx
  constants.ts
  helpers.ts
  styles.ts
  index.ts
  _components/
    TraceBody/
    TraceSection/
    ToolCallRow/
    PromptBlock/
```

Keep this shallow. Three or four levels is the widely-quoted ceiling, and the reason is
practical: deeper trees produce import paths nobody can read and moves nobody wants to make.
If you are nesting a fifth level, the middle layer is probably a feature that deserves to be
promoted rather than buried.

Import direction inside a folder goes **downward only** — a parent imports its
`_components`, siblings do not import each other. Two siblings needing the same thing is the
signal to lift that thing to the parent. This rule is what makes circular dependencies
structurally impossible rather than merely discouraged.

## Worked example: splitting an overgrown component

**Before** — one file doing three jobs:

```tsx
export function FindingsPanel({ findings }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Severity | "all">("all");

  const visible = findings.filter((f) => filter === "all" || f.severity === filter);
  const counts = findings.reduce(/* ...15 lines of tallying... */);

  return (
    <div style={{ borderRadius: 8, border: "1px solid var(--border)" /* ... */ }}>
      {/* 40 lines of filter chips */}
      {/* 60 lines of per-finding rows with inline expansion logic */}
    </div>
  );
}
```

Three problems, each pointing at a different fix:

- `counts` is a pure tally → `helpers.ts`
- the inline style objects are recreated every render and bury the markup → `styles.ts`
- the per-finding row has its own expansion state → its own component
- `filter` belongs in the URL, not local state, if a user would want to share the view

**After:**

```
FindingsPanel/
  FindingsPanel.tsx      renders chips + maps rows; owns nothing but layout
  FindingsPanel.test.tsx
  constants.ts           SEVERITY_ORDER, filter options
  helpers.ts             countBySeverity(findings)
  styles.ts              s.panel, s.chipRow
  index.ts
  _components/
    FindingRow/          owns its own `expanded` state
```

`countBySeverity` is now testable with a plain array and no renderer. `FindingRow`'s state
change no longer re-renders the filter chips. And the panel component reads as what it is:
a list with a filter above it.

## Naming reference

| Thing | Convention | Example |
|---|---|---|
| Component folder | PascalCase, matches component | `FindingCard/` |
| Component file | PascalCase, matches folder | `FindingCard.tsx` |
| Test | `<Name>.test.tsx` beside source | `FindingCard.test.tsx` |
| Role files | lowercase | `constants.ts`, `helpers.ts`, `styles.ts` |
| Route-private folder | `_` prefix | `_components/` |
| Anything returning JSX | PascalCase — no exceptions | `<SeverityBadge />` |
| Constants | `CONSTANT_CASE` | `SEV_COLOR_FALLBACK` |
| Style object | always `s` | `export const s = { ... }` |
| Hooks | `use` + capital, only if it calls hooks | `usePrReviews` |
| Wire fields | snake_case | `cost_usd`, `tokens_in` |
| DB/Drizzle fields | camelCase | `costUsd` |

A camelCase function returning JSX (`renderRow()`) is not a component. React cannot give it
a stable identity, so it loses state on every parent render, cannot hold hooks, and does not
appear in DevTools. Rename it to PascalCase and call it as `<Row />`.
