# Deterministic checks

Run only for packages in `plan.packages_touched`. Record every result in
`.devdigest/cache/pr-self-review/checks.json` — a check you did not record is a check the
report cannot show, and `gate.mjs` turns a missing blocking result into INCOMPLETE rather
than assuming it passed.

This repo is **not a monorepo workspace**: there is no root `package.json`, and each
package carries its own lockfile and its own manager. Using the wrong one rewrites a
lockfile nobody else can install from.

| Package | Manager | Typecheck | Tests |
|---|---|---|---|
| `server/` | pnpm | `pnpm typecheck` | `pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| `client/` | pnpm | `pnpm typecheck` | `pnpm test` |
| `reviewer-core/` | **npm** | `npm run typecheck` | `npm test` |
| `e2e/` | **npm** | `npm run typecheck` | **never** — see below |
| `mcp/` | pnpm | `pnpm typecheck` | `pnpm test` |

## Blocking

| id | Command / rule | Notes |
|---|---|---|
| `<pkg>:typecheck` | the table above | Non-zero exit ⇒ CRITICAL, and the fan-out is **skipped**. |
| `server:arch` | `cd server && pnpm arch:check` | **Probe first.** Record `unavailable` if the script or `.dependency-cruiser.cjs` is missing. |
| `mcp:arch` | `cd mcp && pnpm arch:check` | Committed with the package; all rules are `error` (no legacy debt), so any violation is new. |
| `server:vendor-shared-sync` | `cd server && pnpm exec vitest run test/vendor-shared-sync.test.ts` | Only when the diff touches either `vendor/shared` tree. |

The mechanical rules — migrations, lockfiles, branch, test naming, unrouted new skills —
are derived by `gate.mjs` from `plan.mechanical`. You do not run anything for those.

## Advisory — reported, never blocking

| id | Note |
|---|---|
| `<pkg>:test` | Failures are reported prominently and still do not block. |
| `server:integration` | `pnpm exec vitest run .it.test` needs Docker. No Docker ⇒ `skipped`, never `fail`. |
| `e2e:test` | **Never run it.** |

## Why `e2e`'s `test` is never run

`e2e`'s `test` script is `tsx run.ts` — a live browser runner expecting the whole stack
already up (API :3001, web :3000, a migrated and seeded Postgres). Following CLAUDE.md's
"`pnpm test` in the package you touched" literally here hangs or fails on connection, and
the failure looks like a broken test rather than a missing stack.

To actually run the flows: `cd e2e && npm run e2e:hermetic`, which brings up its own
isolated stack on alternate ports and tears it down. Record `e2e:test` as
`skipped — requires ./scripts/e2e.sh`.

## Why `arch:check` is probed, not assumed

It is **not committed**: `git show HEAD:server/package.json` has no `arch:check` script and
`git ls-files server/.dependency-cruiser.cjs` returns nothing. Both exist only as local
work on some machines. A gate that hard-fails when a teammate lacks them is a gate that
gets disabled.

It also needs no baseline. `--output-type err` exits non-zero only on `error`-severity
rules, and every current violation (20 of them) is `warn`. Recording a warning count here
would duplicate `onion-architecture/enforcement.md#current-state`, which that skill
explicitly warns "would only drift".

## Why tests never block

`server/test/indexer-pipeline.test.ts` fails 6 tests on any clean Windows checkout — a
path-splitting bug in the test's own `writeFileAt` helper, verified against plain
`origin/main`. They are listed in [baseline.json](baseline.json). A gate red on a fresh
clone is a gate the team learns to ignore, and that failure mode kills quality gates far
more reliably than a missed bug does.

Any *other* failing test is reported as a prominent WARNING with the line: this does not
block the PR and almost certainly should be fixed anyway.
