# Skill routing — which project skill governs which path

The one table `implementation-planner` uses to fill a plan's `Affected surface` → *Skills*
column, and `implementer` / `test-writer` / the reviewers use to know which rules a file is
judged by. A path is governed by every row whose globs match it and whose excludes do not.
When two skills disagree about one file, the higher priority wins.

| Priority | Skill | Globs | Excludes |
|---|---|---|---|
| 10 | `onion-architecture` | `server/src/**/*.ts`, `reviewer-core/src/**/*.ts`, `mcp/src/**/*.ts` | `**/*.test.ts`, `server/src/db/migrations/**`, `server/src/prompts/**`, `server/src/vendor/**` |
| 10 | `frontend-ui-architecture` | `client/src/app/**`, `client/src/components/**`, `client/src/vendor/ui/**`, `client/src/lib/hooks/**`, `client/src/lib/api.ts`, `client/messages/**` | `client/**/*.test.{ts,tsx}` |
| 9 | `security` | `server/src/modules/**/{routes,service}.ts`, `server/src/adapters/**`, `server/src/platform/config.ts`, `server/src/prompts/**`, `reviewer-core/src/prompt.ts`, `reviewer-core/src/llm/**`, `client/src/lib/api.ts`, `mcp/src/**/*.ts`, `.github/workflows/**`, `**/.env*`, `**/package.json`, `.claude/hooks/**`, `scripts/*.mjs` | `**/*.test.ts` |
| 8 | `fastify-best-practices` | `server/src/modules/**/routes.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/platform/{sse,jobs,errors}.ts`, `server/src/modules/_shared/**` | — |
| 8 | `drizzle-orm-patterns` | `server/src/db/{client,rows,schema}.ts`, `server/src/db/schema/**`, `server/src/modules/**/repository.ts`, `server/src/modules/**/repository/**` | `server/src/db/migrations/**` |
| 8 | `next-best-practices` | `client/src/app/**/{page,layout,loading,error,not-found,template,default}.tsx`, `client/src/app/**/route.ts`, `client/next.config.*` | — |
| 7 | `postgresql-table-design` | `server/src/db/schema.ts`, `server/src/db/schema/**`, `server/src/db/migrations/**/*.sql` | — |
| 7 | `react-best-practices` | `client/src/**/*.tsx`, `client/src/lib/hooks/**` | `client/**/*.test.tsx`, `client/src/vendor/**` |
| 6 | `react-testing-library` | `client/**/*.test.{ts,tsx}`, `client/src/test/**`, `client/vitest.config.ts` | — |
| 5 | `zod` | `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | — |
| 4 | `typescript-expert` | `**/tsconfig*.json`, `**/*.d.ts` | — |

**Unrouted by design:** `docs/**`, `**/*.md`, `scripts/*.sh`, `e2e/**`, `*.html`,
`**/INSIGHTS.md`, `**/CLAUDE.md`. An unrouted file is a coverage gap, not a file that
passed — say so rather than letting it look reviewed.

**Standing notes that stop false findings:**
- `onion-architecture` — its SKILL.md §5 *Known debt* lists pre-existing violations (routes
  querying Drizzle in pulls/polling/settings/workspace; services taking the whole
  `Container` in repos/reviews/agents/repo-intel; `repo-intel/service.ts` importing concrete
  adapters). New code does not copy them; they are never reported as new.
- `frontend-ui-architecture` — not linted; surrounding files may already violate it. Only
  added or changed lines are in scope.
- `postgresql-table-design` — migration SQL is generated (`pnpm db:generate`), never edited.
- `zod` — the two `vendor/shared` trees are byte-identical copies
  (`server/test/vendor-shared-sync.test.ts`); a change to one alone is always wrong.
