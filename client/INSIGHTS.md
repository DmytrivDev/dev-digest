# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

- **2026-06-14** — `formatCost` (`src/lib/cost.ts`) distinguishes MISSING data (`null`/`undefined` → "—") from a genuine zero (`0` → "$0.00"), widens precision for sub-cent values (~2 sig figs), and trims trailing zeros to a 2dp floor ("$0.06" not "$0.060", "$0.0013" not "$0.00"). Reuse it for any per-run money display.

## What Doesn't Work

- **2026-09-16** — On Windows a long-running `pnpm dev` (Next 15) can serve a STALE compiled chunk indefinitely: after editing `RunCostBadge.tsx` the browser kept rendering the pre-edit output while `.next/static/chunks/app/repos/[repoId]/pulls/[number]/page.js` still contained the old `toLocaleString()` call. A hard navigation AND `touch`ing the source both failed to trigger a recompile — only killing the dev server and restarting `pnpm dev` picked the change up. When a UI change 'has no effect' but `pnpm typecheck`/`pnpm test` agree with your source, grep `.next/` for the compiled string before debugging the component.

## Codebase Patterns

- **2026-06-14** — Cross-route shared components live in `src/components/<Name>/` with an `index.ts` barrel, imported via `@/components/<Name>` (e.g. `RunCostBadge`, `diff-viewer`). Vendored UI primitives (`Badge`, `CircularScore`) live in `src/vendor/ui` under `@devdigest/ui` — different home. Evidence: `client/src/components/RunCostBadge/`.
- **2026-06-14** — The PR-list table is driven by two parallel constants that MUST stay length-aligned: `COLUMN_KEYS` (header keys + order) and `GRID` (CSS grid-template tracks). Adding a column = add to both AND render a matching cell in `PRRow.tsx`, else header/cells misalign silently. Evidence: `client/src/app/repos/[repoId]/pulls/constants.ts`.
- **2026-06-14** — i18n has only the `en` locale (`client/messages/en/`); new UI strings need a key under the right namespace file (e.g. `prReview.json`, `runs.json`) read via `useTranslations("<ns>")`. A missing key renders the raw key, not an error.

## Tool & Library Notes

- **2026-09-16** — A bare `toLocaleString()` formats with the MACHINE locale, not the app's: the same token total rendered "9 119" in the browser (uk-locale OS, narrow no-break space) and "9,119" under vitest/jsdom, so a test asserting that string passes locally and breaks elsewhere. The UI ships only the `en` locale — pass it explicitly: `total.toLocaleString("en-US")`. Evidence: `client/src/components/RunCostBadge/RunCostBadge.tsx:41`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
