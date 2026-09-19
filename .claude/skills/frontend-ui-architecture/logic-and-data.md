# Logic and Data

Detail behind §4–§5 of [SKILL.md](SKILL.md): where rules live, where state lives, and how
data flows through the client.

## Contents

- [The logic ladder](#the-logic-ladder)
- [When something is a hook and when it is a function](#when-something-is-a-hook-and-when-it-is-a-function)
- [The data layer](#the-data-layer)
- [State: four buckets](#state-four-buckets)
- [Derived state](#derived-state)
- [Validation and contracts](#validation-and-contracts)
- [Why we stop short of clean architecture](#why-we-stop-short-of-clean-architecture)

## The logic ladder

Climb only as high as the code requires:

| Rung | Home | Holds |
|---|---|---|
| 1 | `helpers.ts` beside the component | Pure rules used by one component |
| 2 | `lib/<concept>.ts` | Pure rules used by several (`cost.ts`, `github-urls.ts`) |
| 3 | `lib/hooks/<area>.ts` | Stateful or effectful logic; server data |
| 4 | `lib/api.ts` | The single HTTP seam |
| 5 | The component | Rendering and event wiring — nothing else |

The failure modes sit at both extremes. Putting everything in the component gives you logic
that cannot be tested without a renderer and cannot be reused. Putting everything in hooks
gives you "pure" rules that still need React to run — a hook is not a humble object, and
wrapping a formatter in `useFormatter()` buys nothing while costing a render dependency.

## When something is a hook and when it is a function

React's rule is unusually crisp, and it settles the most common architectural argument:
**if a function calls no hooks, it must not be named `use*`.**

```ts
// Wrong — calls no hooks, so it is a plain function wearing a hook's name.
function useSortedFindings(findings: Finding[]) {
  return [...findings].sort(bySeverity);
}

// Right — a plain function. Testable with an array, no renderer, no rules-of-hooks.
export function sortFindings(findings: Finding[]) {
  return [...findings].sort(bySeverity);
}
```

The naming matters beyond style: the `use` prefix is what tells both React's linter and the
next reader that the rules of hooks apply — that it cannot be called conditionally, in a
loop, or outside a component. Applying that constraint to a pure sort is a cost with no
benefit.

Extract a **hook** when there is state, an effect, a subscription, or a query. Extract a
**function** when there is only computation.

Two further rules worth internalizing:

- **Hooks share logic, not state.** Two components calling `useOnlineStatus()` each get their
  own state. If they must agree on one value, lift the state to a common parent or a context
  — no amount of hook extraction will share it.
- **A hook you cannot name is not ready.** If the best name is `useFindingCardStuff`, the
  code has not found its concept yet. Leave it inline until it does.

Avoid lifecycle-shaped hooks (`useMount`, `useUpdateEffect`). They re-impose a class-component
mental model on a system that does not work that way, and they hide the dependency that
actually drives the effect.

## The data layer

Three fixed seams, and nothing bypasses them:

**`lib/api.ts`** — the only place that talks HTTP. Centralizing it means base URL, headers,
and error normalization (`ApiError`) exist once. A `fetch()` anywhere else is a bug.

**`lib/hooks/*.ts`** — one file per domain area (`reviews.ts`, `agents.ts`, `repo-intel.ts`,
`trace.ts`), built on the shared `core.ts` primitives. Every data hook lives here, and
components import from `@/lib/hooks`.

**Components** — consume hooks and handle the four states: loading, error, empty, success.

### Conventions for query hooks

Wrap even a single query in a named hook. It keeps the key, the fetcher and the types in one
place, gives every caller the same cache entry, and means a change to the endpoint touches
one file:

```ts
export function usePrReviews(prId: string | undefined) {
  return useApiQuery(["pr-reviews", prId], () => api.getPrReviews(prId!), {
    enabled: !!prId,
  });
}
```

**Never copy query data into `useState`.** The copy is a snapshot: background refetches,
cache invalidation and window-focus refresh all update the query, and none of them update
your copy. If you need to edit server data in a form, that is the one sanctioned exception —
seed the form once and treat it as client state from then on.

**A single-argument hook can still be lazy.** `usePrReviews(prId)` hardcodes
`enabled: !!prId` and takes no options, which looks like it needs a wider signature to
support hover-loading. It does not — render the consumer only when you want the fetch:

```tsx
{hover && <FindingsTooltip prId={pr.id} />}
```

The hook mounts (and fires) lazily, and the cache keeps the result per PR. This applies to
any of the single-argument hooks in `lib/hooks/`.

## State: four buckets

Ask which bucket a piece of state belongs in *before* reaching for `useState`. Most state
questions are really placement questions.

### 1. Server data → TanStack Query

Anything the frontend does not own: PRs, reviews, findings, agents, runs. The cache is the
state. Do not mirror it into a store, do not sync it into context. Query keys behave like a
dependency array — change the key and the data refetches, which replaces a whole category of
manual effect orchestration.

### 2. URL → search params

Filters, sorting, pagination, the selected tab, the open detail id. The test: *if the user
reloaded or shared this link, should they see the same view?* If yes, it belongs in the URL.
The PR list already does this with `?status` and `?sort`.

This bucket is the one most often missed, and the cost of missing it is a view users cannot
link to.

### 3. Local → `useState` / `useReducer`

Transient UI state: an open dropdown, a hovered row, an in-progress input. Keep it in the
component that uses it. Colocation is not just tidiness — when state lives low in the tree,
React never re-renders the siblings above it.

Reach for `useReducer` when several state values always change together, or when update
logic is spread across many handlers. A reducer is a pure function, testable without
rendering anything.

### 4. Shared → props, then context

Try props first. Prop drilling has a real virtue: the path is visible, so when a prop's shape
changes you can see everyone affected. Reach for context when drilling crosses several layers
that do not care about the value.

Context is dependency injection — theme, active repo, toasts — not a state manager. Every
consumer re-renders on every change, so split by concern and render each provider as deep in
the tree as it can go. Existing examples: `lib/theme.tsx`, `lib/repo-context.tsx`,
`lib/toast.tsx`.

## Derived state

The most common bug in React code, and it has one rule: **if you can calculate it during
render, do not store it.**

```tsx
// Wrong — two sources of truth that drift, plus a wasted second render pass.
const [visible, setVisible] = useState<Finding[]>([]);
useEffect(() => {
  setVisible(findings.filter((f) => f.severity === filter));
}, [findings, filter]);

// Right — one source of truth.
const visible = findings.filter((f) => f.severity === filter);
```

Store `selectedId`, derive `selectedItem`. Reach for `useMemo` only when the computation is
measurably expensive — sorting thousands of rows, not filtering twenty.

Related: model state so illegal combinations cannot be expressed. Replace
`isLoading`/`isError`/`isDone` booleans with a single `status` union; three booleans admit
eight states, five of which are nonsense.

## Validation and contracts

Types vanish at runtime. A response typed as `RunSummary` is a claim about data you have not
checked — the server could return anything.

- Contracts live in `@devdigest/shared` as Zod schemas. The schema and its inferred type
  share one name (`RunSummary`), so there is one thing to import and one thing to change.
- Parse at the boundary, not throughout. Validating in scattered places means some invalid
  input has already been processed by the time you find out. Parsing once, where data enters,
  returns a value the rest of the code can trust without re-checking.
- Remember the two copies: `server/src/vendor/shared/` and `client/src/vendor/shared/` are
  hand-mirrored and must be edited in lock-step.

## Why we stop short of clean architecture

Hexagonal and clean architectures propose a domain layer, ports, adapters, and DTO mapping
between them. They are coherent, and for a large system with several delivery mechanisms
they pay off. We do not use them here, for reasons worth stating so the decision can be
revisited honestly rather than by drift:

- The testability benefit is already bought by pure functions in `helpers.ts` and `lib/`. A
  domain class is not more testable than a pure function.
- The substitutability benefit — swap the data source, swap the UI — is the standard
  justification and almost never exercised in practice.
- Every layer has a cost of carry: indirection that every future reader pays for. That cost
  is only worth it when the complexity it hides is larger than the complexity it adds.

The usual failure mode is mechanical: treating each box in an architecture diagram as a file
to create on day one, which yields fragmentation and boilerplate long before it yields
insight. If this app ever grows several delivery surfaces or a genuinely complex domain,
revisit — but let the complexity arrive first.
