# L01 — Findings severity: pills, per-run filter, list column

Two studio surfaces for the same fact — how many findings of each severity a
review produced. Both are pure reads over data the app already has: expanding a
run card, toggling a pill, or hovering a row must **never** trigger a model call.

## Requirements

### R1 — Severity pills in an expanded review run
In the PR page → *Agent runs* → *Review runs*, an expanded run card shows a pill
row between the verdict/PR SCORE banner and its finding cards.

- One pill per severity that **actually occurs** in that run; a severity with a
  count of 0 renders no pill at all.
- Each pill shows `<LEVEL> <count>` with the severity's icon and colour
  (`Chip` + `SEV` from the vendored design system — not new styling).
- State is **per run**: every `ReviewRunAccordion` mounts its own
  `FindingsPanel`, so filtering one card never touches another.

### R2 — The number must equal the cards below it
Counts are taken **after** `Hide low confidence` has been applied, so a pill's
number always equals the number of cards of that severity rendered below it —
with the toggle on or off. Findings are counted as stored: accepted and
dismissed ones count, because they are still on screen.

### R3 — Click to filter
Clicking a pill narrows the list to that severity; clicking the active pill
again clears the filter. If `Hide low confidence` empties the active severity,
the filter clears itself rather than leaving an empty list with no pill to click
back out of. Keyboard focus (`j`/`k`) resets when the filter changes.

### R4 — No model call
The counting and filtering rules are pure functions in
`FindingsPanel/helpers.ts` (`countBySeverity`, `visibleFindings`) over findings
the page already loaded. Part R1–R3 touches **no** API at all.

### R5 — PR-list FINDINGS column
A `FINDINGS` column between `SCORE` and `STATUS`, rendering `PrMeta.findings`
(the latest review's breakdown — see the server spec): severity-coloured
`icon + count`, only for levels that occur; `—` when the value is `null` (never
reviewed) or all zero (reviewed and clean).
`COLUMN_KEYS`, `GRID` and the cells in `PRRow` stay length-aligned.

### R6 — Read-only hover preview
Hovering the counts reveals a popup headed `N FINDINGS IN THIS RUN` listing that
review's findings as **text only**: severity badge, title, category,
`file:line`, `% confidence`, and a two-line rationale with markdown stripped.

**No buttons, links or inputs** — Accept/Reject belongs on the PR page, where a
full card gives enough context to judge. The popup is mounted only while
hovering, so `usePrReviews` fetches lazily; it reads the newest `kind: "review"`
record so it cannot contradict the column.

## Acceptance criteria

1. A run with only CRITICAL and WARNING findings shows exactly two pills.
2. Every pill's number equals the count of cards of that severity below it,
   including with `Hide low confidence` on.
3. Clicking a pill filters the list; clicking it again restores the full list;
   switching pills swaps the filter instead of stacking it.
4. Expanding a card and toggling every pill issues no request to a model
   provider (verifiable in the API log / Network tab).
5. The PR list shows `—` for an unreviewed PR and per-severity counts otherwise;
   header and rows stay aligned (8 columns ↔ 8 grid tracks).
6. The hover popup renders previews and contains zero interactive elements.
7. `pnpm typecheck` and `pnpm test` pass; the pure helpers, the pill component,
   the panel's filter behaviour and the popup's read-only-ness all have coverage.
