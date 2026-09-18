# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

- **2026-06-14** — `formatCost` (`client/src/lib/cost.ts:13`) distinguishes MISSING data (`null`/`undefined` → "—") from a genuine zero (`0` → "$0.00"), widens precision for sub-cent values (~2 sig figs), and trims trailing zeros to a 2dp floor ("$0.06" not "$0.060", "$0.0013" not "$0.00"). Reuse it for any per-run money display.
- **2026-09-16** — The reference mock `DevDigest Design (standalone).html` is a self-extracting bundle (gzip+base64 chunks in `<script type="__bundler/manifest">`, each chunk a readable `.jsx` named in its first-line comment) — but before porting anything from it, check `client/src/vendor/ui`: the design system is ALREADY vendored there. `SEV` (severity colour/icon/label tokens), `Chip` (icon + label + count + active), `SeverityBadge` (compact/count), `CategoryTag`, `ConfidenceNum`, the `ddpop` keyframe and `--shadow-modal`/`--border-strong` all exist. Porting a mock screen is composition of existing primitives, not new CSS. Evidence: `client/src/vendor/ui/primitives/tokens.ts:6`, `primitives/Chip.tsx:4`, `vendor/ui/styles.css:255`.
- **2026-09-16** — Hover-lazy data without touching the hook: `usePrReviews(prId)` hardcodes `enabled: !!prId` and takes no options object, so a per-row hover fetch looks like it needs the signature widened. It does not — render the consuming component only while hovering (`{hover && <FindingsTooltip prId={...} />}`) and the hook mounts (and fires) lazily, with TanStack caching the result per PR. Same trick applies to any of the single-arg hooks in `lib/hooks/`. Evidence: `client/src/lib/hooks/reviews.ts:51`, `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx:44`.
- **2026-09-16** — To visually verify a UI state the dev DB cannot currently produce, stub `window.fetch` in the browser tab instead of mutating the dev DB (the seeded PR #482 accumulates empty mock reviews, and since the list reads only the LATEST review, its FINDINGS cell legitimately renders "—" even though findings exist on older runs). Wrap the real fetch, rewrite only the matching JSON responses, then `window.dispatchEvent(new Event("focus"))` — `usePulls` has `refetchOnWindowFocus: true`, so the stub takes effect without a reload that would discard it. Reverting = restore the saved original and navigate. This renders the REAL component tree, so it catches layout/clipping bugs RTL cannot, and leaves the user's data untouched. Evidence: `client/src/lib/hooks/core.ts:110`, `docs/visual-test-findings-severity.md:0`.

## What Doesn't Work

- **2026-09-16** — On Windows a long-running `pnpm dev` (Next 15) can serve a STALE compiled chunk indefinitely: after editing `RunCostBadge.tsx` the browser kept rendering the pre-edit output while `.next/static/chunks/app/repos/[repoId]/pulls/[number]/page.js` still contained the old `toLocaleString()` call. A hard navigation AND `touch`ing the source both failed to trigger a recompile — only killing the dev server and restarting `pnpm dev` picked the change up. When a UI change 'has no effect' but `pnpm typecheck`/`pnpm test` agree with your source, grep `.next/` for the compiled string before debugging the component. Evidence: `client/package.json:6`, `client/src/components/RunCostBadge/RunCostBadge.tsx:41`.
- **2026-09-16** — A floating panel anchored inside a PR-list row is clipped TWICE over, both silently. (1) `s.tableCard` shipped `overflow: "hidden"`, so an `position:absolute` popup in a row was cut off at the card edge — it must be `"visible"` (the reference mock sets it for exactly this reason). (2) `PRRow.test.tsx` asserts `row.children.length === COLUMN_KEYS.length`, so the panel must be nested INSIDE its cell; rendering it as a row-level sibling fails that guard. Note the app scroll container is `<main>` with `overflow: auto`, which is why the popup flips placement up/down by row index rather than relying on the viewport. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts:98`, `_components/PRRow/PRRow.test.tsx:73`, `_components/FindingsCell/FindingsCell.tsx:44`.

## Codebase Patterns

- **2026-06-14** — Cross-route shared components live in `src/components/<Name>/` with an `index.ts` barrel, imported via `@/components/<Name>` (e.g. `RunCostBadge`, `diff-viewer`). Vendored UI primitives (`Badge`, `CircularScore`) live in `src/vendor/ui` under `@devdigest/ui` — different home. Evidence: `client/src/components/RunCostBadge/index.ts:3`.
- **2026-06-14** — The PR-list table is driven by two parallel constants that MUST stay length-aligned: `COLUMN_KEYS` (header keys + order) and `GRID` (CSS grid-template tracks). Adding a column = add to both AND render a matching cell in `PRRow.tsx`, else header/cells misalign silently. Evidence: `client/src/app/repos/[repoId]/pulls/constants.ts:27,42`.
- **2026-06-14** — i18n has only the `en` locale (`client/messages/en/`); new UI strings need a key under the right namespace file (e.g. `prReview.json`, `runs.json`) read via `useTranslations("<ns>")`. A missing key renders the raw key, not an error. Evidence: `client/messages/en/prReview.json:89`.
- **2026-09-18** — Tailwind v4 is INSTALLED but the components do not use it: `client/postcss.config.mjs` registers `@tailwindcss/postcss`, yet every component styles through a colocated `styles.ts` exporting an `s` object of `CSSProperties`, with colours as CSS custom properties from `vendor/ui/styles.css` (`var(--border)`, `var(--crit)`). Reading package.json and reaching for utility classes writes code in the wrong style for this repo. Related: the App Router is used for routing and layouts only — 54 of 116 .tsx files carry `"use client"`, pages included, and rendering plus data go through TanStack Query against the Fastify API. Evidence: `client/postcss.config.mjs:4`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5`.

## Tool & Library Notes

- **2026-09-16** — A bare `toLocaleString()` formats with the MACHINE locale, not the app's: the same token total rendered "9 119" in the browser (uk-locale OS, narrow no-break space) and "9,119" under vitest/jsdom, so a test asserting that string passes locally and breaks elsewhere. The UI ships only the `en` locale — pass it explicitly: `total.toLocaleString("en-US")`. Evidence: `client/src/components/RunCostBadge/RunCostBadge.tsx:41`.

## Recurring Errors & Fixes

- **2026-09-16** — Em-dash "—" is the app-wide empty marker, so adding any new empty-capable cell to a row breaks EXISTING sibling tests that assert `getByText("—")` — RTL throws "found multiple elements", not a soft failure. Adding the FINDINGS cell broke two passing COST tests in `PRRow.test.tsx` this way. Fix: give the shared `pr()` fixture a non-empty default for the new field so only one cell is empty per test, and override it explicitly in the cases that test emptiness. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx:38`.

## Session Notes

## Open Questions
