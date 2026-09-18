# onion-architecture — sources and rationale

**Version 1.0.0** · research conducted 2026-09-18

Every source behind [SKILL.md](SKILL.md) and its reference files, and — more usefully — the
places where respected sources **contradict each other**, with the side this skill picked
and why.

URLs marked ✓ were fetched and confirmed reachable during research. Unmarked ones came back
in search results with matching titles but were not opened individually.

## Contents

- [Why this skill exists](#why-this-skill-exists)
- [Sources](#sources)
  - [1. The originals](#1-the-originals)
  - [2. Criticism and limits](#2-criticism-and-limits)
  - [3. Node / TypeScript applications](#3-node--typescript-applications)
  - [4. Fastify — the driving side](#4-fastify--the-driving-side)
  - [5. Drizzle and persistence](#5-drizzle-and-persistence)
  - [6. Boundary enforcement tooling](#6-boundary-enforcement-tooling)
- [Where the sources disagree](#where-the-sources-disagree)
- [What came from the codebase, not the literature](#what-came-from-the-codebase-not-the-literature)
- [Changelog](#changelog)

## Why this skill exists

The backend already had the shape and none of the vocabulary. `reviewer-core/CLAUDE.md`
declares an "Iron rule: No I/O", `vendor/shared/adapters.ts` says "ALL external calls go
behind these interfaces", `container.ts` says "Services depend on these interfaces, not the
concrete classes", and `repos/routes.ts` says "Transport layer only". Four files
independently describing four rings of an Onion, with no shared name and nothing checking
any of it.

The existing backend skills (`fastify-best-practices`, `drizzle-orm-patterns`,
`postgresql-table-design`, `zod`) are all *how to write the thing* references. None of them
answers "where does this go and what may it import", so that question was being answered
from memory — and inconsistently, as the 20 violations in
[enforcement.md](enforcement.md) show.

## Sources

### 1. The originals

| Title | URL |
|---|---|
| ✓ The Onion Architecture : part 1 — Jeffrey Palermo (2008) | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/ |
| Onion Architecture tag (parts 2–4) | https://jeffreypalermo.com/tag/onion-architecture/ |
| ✓ Hexagonal Architecture — Alistair Cockburn | https://alistair.cockburn.us/hexagonal-architecture/ |
| The Clean Architecture — Robert C. Martin | https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html |
| ✓ Onion Architecture — Herberto Graça | https://herbertograca.com/2017/09/21/onion-architecture/ |
| Onion Architecture — Herberto Graça (Medium mirror) | https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85 |
| Original Onion reference implementation (CodeCampServer fork) | https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture |
| Sliced Onion Architecture — Oliver Drotbohm | http://odrotbohm.github.io/2023/07/sliced-onion-architecture/ |

Supplies the rule quoted verbatim in SKILL.md — "all code can depend on layers more central,
but code cannot depend on layers further out from the core" — plus "The database is not the
center. It is external", and the honest scope limit: **"This architecture is not appropriate
for small websites."**

Cockburn supplies the port/adapter definitions and the **driving vs driven** split used in
[ports-and-adapters.md](ports-and-adapters.md), including the framing that a port is "a
purposeful conversation" rather than a wrapper around a library.

Martin supplies the strictest phrasing of the rule, which is the one worth memorising: the
name of something declared in an outer circle **must not be mentioned** by code in an inner
circle. Not "should not be coupled to" — must not be *named*.

Graça supplies the answer to "why Onion and not just Hexagonal": Hexagonal has two rings
(inside / outside) and leaves the inside unorganised; Onion's contribution is adding
internal structure to the business logic itself.

### 2. Criticism and limits

| Title | URL |
|---|---|
| ✓ Overengineering in Onion/Hexagonal Architectures — Victor Rentea | https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/ |
| ✓ Onion Architecture — Allegro Tech | https://blog.allegro.tech/2023/02/onion-architecture.html |
| ✓ You might not need… the repository pattern — Jay Freestone | https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b |
| Anemic domain model — Wikipedia | https://en.wikipedia.org/wiki/Anemic_domain_model |
| Onion Architecture: Going Beyond Layers — NDepend | https://blog.ndepend.com/onion-architecture-layers/ |

**These mattered more than the originals.** Onion is easy to cargo-cult into a folder
structure with no benefit, and every **[choice]** in SKILL.md is a place where this skill
deliberately does less than the canonical version.

Rentea supplies the six over-engineering symptoms, three of which shaped rules here:
"Question any interface with a single implementation, in the same module" (SKILL.md §2);
strict pass-through layers as the Middle Man smell; and separate persistence models
quadrupling CRUD code, which teams regret within one to two years
([persistence.md](persistence.md)).

Allegro supplies the three-layer "Simplified Onion" and calls a five-layer split with
separate Repository and Service layers over-engineering. It also supplies the anemic-domain
criticism — if all behaviour lives in services and entities are data carriers, you have paid
for structure and bought nothing.

Freestone supplies the sharpest case against our own repository layer: with a typed query
builder, a repository accreting `findActiveById` / `getWithProduct` / `listByFilter(opts)`
becomes "a worse interface over your database"; "if your data changes then your entire
problem changes" kills the database-swapping justification; and stubbing repositories
"provides zero confidence anything works" for CRUD. He concedes repositories when you
genuinely enforce invariants at aggregate boundaries — which we do not.

### 3. Node / TypeScript applications

| Title | URL |
|---|---|
| ✓ The Dependency Rule — Khalil Stemmler | https://khalilstemmler.com/wiki/dependency-rule/ |
| Repository, DTO and Mapper in TypeScript — Khalil Stemmler | https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/ |
| node-typescript-architecture — jbreckmckye | https://github.com/jbreckmckye/node-typescript-architecture |
| Hexagonal architecture — overview and best practices (The Software House) | https://tsh.io/blog/hexagonal-architecture |
| Future-Proof Your Code: Ports & Adapters — Alex Rusin | https://blog.alexrusin.com/future-proof-your-code-a-guide-to-ports-adapters-hexagonal-architecture/ |
| Designing the infrastructure persistence layer — Microsoft Learn | https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design |

Stemmler supplies the TypeScript-specific phrasing of the three-ring dependency rule and the
DTO/mapper boundary. jbreckmckye is the closest reference implementation to our style —
ports and adapters with plain functions and closures, no class hierarchy, no DI framework —
and is the reason SKILL.md §4 shows a constructor rather than a decorator-based container.
Microsoft Learn supplies the rule reused verbatim in [persistence.md](persistence.md): the
**service owns the transaction boundary**, the repository does not know it is in one.

### 4. Fastify — the driving side

| Title | URL |
|---|---|
| ✓ Encapsulation — Fastify | https://fastify.dev/docs/latest/Reference/Encapsulation/ |
| The hitchhiker's guide to plugins — Fastify | https://fastify.dev/docs/latest/Guides/Plugins-Guide/ |
| Type Providers — Fastify | https://fastify.dev/docs/latest/Reference/Type-Providers/ |
| fastify-type-provider-zod | https://github.com/turkerdev/fastify-type-provider-zod |
| Fastify plugins as building blocks for a backend Node.js API — Snyk | https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/ |
| node-fastify-architecture — sujeet-agrahari | https://github.com/sujeet-agrahari/node-fastify-architecture |
| Zod — docs | https://zod.dev/ |

Supplies the encapsulation model that makes a Fastify module a natural ring-4 unit: an
encapsulation context governs which decorators, hooks and plugins a route can see, children
inherit from parents, siblings are isolated, and `fastify-plugin` is the deliberate escape
hatch. That is why `app.decorate('container', …)` at the root is the right way to expose the
composition root and why `withTypeProvider<ZodTypeProvider>()` is opted into per module.

Zod + the type provider supply the "parse once, at the edge" rule in
[transport.md](transport.md): `validatorCompiler` / `serializerCompiler` are set once in
`app.ts`, schemas are declared on the route, and inner rings may assume validated input.

**Caveat carried forward:** the Fastify community's own reference structures (Snyk,
sujeet-agrahari) put "all the endpoints and business logic" in `routes/`. That is the
opposite of ban 1. Noted and rejected — see below.

### 5. Drizzle and persistence

| Title | URL |
|---|---|
| ✓ Transactions — Drizzle ORM | https://orm.drizzle.team/docs/transactions |
| Drizzle ORM Best Practices — Paul Serban | https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/ |
| Repository Pattern in Nest.js with Drizzle ORM — vimulatus | https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae |
| Proposal: Implicit Transaction Context in Drizzle (discussion #2777) | https://github.com/drizzle-team/drizzle-orm/discussions/2777 |
| Transactions with DDD and the Repository Pattern in TypeScript, part 2 | https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901 |

The Drizzle docs confirm the fact [persistence.md](persistence.md) leans on: **`tx` has the
same interface as `db`** (`tx.select`, `tx.insert`, `tx.query`, `tx.rollback`), which is what
makes "pass the handle into the repository" cheap rather than a type-gymnastics exercise.

Discussion #2777 confirms there is **no implicit/ambient transaction context** in Drizzle —
no `@Transactional` equivalent. That is framed in the skill as a feature: the boundary stays
visible in the signature.

Serban supplies the framing reused in SKILL.md — "service layer defines business intent while
the repository pins down table shapes, reusable fragments, and transaction boundaries" — and
the warning that a repository returning query builders or DB error types has leaked
persistence into the domain anyway.

### 6. Boundary enforcement tooling

| Title | URL |
|---|---|
| ✓ dependency-cruiser — rules reference | https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md |
| Taking Frontend Architecture Serious With Dependency-cruiser — Xebia | https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/ |
| Dependency Cruiser: Restrict Imports in JavaScript — Atomic Object | https://spin.atomicobject.com/dependency-cruiser-imports/ |
| Avoid Cross Module Dependencies with Dependency Cruiser — Jakub Andrzejewski | https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b |

Supplies the `{ name, comment, severity, from, to }` rule shape and the `forbidden`-list
approach: guardrails against known-dangerous combinations rather than an exhaustive allowlist.
Atomic Object supplies the point that `severity: "error"` makes reporters return a non-zero
exit code, which is what turns this from documentation into a gate — and is why the
`warn → error` ratchet in [enforcement.md](enforcement.md) is worth spelling out.

## Where the sources disagree

Four real conflicts. Each resolution is marked **[choice]** in SKILL.md.

**1. How many rings.** Palermo draws many; Allegro says five is over-engineering and
recommends three; Cockburn says two. **We use four.** Ports are a physically separate
package here (`@devdigest/shared`, vendored twice), so folding them into "application" would
erase the boundary that is hardest to get right and easiest to violate silently. This is a
fact about our repo, not a claim that four is generally correct.

**2. Whether repositories are worth it.** Freestone says mostly no with a modern query
builder; Stemmler and Microsoft say yes. **Kept, for reasons neither source gives.** Our
repositories are not domain abstractions and are not about swapping Postgres. They are the
`workspace_id` chokepoint — load-bearing because `findings` has no `workspace_id` at all and
inherits tenancy transitively through `reviews` — and they are what lets ring-1 rules be
tested without Docker. A repository serving neither purpose is dead weight and should be
deleted.

**3. Interfaces with one implementation.** Palermo and Clean Architecture push interfaces at
every boundary; Rentea says question every single-implementation interface. **Rentea wins,
with two named exceptions:** a port is justified if it crosses a process boundary, or if a
test must substitute it. That second clause is why `SecretsProvider` and `AuthProvider`
survive despite having one implementation each — `ContainerOverrides` is the reason they
exist, and it is a real reason, not a speculative one.

**4. Where business logic lives in Fastify.** The Fastify ecosystem's own guides say routes
contain "all the endpoints and business logic". Onion says the opposite. **Onion wins, on
evidence from this repo rather than authority.** The PR-list cost rule was inline in
`pulls/routes.ts`, was extracted to `pulls/cost.ts`, and gained unit coverage in
`server/test/pulls-cost.test.ts` that requires no Docker. The four modules that still query
in the route are the four that cannot be tested that way. The experiment was already run
here; the skill just records the result.

One more, not a disagreement but a limit worth stating: Palermo says Onion "is not
appropriate for small websites" and Allegro says the same about CRUD-shaped domains. Parts
of this API *are* CRUD — `settings` and `workspace` are thin reads. **Ban 1 still applies to
them** (a route querying tables is how the pattern erodes), but nobody should invent a
domain service for a two-field settings read. Thin is fine; misplaced is not.

## What came from the codebase, not the literature

Load-bearing rules with no external source, derived from `server/INSIGHTS.md` and the code:

- **The transitive-tenancy invariant** — `findings` has no `workspace_id`; its only FK is
  `review_id`. A findings query is safe only when its `review_id IN (…)` list came from an
  already-scoped read. This is the single strongest argument in the repo for keeping a
  persistence chokepoint.
- **The `.it.test.ts` suffix is mandatory** for DB-backed tests or the CI unit/integration
  split breaks. This is what makes "which ring is it in?" a question with a mechanical
  answer: if the test needs Docker, it is ring 3 or 4.
- **`@devdigest/shared` is vendored twice** and hand-synced, which raises the cost of a new
  port and is why SKILL.md §2 asks you to justify one.
- **A failed job kills the API process** — `enqueue`'s `done` promise is never awaited, so
  the rejection is unhandled. Flagged in [transport.md](transport.md) because every new
  `enqueue` call site inherits it.
- **4 of 5 import cycles are `service → container → service`** — discovered by running the
  new config. Pre-existing, invisible until something measured it, and the most persuasive
  single argument for §4.

## Changelog

**1.0.0** — 2026-09-18. Initial skill: four rings, four bans, the port justification test,
persistence/transport/enforcement references, and `.dependency-cruiser.cjs` +
`pnpm arch:check` with the current 20 violations recorded as known debt.
