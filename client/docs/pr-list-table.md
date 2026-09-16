# The PR-list table — three parallel lists

`/repos/:repoId/pulls` renders one CSS-grid table whose header and rows are laid
out by **three lists that must stay the same length**. Nothing links them at
compile time, and a mismatch throws nothing — the columns simply slide sideways.

| List | Where | Role |
|---|---|---|
| `COLUMN_KEYS` | `src/app/repos/[repoId]/pulls/constants.ts` | header cells + their order; each entry is an i18n key under `list.columns` |
| `GRID` | same file | the `grid-template-columns` string, applied to BOTH `s.headRow` and `s.row()` (`styles.ts`) |
| the cells in `PRRow` | `_components/PRRow/PRRow.tsx` | one top-level `<div>` per column, in the same order |

## Adding a column

1. add the key to `COLUMN_KEYS` at the right position;
2. add one track to `GRID` at the **same** position;
3. render a matching cell in `PRRow` at the same position;
4. add the label under `list.columns.<key>` in `client/messages/en/prReview.json`
   (a missing key renders the raw key — it does not throw);
5. if the cell shows a value, add it to `PrMeta` in **both** vendored copies and
   serve it from `GET /repos/:id/pulls`.

`PRRow.test.tsx` guards steps 1–3: it asserts the row renders exactly
`COLUMN_KEYS.length` cells and that `GRID` has one track per key. Adding a key
without a track fails that test — which is the whole point of having it.

## Where the cell values come from

The list endpoint computes its aggregates **on read** — nothing is denormalized
onto `pull_requests`:

- `score` — the latest review's score (`null` until reviewed → "—" ring);
- `cost_usd` — the sum of the PR's successful runs
  (`server/src/modules/pulls/cost.ts`); `null` when nothing is priced yet;
- `status` — derived review freshness (`deriveReviewStatus`), not GitHub's merge
  state, for open PRs.

Money is never formatted inline: use `formatCost` (`src/lib/cost.ts`) through
`RunCostBadge`, so a missing value renders "—" and a real zero renders "$0.00".
