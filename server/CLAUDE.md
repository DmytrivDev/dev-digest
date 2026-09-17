# server (@devdigest/api)

Fastify API: imports repos/PRs, indexes with repo-intel, runs the reviewer,
persists findings.

## Stack
Fastify 5 (helmet · cors · rate-limit · fastify-sse-v2) · Drizzle ORM ·
Postgres/pgvector · `fastify-type-provider-zod` · pino · tsx

## Commands
`pnpm dev` (:3001) · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`
· `pnpm typecheck`
- unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- integration only: `pnpm exec vitest run .it.test` (needs Docker)

## Conventions (not obvious from code)
- Multi-tenancy: every domain table has `workspace_id`; queries are scoped by the
  base-repository guard.
- DI via `src/platform/container.ts`: services depend on interfaces
  (`@devdigest/shared`), never classes; tests inject mocks via `ContainerOverrides`.
- repo-intel is reached ONLY through `container.repoIntel.*` — never the pipeline.
- Context enrichment is best-effort: on error/unindexed, omit the section, don't throw.
- Validation is schema-first: routes declare Zod `params`/`body`; no
  `Schema.parse(req.body)` inside handlers.
- New feature = new `modules/<name>/` + one line in `src/modules/index.ts`.
- A DB-backed test MUST use the `*.it.test.ts` suffix or the CI split breaks.

## Gotchas & do-not-touch
- Adding a field to a run: `completeAgentRun`'s shape is declared in TWO places
  (`repository/run.repo.ts` AND `repository.ts`) — both or typecheck fails.
- New column: edit `db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`.
  Never hand-write migration SQL.
- The schema already contains tables for ALL later lessons — empty is expected.
- Secrets live in `~/.devdigest/secrets.json`, never in the DB or git; single read
  chokepoint is `LocalSecretsProvider`.

## Use when
- Route/API map, env vars, request+DI flow → `server/README.md`
- Indexer internals → `server/src/modules/repo-intel/README.md`
- Deep-dives → `server/docs/` · specs/acceptance → `server/specs/`
- Gotchas & findings from past sessions → `server/INSIGHTS.md`
