# Next.js App Router Architecture

Detail behind §6 of [SKILL.md](SKILL.md). This is about **architecture** — where code lives
and which environment it runs in. For file-convention mechanics (which special file does
what, async `params`, runtime selection) see the separate `next-best-practices` skill.

## Contents

- [Where this repo actually stands](#where-this-repo-actually-stands)
- [The boundary: two rules](#the-boundary-two-rules)
- [Ownership, not nesting](#ownership-not-nesting)
- [Placing `'use client'`](#placing-use-client)
- [Crossing the boundary safely](#crossing-the-boundary-safely)
- [Route organization](#route-organization)
- [Layouts vs templates](#layouts-vs-templates)
- [Parallel routes: the authorization trap](#parallel-routes-the-authorization-trap)
- [Server-side data: the Data Access Layer](#server-side-data-the-data-access-layer)
- [Server Actions vs Route Handlers](#server-actions-vs-route-handlers)

## Where this repo actually stands

**54 of 116 `.tsx` files carry `'use client'`, including page components.** DevDigest uses
the App Router for routing, layouts and route groups, while rendering and data fetching
happen on the client through TanStack Query against the Fastify API at `:3001`.

That is a legitimate architecture, not an accident: the API is a separate service, so the
"Server Component reads the database directly" advantage does not apply here. The sections
below on the Data Access Layer and Server Actions describe patterns you will meet in Next.js
documentation and other codebases — read them so you recognize the shape, but **do not
migrate this app toward them in passing.** Converting a page to a Server Component changes
its data fetching, its hooks, and its tests all at once; that is a deliberate project, not a
drive-by cleanup.

What *is* in scope for everyday work: keeping pages thin, keeping `'use client'` at sensible
entry points, and using route groups and private folders correctly.

## The boundary: two rules

Everything about Server and Client Components follows from two sentences:

1. **Code crosses the boundary through imports.** Marking a module `'use client'` makes that
   module *and all of its transitive imports* part of the client graph. The client graph
   never imports the server graph.
2. **Data crosses the boundary through props.** A Client Component receives serialized
   props, not server code. Primitives, plain objects, arrays, `Date`, JSX and Promises
   serialize; class instances and non-exported functions do not.

## Ownership, not nesting

The rule people misremember is "a Client Component cannot contain a Server Component." What
is actually true is subtler and more useful:

> A Client Component can be the **parent** of a Server Component, but never its **owner**.

*Owner* means the component that creates the element. If a Client Component `import`s a
Server Component and renders `<ServerThing />`, it owns it — impossible. If a Server
Component creates `<ServerThing />` and passes it *into* a Client Component as `children`,
the Client Component is merely the parent, and it works:

```tsx
// app/page.tsx — a Server Component owns both
export default function Page() {
  return (
    <ClientModal>          {/* client: holds open/closed state */}
      <ServerContent />    {/* server: rendered on the server, passed as children */}
    </ClientModal>
  );
}
```

The reason for the restriction is mechanical: Server Components render once and never
re-render. A Client parent that re-renders could not hand new props to a Server child —
there is nothing left running to produce new output. Passing the already-rendered output as
`children` sidesteps this, because that output is static data the client simply places.

This is why **providers must be Client Components**: Server Components cannot create
context. Render each provider as deep in the tree as it can go, wrapping `{children}` rather
than the whole document.

## Placing `'use client'`

The directive marks an **entry point**, not a per-file annotation. Two consequences:

- You do not need it on every file in a client subtree. A module imported by a
  `'use client'` module is already a client module; adding the directive there does nothing.
- Placing it too high drags everything below into the client bundle. Push it toward the
  leaves: extract the part that genuinely needs state or an event handler into its own small
  component and mark only that.

It must be the first thing in the file, above all imports.

## Crossing the boundary safely

Three traps worth knowing before you hit them:

**Compound components break.** A `Menu` with static properties (`Menu.Item = Item`) loses
them across the boundary — `Menu.Item` arrives as `undefined`. Export named components
instead: `export { Menu, MenuItem }`.

**Function props need the right name.** A function passed across the boundary must be named
`action` or end in `Action` for the TypeScript plugin to accept it, because such a function
is a Server Function reference rather than an ordinary callback.

**Layouts cannot pass data to `children`.** This is a hard framework constraint, not a style
preference. Layouts also do not re-render on navigation, so they cannot read `pathname` or
`searchParams` — those would be stale. Anything route-aware (active nav link, breadcrumbs)
must live in a Client Component leaf that the layout renders.

## Route organization

**Private folders** — `_components`, `_lib`. The `_` prefix opts the folder and all its
subfolders out of routing. Strictly speaking they are optional, since a folder without
`page.tsx` or `route.ts` is not routable anyway. They are still worth using: they state the
intent, they group route-local code visibly, and they prevent a future Next.js file
convention from colliding with a folder name.

**Route groups** — `(group)`. Organizational only; the name never appears in the URL. Three
legitimate uses: grouping routes by concern or team, defining multiple root layouts, and
opting a subset of routes into a shared layout.

One constraint that bites during refactors: **routes in different groups must not resolve to
the same URL path.** `(marketing)/about/page.tsx` and `(shop)/about/page.tsx` both claim
`/about` — that is a build error, not a silent precedence rule.

**Intercepting routes** — `(.)`, `(..)`, `(...)`. These count **route segments**, not
filesystem folders, and they ignore `@slot` folders when counting. Their architectural value
is solving all four modal problems at once: the modal has a shareable URL, a refresh shows
the full page, Back closes it, and Forward reopens it.

## Layouts vs templates

The distinction is **persistence versus identity**:

- `layout.tsx` persists across navigation within its segment. State in it survives; a
  Suspense boundary inside it shows its fallback only on first load.
- `template.tsx` gets a fresh key on every navigation, so child Client Components remount
  and reset their state, effects re-run, and Suspense fallbacks show every time.

Reach for a template when you specifically want that reset — a per-page enter animation, or
an effect that must re-fire on each navigation. Otherwise use a layout.

Avoid uncached data fetching directly in a layout: a top-level `await` there holds
`{children}` behind it and blocks `loading.tsx` from showing. Move the fetch into the page,
or wrap the fetching part in its own `<Suspense>`.

## Parallel routes: the authorization trap

Slots (`@folder`) are passed to the shared parent layout as props. They are not route
segments and do not affect the URL, and each streams independently with its own `error` and
`loading` boundaries — which makes them a real isolation seam.

The trap is worth stating loudly, because it looks like working code:

> With conditional slots, **both slots render on the server regardless of which one the
> layout returns.** An `@admin/page.tsx` executes its data fetches for every user, even when
> the layout renders `@user` instead.

Deciding which slot to *display* is not an authorization check. The check has to happen
inside the slot, or in whatever layer loads its data.

Two more constraints: if one slot at a level is dynamic, all of them must be; and an
unmatched slot needs a `default.tsx` or a hard navigation 404s.

## Server-side data: the Data Access Layer

This is the pattern Next.js recommends for apps that read their own database. **DevDigest
does not use it** — data comes from the Fastify API through `lib/api.ts` — but you will meet
it constantly in documentation, and the security reasoning transfers.

Three mutually exclusive models exist, and mixing them is itself the hazard, because an
exception stops looking suspicious once exceptions are normal:

1. **HTTP APIs** — a separate backend owns authorization. *This is DevDigest's model.*
2. **Data Access Layer** — a `server-only` module that performs authorization and returns
   minimal DTOs. Recommended for new full-stack Next.js apps.
3. **Component-level data access** — querying the database straight from components.
   Explicitly for prototyping only.

A DAL has exactly three properties: it runs only on the server, it performs the
authorization check itself, and it returns the minimum the UI needs rather than raw rows.
Two corollaries that catch people out: only the DAL should read `process.env`, and
authorization must be re-read (`cookies()`, session) at each data access rather than passed
down as a prop — a prop is a claim, not a check.

**A page-level auth check does not protect the Server Actions defined on that page.** Each
entry point defends itself.

## Server Actions vs Route Handlers

`'use server'` does **not** mark a Server Component — a very common confusion. It marks a
function as callable from the client, which means:

> Every exported Server Action is a public HTTP endpoint. Its arguments are fully
> client-controlled.

So render-time gating is not a security boundary, and schema validation is not
authorization: a perfectly well-formed `Item` object can still reference a row the caller
does not own. The safe shape is to send an **id plus the change**, then re-read everything
else from a trusted source.

Choose by intent:

- **Server Action** — mutations. Note they are dispatched **one at a time per client**, so
  they are the wrong tool for reads and must not be fired in parallel.
- **Route Handler** — when you need a real HTTP endpoint: a public API for several clients, a
  proxy to an existing backend, webhooks, custom auth, or non-mutation requests.
- **Neither** — if the data is only used inside your own app and you render on the server,
  read it directly. Fetching your own Route Handler from a Server Component adds a pointless
  round trip and fails at build time, when no server is listening.

When you genuinely need both an action and a route, put the logic in a shared module and
have both call it, so the authorization check exists once.
