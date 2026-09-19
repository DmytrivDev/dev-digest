# Routing — which skill reviews which file

Mirror of [routing.json](routing.json), for humans. **If they disagree, `routing.json`
wins** — it is what `collect-diff.mjs` reads. Edit the JSON; update this file to match.

## Why the table is data, not prose

Every other skill in this repo declares its scope in prose. That works when a human reads
it and decides. It does not work here: routing must be **reproducible**, because the same
diff has to produce the same reviewer set on every run. A prose table gets re-interpreted
each time and silently drops a skill on a long diff — and a skill that was never
dispatched is indistinguishable from a skill that found nothing. That is the failure this
whole design exists to prevent.

## The table

| Skill | Prio | Routes on |
|---|---|---|
| `onion-architecture` | 10 | `server/src/**/*.ts`, `reviewer-core/src/**/*.ts` — minus tests, migrations, prompts, vendor |
| `frontend-ui-architecture` | 10 | `client/src/{app,components,vendor/ui,lib/hooks}/**`, `lib/api.ts`, `client/messages/**` — minus tests |
| `security` | 9 | routes, adapters, `platform/config.ts`, prompts, `llm/**`, `lib/api.ts`, workflows, `.env*`, `package.json`, hooks, skill scripts · **or** content: `process.env`, key/secret/token, `dangerouslySetInnerHTML`, `child_process`, `eval(` |
| `fastify-best-practices` | 8 | `modules/**/routes.ts`, `app.ts`, `server.ts`, `platform/{sse,jobs,errors}.ts`, `modules/_shared/**` |
| `drizzle-orm-patterns` | 8 | `db/{client,rows,schema}.ts`, `db/schema/**`, `modules/**/repository*` · **or** content: `from 'drizzle-orm` |
| `next-best-practices` | 8 | App Router file conventions (`page`/`layout`/`route`/…), `next.config.*` · **or** content: `'use client'` / `'use server'` |
| `postgresql-table-design` | 7 | `db/schema.ts`, `db/schema/**`, migration `.sql` |
| `react-best-practices` | 7 | `client/src/**/*.tsx`, `lib/hooks/**` — minus tests and `vendor/**` |
| `react-testing-library` | 6 | `client/**/*.test.tsx`, `client/src/test/**`, `vitest.config.ts` |
| `zod` | 5 | both `vendor/shared` trees · **or** content: `from 'zod'`, `z.<lowercase>` |
| `typescript-expert` | 4 | `tsconfig*.json`, `*.d.ts` only · **or** content: `infer`, `satisfies`, `keyof`, `Omit<`, … |
| `mermaid-diagram` | — | **never** |
| `engineering-insights` | — | **never** |
| `pr-self-review` | — | **never** |

`priority` does two jobs: it orders the fan-out against the 6-subagent cap, and it breaks
ties when two skills flag the same lines.

## The three that never route, and why

- **`mermaid-diagram`** — an authoring skill. It explains how to write a diagram and
  asserts nothing a reviewer could check against a diff.
- **`engineering-insights`** — a session protocol whose instructions are to *write*
  `INSIGHTS.md`. Loading it into a read-only reviewer is a category error: it would tell an
  agent that must not write, to write. It also already runs at session end via its own
  Stop hook.
- **`pr-self-review`** — itself. Its scripts are still covered by the `security` route,
  which globs `.claude/skills/**/scripts/*.mjs`.

They get explicit `routed: false` + `reason` entries rather than being left out, because
**omission is indistinguishable from an oversight**. Phase 5 raises a WARNING for any new
`SKILL.md` with no entry here at all.

## Two scoping decisions worth keeping

**`typescript-expert` gets no broad `**/*.ts` glob.** It would match nearly every diff and
consume the subagent cap ahead of higher-yield reviewers. Path-routed only for
`tsconfig`/`.d.ts`; otherwise it needs a genuine type-level construct in the added lines.
Force it on with `--with typescript-expert`.

**Content triggers only apply to source files** (`.ts .tsx .js .jsx .mjs .cjs .sql .yaml
.json`). This was found the hard way: on the first run a skill's own markdown got routed to
`security` and `typescript-expert`, because the prose contained the word "token" and a
fenced example contained `Omit<`. A regex is a blunt instrument and documentation is full
of the words it looks for.

## Unrouted by design

`docs/**`, `**/*.md`, `scripts/*.sh`, `e2e/**`, `*.html`, `INSIGHTS.md`, `CLAUDE.md` —
excluded from routing outright (`unrouted_paths` in the JSON). They still appear in the
report's Coverage table under *no domain reviewer*, so the gap is visible rather than
hidden behind the exclusion that caused it.
