---
name: onion-architecture
description: "Enforces Onion Architecture in the backend (@devdigest/api, @devdigest/reviewer-core): which ring a file belongs to, the inward-only dependency rule, when a port/interface is justified, where business rules live vs. routes vs. repositories, and how Fastify, Drizzle, Zod and the DI container map onto the rings. Use when adding or moving any server file, creating a module, writing a route/service/repository, introducing an adapter for an external system, placing a business rule, or reviewing a backend PR. Applies to one-file changes — that is how layering erodes."
metadata:
  version: 1.0.0
---

# Onion Architecture (backend)

Answers one question: **which ring does this code belong to, and what is it allowed to
import?**

This codebase is *already* an Onion — it was just never named or enforced. `reviewer-core`
is the pure core (its CLAUDE.md calls it the "Iron rule: No I/O"), `@devdigest/shared`
holds the ports, `server/src/adapters/*` holds the driven adapters, and
`platform/container.ts` is the composition root. This skill names those rings, states the
rule that binds them, and makes it checkable.

Related skills, deliberately not repeated here: `fastify-best-practices` (how to write a
route), `drizzle-orm-patterns` (how to write a query), `zod` (how to write a schema),
`postgresql-table-design` (how to design a table). Those tell you how to write the thing.
This tells you where it goes and what it may touch. Sources for every claim are in
[README.md](README.md).

## The rule

> All code can depend on layers more central, but code cannot depend on layers further out
> from the core. — Jeffrey Palermo, 2008

Stated as an import rule, which is how you actually check it:

**A file may import from its own ring and from rings closer to the core. Never outward.
An inner ring must not name an outer ring's type, class, file or package.**

There is exactly one place where this is broken on purpose: the **composition root**
(`platform/container.ts`), which knows every ring because its whole job is wiring them
together. Nothing else gets that privilege.

## The four rings

| # | Ring | Where it lives | May import |
|---|---|---|---|
| 1 | **Core** — pure rules, no I/O | `reviewer-core/src/**`, `modules/*/`{`cost`,`status`,`findings`,`helpers`}`.ts`, `platform/errors.ts`, `platform/grounding.ts`, `platform/prompt.ts` | ring 1 only (+ `zod`) |
| 2 | **Ports** — technology-neutral interfaces | `vendor/shared/adapters.ts`, `vendor/shared/contracts/**`, `modules/repo-intel/types.ts` | rings 1–2 |
| 3 | **Application** — use cases, orchestration, tenancy | `modules/*/service.ts`, `modules/*/repository.ts`, `modules/_shared/context.ts` | rings 1–3 |
| 4 | **Adapters** — everything technology-specific | `modules/*/routes.ts`, `adapters/**`, `db/**`, `platform/`{`jobs`,`sse`,`config`,`container`}`.ts` | rings 1–4 |

Two things to internalise about this table:

- **`platform/` is not a ring.** It is a grab-bag: `errors.ts` is core (the domain error
  taxonomy, imported by services), `container.ts` is the composition root, `jobs.ts` and
  `sse.ts` are infrastructure. Check the file, not the folder.
- **Ring 4 is the widest and cheapest to change; ring 1 is the narrowest and most stable.**
  If you find yourself widening ring 1's imports to make something compile, you are
  putting the rule in the wrong place.

## Order of decisions

Work outside-in. Each answer constrains the next:

1. **Ring** — does this touch I/O? → §1
2. **Port** — does it cross a process boundary? → §2
3. **Direction** — what may it import? → §3 (the four bans)
4. **Dependencies** — what gets injected? → §4
5. **Shape** — what crosses the module boundary? → [persistence.md](persistence.md)

## 1. Which ring

Ask one question, in this order, and stop at the first yes:

| Question | Ring | Home |
|---|---|---|
| Is it a pure function of its inputs — no db, no fetch, no fs, no clock, no random? | 1 Core | `modules/<name>/<rule>.ts`, or `reviewer-core/` if the CI runner needs it too |
| Is it an interface describing a conversation with something outside the process? | 2 Port | `vendor/shared/adapters.ts` (both copies) |
| Does it orchestrate a use case — several ports, tenancy, a transaction? | 3 Application | `modules/<name>/service.ts` |
| Does it speak a specific technology — HTTP, SQL, Octokit, git, an SDK? | 4 Adapter | `modules/<name>/routes.ts` or `adapters/<tech>/` |

**Default to ring 1 and move outward only when forced.** A rule that starts in a route is
almost never moved later; a rule that starts as a pure function is trivially promoted.

This is not theory here — it is the pattern the codebase already converged on. The PR-list
cost rollup was inline in `pulls/routes.ts` and was pulled out to
[`pulls/cost.ts`](../../../server/src/modules/pulls/cost.ts) *specifically* so it could be
unit-tested without a database; `pulls/status.ts` and `pulls/findings.ts` followed. The
payoff is concrete: [`server/test/pulls-cost.test.ts`](../../../server/test/pulls-cost.test.ts)
runs with no Docker, while the same logic left in the route would have needed an
`.it.test.ts`.

> **Ring 1 is the test-speed ring.** If a rule needs Postgres to test, it is in the wrong
> ring. That is the cheapest signal you have that the layering slipped, and it shows up
> before review does.

## 2. When a port is justified

A port is an interface in `@devdigest/shared` that an adapter implements and a service
depends on. Ports are not free — each one is a second definition to keep in sync, in a
package that is **vendored as two hand-maintained copies** (`server/src/vendor/shared/`
and `client/src/vendor/shared/`), so a new port means editing both in lock-step.

Write a port when **at least one** holds:

- it crosses a **process boundary** — network, disk, subprocess, another machine
  (`GitHubClient`, `GitClient`, `LLMProvider`, `Embedder`, `CodeIndex`, `SecretsProvider`)
- a **test must substitute it** to stay fast or deterministic (that is what
  `ContainerOverrides` exists for)
- there are genuinely **two implementations** (`LLMProvider` → openai / anthropic /
  openrouter)

Do **not** write a port for an internal helper, a single-implementation class with no test
substitution need, or "in case we swap it later". Victor Rentea's rule applies: question
any interface with a single implementation in the same module. An unjustified port is pure
indirection — the Middle Man smell, not an abstraction.

**Naming and shape:** a port describes the *conversation*, not the library. `GitHubClient`
lists PRs; it does not expose Octokit's request object. If the port's method signatures
mention a vendor type, the abstraction has already failed — the whole point is that ring 3
never learns which SDK is underneath.

See [ports-and-adapters.md](ports-and-adapters.md) for the adapter side and the container.

## 3. The four bans

Each is an inward-only violation, each is mechanically checkable, and each already has at
least one instance in the repo (§5).

**Ban 1 — a route must not import `drizzle-orm` or `db/schema`.**
A route is a driving adapter: parse, delegate, map the status code. SQL in a route skips
rings 3 and 2 entirely, which means the rule cannot be unit-tested and tenancy scoping is
re-implemented per endpoint. `repos/routes.ts` states the contract correctly in its own
header comment: "Transport layer only: parses requests, maps status codes, and delegates
all business logic to RepoService."

**Ban 2 — a service must not import a concrete adapter.**
`service.ts` imports the *type* from `@devdigest/shared`, never
`../../adapters/github/octokit.js`. Instances arrive through the constructor. This is the
Dependency Inversion half of Onion; without it the ring-3 → ring-4 arrow points outward and
nothing above the adapter is testable.

**Ban 3 — a Drizzle row type must not leave its module.**
`typeof t.repos.$inferSelect` is a persistence shape. It may be the repository's internal
currency and may be passed to a mapper, but what crosses the module boundary is the DTO
(`toRepoDto` in [`repos/helpers.ts`](../../../server/src/modules/repos/helpers.ts)). Leak it
and every consumer is coupled to the column layout — and to camelCase, when the wire
contract is snake_case. Details in [persistence.md](persistence.md).

**Ban 4 — `reviewer-core` must not import from `server`.**
The core has no I/O and no server dependency, because the same code runs in the studio and
in CI. This one is already enforced socially by reviewer-core's CLAUDE.md; `arch:check`
makes it structural.

## 4. Inject ports, not the container

A service's constructor is its dependency declaration. Make it name what it actually needs:

```ts
// ring 3 — depends on ring 2 types only
export class RepoService {
  constructor(
    private readonly repos: RepoRepository,
    private readonly git: GitClient,          // port, from @devdigest/shared
    private readonly secrets: SecretsProvider, // port
    private readonly jobs: JobRunner,
  ) {}
}
```

not:

```ts
// ring 3 depending on the composition root — the arrow points outward
constructor(private container: Container) {
  this.repo = new RepoRepository(container.db); // and constructs its own collaborator
}
```

Taking the whole `Container` looks convenient and costs three things: the service now
depends on the composition root (ring 4), its real dependencies are invisible in the
signature, and a unit test must build a container instead of passing two fakes. The
`new RepoRepository(...)` inside the constructor compounds it — the collaborator can no
longer be substituted at all.

**Where the wiring goes:** `container.ts`. It already does this correctly for
`agentsRepo` and `reviewRepo`, with the reasoning written in place — "Constructed here, in
the composition root, so consuming modules use `container.agentsRepo` instead of reaching
into another module's folder." Extend that pattern; do not invent a second one.

**Routes stay the assembly point for their module.** `routes.ts` is ring 4, so it is
allowed to read `app.container` and hand the pieces to the service constructor. That is the
one place the container is legitimately touched outside itself.

## 5. Known debt (do not copy these)

**Do not learn this architecture by reading neighbouring code.** Parts of the server predate
this skill and violate it. Copying the file next to yours is the single most likely way to
add a new violation.

The modules to distrust, and what is wrong with them:

- **`pulls`, `polling`, `settings`, `workspace`** — their `routes.ts` queries Drizzle
  directly (ban 1)
- **`repos`, `reviews`, `agents`, `repo-intel`** — their `service.ts` takes the whole
  `Container` and constructs its own repository (§4)
- **`repo-intel/service.ts`** — also imports concrete adapters (ban 2)

The rule is **new code does not do this; existing code migrates when you are already
touching it.** These are reported at `warn`, so they are visible without breaking the build.

`pulls/routes.ts` is the worst offender and the best illustration: it queries `t.repos`
inline, calls GitHub, and then — correctly — hands the rows to three pure ring-1 functions.
Half the module already follows the rule. The half that doesn't is the half that needs
Docker to test.

**The live inventory — which rules fire, how many times, and on what — is
[enforcement.md](enforcement.md#current-state), not here.** It is regenerated from
`pnpm arch:check`, so it changes whenever anyone fixes anything; keeping a second copy in
this file would only drift.

## 6. Checking

```bash
cd server && pnpm arch:check
```

Runs dependency-cruiser against `.dependency-cruiser.cjs`, which encodes the four bans as
`forbidden` rules. Run it before committing anything under `server/src`, alongside the
existing `pnpm typecheck` + `pnpm test`. Setup, rule config and how to add a rule:
[enforcement.md](enforcement.md).

Review checklist, in the order violations actually appear:

1. Does any new `routes.ts` import `drizzle-orm` or `db/schema`? → ban 1
2. Does any new `service.ts` import from `adapters/`? → ban 2
3. Does a new constructor take `Container`? → §4
4. Does a repository method's return type escape the module? → ban 3
5. Does a new rule need a database to test? → §1, it is in the wrong ring
6. Does a new interface have one implementation and no test substituting it? → §2, delete it

## Where the sources disagree

Marked **[choice]** — we picked a side for consistency, not because the other is wrong.
Full discussion in [README.md](README.md).

- **[choice] Four rings, not three or five.** Allegro Tech calls a five-layer split with
  separate Repository and Service layers over-engineering and recommends three. We keep
  four because ports physically live in a separate vendored package here — collapsing them
  into "application" would hide the one boundary that is hardest to get right.
- **[choice] Repositories stay, for tenancy — not for swapping the database.** Jay
  Freestone argues a typed query builder like Drizzle makes repositories "a worse interface
  over your database", and that database-swapping is a myth. Largely true. Our repositories
  earn their keep for two other reasons: they are the chokepoint where `workspace_id`
  scoping is guaranteed, and they let ring-1 rules be tested without Docker.
- **[choice] No separate persistence model.** Rentea: maintaining domain entities *and* ORM
  entities quadruples CRUD code and teams regret it within two years. We map at the module
  boundary (DTO) and nowhere else. Drizzle rows are the in-module currency.
- **[choice] Thin controllers are accepted here.** Rentea calls one-line controllers
  boilerplate. In our case routes are not one-liners — they own Zod schema declaration,
  tenancy resolution and status-code mapping — so the layer pays for itself.

## Reference files

- [ports-and-adapters.md](ports-and-adapters.md) — ports, adapters, the container, testing with `ContainerOverrides`
- [persistence.md](persistence.md) — repositories, DTO mapping, transaction boundaries, the transitive-tenancy invariant
- [transport.md](transport.md) — routes as driving adapters, Zod at the boundary, errors, jobs and SSE
- [enforcement.md](enforcement.md) — `.dependency-cruiser.cjs`, `pnpm arch:check`, adding rules
- [README.md](README.md) — every source, and where they contradict each other
