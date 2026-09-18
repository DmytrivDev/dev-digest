# Enforcement

The rules in [SKILL.md](SKILL.md) are only real if a command can fail on them. This is that
command.

```bash
cd server && pnpm arch:check
```

## What it is

[`server/.dependency-cruiser.cjs`](../../../server/.dependency-cruiser.cjs) encodes the ring
boundaries as `forbidden` rules for **dependency-cruiser**, which resolves every import in
`src/` and checks the resulting graph. It was already a dependency (`^17.4.3`) — the repo
uses it as the `DepGraph` adapter for repo-intel — so this adds a config file and two
scripts, no new package.

```json
"arch:check": "depcruise src --config .dependency-cruiser.cjs --output-type err",
"arch:graph": "depcruise src --config .dependency-cruiser.cjs --output-type dot"
```

Run `arch:check` before committing anything under `server/src`, alongside the existing
`pnpm typecheck` + `pnpm test`. `arch:graph` pipes to Graphviz when you want to *see* the
rings rather than read violations.

## Severity policy

This is the part to preserve when you add rules:

- **A rule that is clean today is `error`.** It cannot regress.
- **A rule with pre-existing violations is `warn`**, with the known offenders named in the
  rule's own `comment` and in [SKILL.md](SKILL.md) §5 "Known debt".

`warn` keeps the exit code at 0, so the build stays green while the debt stays visible. It
is not permission — new code must not add to a `warn` rule. **When you fix the last
violation of a `warn` rule, promote it to `error` in the same commit.** That is the ratchet;
without it the warnings become wallpaper.

## Current state

**This section is the single source of truth for the known debt.** [SKILL.md](SKILL.md) §5
names the untrustworthy modules so an agent does not copy them, and deliberately carries no
counts — those live here, next to the command that produces them. Regenerate with
`pnpm arch:check` and update this section in the same commit as any fix.

```
x 20 dependency violations (0 errors, 20 warnings). 151 modules, 466 dependencies cruised.
```

| Rule | Severity | Violations | Ban |
|---|---|---|---|
| `core-not-to-io` | error | 0 | §1 |
| `db-not-to-modules` | error | 0 | — |
| `ports-not-to-implementations` | error | 0 | — |
| `routes-not-to-orm` (+ `-pkg`) | warn | 7 — `pulls`, `polling`, `settings`, `workspace` | 1 |
| `service-not-to-composition-root` | warn | 4 — `repos`, `reviews`, `agents`, `repo-intel` | §4 |
| `service-not-to-adapters` | warn | 2 — `repo-intel` | 2 |
| `no-circular` | warn | 5 | §4 |
| `no-orphans` | warn | 1 — `platform/model-router.ts` | — |

Two further items of debt have **no rule**, because an import graph cannot see them. They
are caught by the §6 review checklist or not at all:

| Debt | Where | Ban |
|---|---|---|
| Repository constructed inside the service | `repos/service.ts:37`, `reviews/service.ts:36` | §4 |
| `RepoRow` exported from the repository | `repos/repository.ts:9` | 3 |

**The cycles are the argument.** Four of the five are `service → container → service`: the
container imports the service to build it, and the service imports the container to reach
its dependencies. That is not an accidental cycle, it is exactly what §4's "inject ports,
not the container" prevents — fix the constructor and four cycles disappear. Anyone who
thinks the rule is bureaucracy should read that line of output first.

The fifth (`agents/helpers.ts ↔ agents/repository.ts`) is the ring-3/ring-1 type-import
knot: the mapper imports `AgentRow` from the repository while the repository imports the
mapper. Moving row types to a shared `rows.ts` breaks it — `db/rows.ts` already exists and is
where they belong.

`no-orphans` flagging `platform/model-router.ts` is a real find, not noise: nothing imports
it.

## Rule shape

```js
{
  name: 'routes-not-to-orm',
  comment: 'Ban 1. A route is a driving adapter: parse, delegate, map the status code…',
  severity: 'warn',            // error | warn | info | ignore
  from: { path: '^src/modules/[^/]+/routes\\.ts$' },
  to:   { path: ['^src/db/schema', '^src/db/client\\.ts$'] },
}
```

`from` and `to` are regexes over **paths relative to the cruise root** (`server/`). npm
packages resolve to their real location, so matching one means matching
`node_modules/<pkg>` — under pnpm that is `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`,
which a substring match like `node_modules/drizzle-orm` still catches.

**Write the `comment` for the person who trips the rule.** It is printed with the violation,
so it is the only documentation they are guaranteed to read. Say which ban it is, why the
arrow points the wrong way, and what to do instead — not just "forbidden".

## Adding a rule

1. Express the ban as *"files matching X must not import files matching Y"*. If you cannot,
   dependency-cruiser cannot check it — put it in the SKILL.md review checklist instead.
2. Add it at `severity: 'ignore'` and run `pnpm arch:check` to see what it catches. A rule
   that fires on 40 files is describing a different architecture than the one we have.
3. Set the severity by the policy above: clean → `error`, pre-existing → `warn` with the
   offenders named.
4. Update the table in this file and, if it is a new ban, §3 and §5 of SKILL.md.

## What this cannot check

dependency-cruiser sees imports. It does not see:

- **`constructor(private container: Container)`** — it only sees the *import* of
  `container.ts`, which is why `service-not-to-composition-root` is written against the
  import. A service that took the container without importing the type would slip through.
- **A Drizzle row type escaping a module** (ban 3) — the type flows through a return
  signature, not an import. Caught by `pnpm typecheck` only if the consumer is in another
  package; otherwise this one is on review.
- **A business rule sitting in the wrong ring** — a `for` loop computing a total inside a
  route is perfectly legal imports-wise. The signal for this one is behavioural: the test
  needs a database. See SKILL.md §1.
- **`reviewer-core` importing `server`** — the config cruises `server/src` only, so this ban
  is currently enforced by reviewer-core's own CLAUDE.md ("Iron rule: No I/O") and by review.
  Making it structural means cruising both packages from the repo root, which the two-lockfile
  layout (server uses pnpm, reviewer-core uses npm) makes messier than it is worth today.

Those four are why SKILL.md §6 has a human checklist as well as a command. The command
catches the mechanical half; the checklist catches the half that needs judgement.
