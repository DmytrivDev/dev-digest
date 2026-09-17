# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson
adds one feature back.

## Before answering
Search the relevant package's `docs/`, `specs/`, `INSIGHTS.md` FIRST — they are
curated and may already answer it — then read code. This applies to every package;
it is not repeated in the per-package files.

## Before commit / push / PR
MANDATORY: read `docs/git-workflow.md` in full before any `git commit`, `git push`,
or opening a Pull Request — no exceptions, including one-line changes. It holds the
course branching rules (feature branch per homework; PR targets **your fork's** `main`,
never upstream; merge each homework PR before branching the next one). Getting the PR
base wrong is not recoverable by editing the PR later.

## Session protocol (engineering-insights loop)
Not optional — all three steps run every session, and two hooks in `.claude/settings.json`
enforce them rather than relying on memory.
- **On every user prompt:** before any other work, determine which package the prompt
  touches and READ that package's `INSIGHTS.md`. Re-read when a later prompt moves to a
  different package. On the first read of a package, summarize the top 3 relevant points
  back — forces an active read, catches a silently-failed load. Never answer from memory
  of a previous turn; never skip because the prompt "looks small".
- **As you go:** hit something non-obvious a future session would relearn → capture it
  then, don't bank it for the end.
- **End of session:** run `/engineering-insights` — mandatory, including when the session
  felt routine. It writes only substantial, file-grounded findings that are NOT already in
  the file; an insight already recorded is skipped, never restated. Nothing substantial
  and new → write nothing, but the check itself is never skipped. Append-only — never
  overwrite an `INSIGHTS.md`. Writes go through
  `.claude/skills/engineering-insights/scripts/append-insight.mjs`, never by hand and never
  with `Write` — the script appends one line, refuses any edit that would drop existing
  content, and skips duplicates.

## Stack
Node ≥22 · pnpm ≥10 · TypeScript ESM · Fastify 5 · Next.js 15 (App Router) /
React 19 · Drizzle + Postgres/pgvector · Zod · vitest

## Commands
- Full stack: `./scripts/dev.sh` (Postgres + API :3001 + web :3000, migrated + seeded)
- Browser e2e: `./scripts/e2e.sh` (isolated stack — never run e2e against the dev DB)
- Per-package commands: see that package's CLAUDE.md
- Checks (run before every commit): `pnpm typecheck` + `pnpm test` in the package
  you touched; DB-backed suites separately (`pnpm exec vitest run .it.test`, needs
  Docker). There is NO linter configured in this repo — don't look for one.

## Map
| Folder | Package | Role |
|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, DB, orchestration |
| `client/` | `@devdigest/web` | Next.js studio |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure engine: diff → prompt → LLM → grounded findings |
| `e2e/` | `@devdigest/e2e` | deterministic browser flows |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod contracts |

`repo-intel` (indexer) lives inside the server: `server/src/modules/repo-intel/`.

## Naming
- Components: `src/components/<PascalCase>/<PascalCase>.tsx` + an `index.ts` barrel;
  route-local ones live in that route's `_components/<PascalCase>/`.
- Tests: colocated `*.test.tsx` next to the component (client) or `server/test/*.test.ts`;
  a DB-backed server test MUST use the `*.it.test.ts` suffix or the CI split breaks.
- Contracts: snake_case on the wire (`cost_usd`, `tokens_in`), camelCase in Drizzle/DB
  code (`costUsd`); the Zod schema and its inferred type share one name (`RunSummary`).
- Migrations: generated names only — `00NN_<slug>.sql` from `pnpm db:generate`.
- `specs/` → `L0N-<feature>.md` · `docs/` → `<topic>.md` (one topic per file).
- i18n: one namespace file per feature area, dot-path keys (`list.columns.cost`).
- Server modules: `server/src/modules/<name>/` with `routes.ts` · `service.ts` ·
  `repository.ts` · `constants.ts` · `helpers.ts` as needed.
- Branches: one `feat/<slug>` per homework — see `docs/git-workflow.md`.

## Conventions (not obvious from code)
- NOT a monorepo workspace — each package has its own package.json/lockfile;
  cross-package code is shared via tsconfig path aliases, not published modules.
- ESM: relative imports carry the `.js` extension.
- Modules are registered statically in `server/src/modules/index.ts` (no autoload).
- `@devdigest/shared` exists as TWO hand-maintained copies
  (`server/src/vendor/shared/`, `client/src/vendor/shared/`) — edit both in lock-step.

## Gotchas
- Migrations are NOT applied on boot → `cd server && pnpm db:migrate`.
- Never `docker compose down -v` to "reset" — it drops the volume with every
  imported repo and review.

## Do-not-touch
- `*/src/vendor/shared/` — hand-edit only in lock-step across both copies.
- `server/src/db/migrations/` — never hand-write SQL; `pnpm db:generate`.
- Lock files — never hand-edit, and always change them with THAT package's manager:
  `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml` (pnpm) ·
  `reviewer-core/package-lock.json`, `e2e/package-lock.json` (npm).

## Use when
- Commit / push / open a PR → `docs/git-workflow.md` (read first, every time)
- Run / architecture / stack overview → `README.md`
- Prompt authoring rules → `docs/agent-prompts/`
- Testing strategy → `TESTING.md`
- End of session → `/engineering-insights`
