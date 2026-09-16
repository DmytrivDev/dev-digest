# L01 — Run cost (USD): studio surfaces

Show per-run cost on the three screens in the design. The client only formats
what the API already returns (`PrMeta.cost_usd`, `RunSummary.cost_usd`,
`RunStats.cost_usd`) — it never computes or estimates cost.

## Requirements

### R1 — Formatting (`formatCost`, `src/lib/cost.ts`)
| Input | Output | Why |
|---|---|---|
| `null` / `undefined` | `—` | missing data, not a free run |
| `0` | `$0.00` | a genuine zero (free model) must read differently |
| `0.0013` | `$0.0013` | most runs are sub-cent; `$0.00` would be useless |
| `0.06` | `$0.06` | trailing zeros trimmed to a 2-decimal floor |
| `1.5` | `$1.50` | at a dollar and above, plain 2 decimals |

Sub-dollar values keep ~2 significant figures (one extra decimal per leading
zero after the point).

### R2 — Surface 1: Pull Requests list
A `COST` column between `STATUS` and `UPDATED`, compact value (`$0.014`), muted
when missing. The table's `COLUMN_KEYS` and `GRID` stay length-aligned.

### R3 — Surface 2: Agent runs timeline (PR detail)
Under the run's timestamp, `<tokens> tok · <cost>` (e.g. `9,119 tok · $0.0013`),
where tokens = in + out. Rendered only for settled runs (`status === "done"`) —
running/failed rows show nothing extra. A settled run with neither tokens nor
cost renders `—`.

### R4 — Surface 3: Run trace drawer
A `COST` stat card in the Stats row, third of four:
`DURATION · TOKENS · COST · FINDINGS`.

### R5 — Reuse
One formatter (`formatCost`) and one component (`RunCostBadge`, cross-route
component with a barrel) drive all three surfaces. New UI strings go under the
`en` locale (`list.columns.cost`, `trace.stat.cost`).

## Acceptance criteria

1. A PR with no priced run shows `—` in the COST column, never `$0.00`.
2. After a review, the COST column shows the latest batch's cost, the timeline
   row shows `tok · $cost`, and the drawer shows the COST card — all three from
   one run, without a reload beyond the normal refetch.
3. The PR-list header and rows stay aligned (7 columns ↔ 7 grid tracks).
4. A running run shows no cost text; a failed run shows its error, no `$0.00`.
5. `pnpm typecheck` and `pnpm test` pass; `formatCost` has unit coverage for
   missing / zero / sub-cent / dollar values.
