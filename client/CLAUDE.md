# client (@devdigest/web)

The DevDigest studio: repos, PRs, reviews, agent editor.

## Stack
Next.js 15 App Router · React 19 · TanStack Query · next-intl · recharts ·
mermaid · react-markdown · vitest + jsdom

## Commands
`pnpm dev` (:3000) · `pnpm build` · `pnpm test` (fetch mocked — no API needed)
· `pnpm typecheck`

## Conventions (not obvious from code)
- Types/contracts come from `@devdigest/shared` (Zod) — never hand-duplicate.
- ALL API access goes through `src/lib/api.ts`; every data hook lives in
  `src/lib/hooks/*`.
- Cross-route components: `src/components/<Name>/` + `index.ts` barrel, imported as
  `@/components/<Name>`. Vendored UI primitives are a DIFFERENT home:
  `src/vendor/ui` (`@devdigest/ui`).
- Pages are thin; feature logic sits in colocated `_components/<Name>/` with its own
  `*.test.tsx`.
- Money on screen → reuse `formatCost` (`src/lib/cost.ts`); it distinguishes missing
  data ("—") from a real zero ("$0.00").

## Gotchas & do-not-touch
- PR-list table: `COLUMN_KEYS` and `GRID`
  (`src/app/repos/[repoId]/pulls/constants.ts`) must stay length-aligned, and a cell
  must be rendered in `PRRow.tsx` — otherwise header/cells misalign SILENTLY.
- i18n has only the `en` locale; a missing key renders the raw key, not an error.
- `src/vendor/shared/` is a hand-mirrored copy of the server's — edit in lock-step.

## Use when
- Route map, API surface per page → `client/README.md`
- Deep-dives → `client/docs/` · UI/flow specs → `client/specs/`
- Findings from past sessions → `client/INSIGHTS.md`
