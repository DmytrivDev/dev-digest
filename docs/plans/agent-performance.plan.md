# Implementation plan: Agent Performance — global dashboard + per-agent Stats tab (SPEC-10)

**Route** — A (spec-driven).
**Requirements source** — `specs/SPEC-10-agent-performance.md` (Status: approved, 0 `[NEEDS CLARIFICATION]`
markers, `Open questions: None`). This plan implements those requirements; it does not define or change them.
**Execution mode** — multi-agent (6 lanes: L0 → L1 ∥ L2 → L3 ∥ L4 → L5) — chosen by the user on 2026-10-17
(decision delegated by the user to the session and relayed by the caller with the brief).
**Out of scope** — everything in the spec's *Non-goals* (Stats panels beyond the headline, deltas, sparklines on
summary cards, threshold colours, billing reconciliation, deleted agents' spend, CI ingest bound, live refresh,
pagination, CSV, per-repo filter, MCP tool, persisted sort). Architecture review and security review are
performed by separate agents.

---

## Requirements traceability

Spec lines refer to `specs/SPEC-10-agent-performance.md`.

| Req | Requirement (short) | Source | Work items | Checked by |
|---|---|---|---|---|
| AC-1 | counted run = workspace + agent_id + `status='done'` + `ran_at` in window, any source / multi-agent | :88 | W3, W4 | W4 it test |
| AC-2 | `failed_runs` = failed + cancelled in window, in no other figure | :94 | W3, W4 | W4 it test |
| AC-3 | cost null / <0 / non-finite / >1000 → unpriced everywhere incl. `recent_runs` | :98 | W3, W4 | W3 unit + W4 it test |
| AC-4 | `priced_runs`; 0 counts as priced | :103 | W3 | W3 unit |
| AC-5 | `total_cost_usd` sum of valid costs, null when 0 priced | :107 | W3 | W3 unit |
| AC-6 | `avg_cost_usd` = total / priced_runs | :111 | W3 | W3 unit |
| AC-7 | `avg_duration_ms` over non-null durations | :115 | W3 | W3 unit |
| AC-8 | `findings` / `accepted` / `dismissed` of counted runs' reviews | :119 | W3, W4 | W4 it test |
| AC-9 | `accept_rate` = a/(a+d), null over 0 decisions | :125 | W3 | W3 unit |
| AC-10 | `small_sample` iff 1 ≤ decided < 5 | :131 | W3 | W3 unit |
| AC-11 | `last_run_at` newest done run at any time | :135 | W3, W4 | W4 it test |
| AC-12 | `recent_runs` ≤5 newest counted runs | :140 | W3, W4 | W4 it test |
| AC-13 | computed per request, no cache | :145 | W4 | W4 it test |
| AC-14 | dashboard row ≡ stats `agent` field-for-field | :149 | W3, W4 | W4 it test |
| AC-15 | window from `days` ∈ {1,30} or `from`/`to`; default 30 | :155 | W1, W3, W4 | W4 it test |
| AC-16 | six invalid-window cases → 422 | :160 | W1, W4 | W1 unit + W4 it test |
| AC-17 | echo `window.from/to/days` | :166 | W3, W4 | W4 it test |
| AC-18 | one row per agent incl. disabled / 0-run | :172 | W3, W4 | W4 it test |
| AC-19 | summary runs / failed_runs / priced_runs = row sums | :176 | W3, W4 | W4 it test |
| AC-20 | summary total = sum of non-null row totals, else null | :180 | W3 | W3 unit |
| AC-21 | `cost_by_agent` segments for priced agents, sum = total ±1e-9 | :184 | W3 | W3 unit |
| AC-22 | `cost_by_model` incl. `model: null` segment, sum = total | :189 | W3, W4 | W3 unit + W4 it test |
| AC-23 | pooled summary accept rate + accepted/dismissed/small_sample | :194 | W3 | W3 unit |
| AC-24 | `most_active` with tie-break; null when runs 0 | :200 | W3 | W3 unit |
| AC-25 | `cost_basis: "estimate"` on both | :205 | W1, W4 | W4 it test |
| AC-26 | workspace isolation, findings only via workspace-filtered reviews | :208 | W4 | W4 it test |
| AC-27 | unknown / foreign agent → identical 404 | :213 | W4 | W4 it test |
| AC-28 | no LLM, no job, no write | :217 | W4 | W4 it test |
| AC-29 | sidebar GLOBAL "Agent Performance" item, active on route | :223 | W10 | W10 unit |
| AC-30 | title + selector (1 day / 30 days / Custom range), 30 days default, requests `days=30` | :227 | W8, W9, W11 | W11 unit |
| AC-31 | window written to URL; reload restores | :232 | W7, W8, W17 | W17 e2e |
| AC-32 | malformed URL window → replaced with `days=30` | :237 | W7, W8 | W7 unit + W8 unit |
| AC-33 | custom range → local midnights with browser offset | :241 | W7 | W7 unit |
| AC-34 | invalid custom range → Apply disabled + inline reason, no request | :246 | W7, W9 | W9 unit |
| AC-35 | Total runs card + "N failed or cancelled, not counted" | :251 | W12 | W12 unit |
| AC-36 | Total cost card via `formatCost` + "N of M runs unpriced" | :255 | W12 | W12 unit |
| AC-37 | Avg accept rate card "61% · 55 of 90 decided" / "—" + "0 decided" | :260 | W12 | W12 unit |
| AC-38 | Most-active card name + "N runs" | :265 | W12 | W12 unit |
| AC-39 | table columns (7) + one row per agent | :269 | W13 | W13 unit |
| AC-40 | Accept-rate cell "78% · 18/23" / "—" + "0 decided" | :273 | W13 | W13 unit |
| AC-41 | "small sample (n = D)" mark | :277 | W13 | W13 unit |
| AC-42 | default order: three tiers by rate, runs, name | :281 | W13 | W13 unit |
| AC-43 | client-side sort, toggle, nulls last, tiers kept | :286 | W13 | W13 unit |
| AC-44 | expand shows `recent_runs` + duration sparkline, one at a time, no request | :292 | W13 | W13 unit |
| AC-45 | zero-run row texts; expanded "No runs in this period" | :297 | W13 | W13 unit |
| AC-46 | View → `/agents/<id>?tab=stats` + window params | :302 | W7, W13 | W13 unit |
| AC-47 | By agent / By model donuts, `formatCost` legend, "Model not recorded" | :306 | W10, W14 | W14 unit |
| AC-48 | total null + runs > 0 → "No priced runs in this period" ×2 | :311 | W14 | W14 unit |
| AC-49 | "DevDigest estimate" label ×3, hover + focus explanation, driven by `cost_basis` | :315 | W9, W12, W13, W14 | W9 + W12/W13/W14 unit |
| AC-50 | pending → placeholders, no digit / "$" / "—" | :321 | W11 | W11 unit |
| AC-51 | failure → error + Retry, selector usable | :325 | W11 | W11 unit |
| AC-52 | agents but 0 runs → "No agent runs in this period" + dates + hint | :329 | W7, W11 | W11 unit |
| AC-53 | no agents → "No agents yet" + link to `/agents` | :334 | W11 | W11 unit |
| AC-54 | only the latest window's response renders | :338 | W8, W11 | W11 unit |
| AC-55 | long name truncated, full name as accessible name + tooltip | :342 | W13 | W13 unit |
| AC-56 | duration "6.2s", counts en locale, cost, whole %, relative Last run + absolute tooltip | :346 | W7, W13, W15 | W7 unit + W13 unit |
| AC-57 | Stats tab between Evals and CI, `?tab=stats` | :353 | W16 | W16 unit |
| AC-58 | Stats tab shares selector/default/URL/conversion/validation | :357 | W8, W9, W15 | W15 unit |
| AC-59 | Stats tab four cards from `GET /agents/:id/stats` `agent` | :361 | W4, W15 | W15 unit + W4 it test |
| AC-60 | Stats Accept-rate card "75% · 3 of 4 decided · small sample (n = 4)" / "— · 0 decided" | :365 | W15 | W15 unit |
| AC-61 | Stats Avg cost card estimate label + "P of N runs priced" | :369 | W9, W15 | W15 unit |
| AC-62 | Stats tab strings = dashboard row strings | :373 | W5, W7, W13, W15, W17 | W15 unit + W13 unit + W17 e2e |
| AC-63 | Stats pending → placeholders | :378 | W15 | W15 unit |
| AC-64 | Stats failure → error + Retry | :382 | W15 | W15 unit |
| AC-65 | Stats zero-run texts (never / no runs in period · last run …) | :386 | W15 | W15 unit |
| NFR-1 | performance ≤ 2 s at 50 agents / 10k runs / 30k findings | :423 | W4, W6 | W6 it test |
| NFR-2 | stats ≤ 1 s at same seed | :427 | W4, W6 | W6 it test |
| NFR-3 | keyboard reachability; `aria-sort`, `aria-expanded` | :431 | W9, W11, W13, W15 | W9/W13 unit + manual focus-ring check (integration) |
| NFR-4 | WCAG AA contrast both themes | :437 | W9, W11–W15 | manual (integration pass) |
| NFR-5 | strings from `agentPerformance` / `agents` namespaces | :442 | W2, W11–W15 | W11–W15 unit (no raw key rendered) |

Enabling items: W1 (contract, enables AC-14..AC-28 and all client items), W2 (i18n, enables NFR-5 and every
client item), W5 (seed — enables the AC-31 / AC-62 e2e and the "feature is in the seed" contract), W10 (Donut
`formatValue` enables AC-47).

## Spec follow-ups

Addressed to `spec-creator` and the user. Not applied: this plan implements the spec as written, under the
interpretation stated in *Assumptions*.

1. **AC-62 vs AC-40 / AC-60 — denominator wording differs by construction.** AC-40 fixes the table cell as
   "78% · 18/23", AC-60 fixes the Stats card as "75% · 3 of 4 decided". AC-62 then asks for "the same strings …
   accept rate (with its denominator)". Both cannot be literally the same string. Plan reading (A7): the rate
   string ("78%" / "—") and the two counts (accepted, decided) are identical; the phrasing around them is per AC.
   Suggest rewording AC-62 to "the same rate and the same accepted / decided counts".
2. **NFR-5 vs shared components.** The window selector, the estimate label, the small-sample mark and the
   relative-time phrases are rendered by both views. Plan reading (A8): those strings live once in
   `agentPerformance` so AC-62 holds by construction; only Stats-only labels go to `agents.stats.*`.
3. **AC-16 vs AC-34 — span across a DST change.** A 366-calendar-day custom range that crosses a
   summer→winter change is 366 d + 1 h as instants, which the server rejects (AC-16) while AC-34 would accept
   it as 366 days. Plan reading (A5): the client measures the span exactly like the server (`to − from` as
   instants). Suggest stating the span rule once, in instant terms.
4. **AC-46 with no window in the URL.** Examples cover only `days=1` and a custom range. Plan reading (A9): the
   View link always carries the resolved window, so with no URL params it carries `days=30`.
5. **AC-29 label source.** Every NAV label is a hard-coded English literal in `client/src/vendor/ui/nav.ts`
   (no i18n), which NFR-5 would forbid for a "new UI string". Plan follows the existing NAV pattern (A10).

## Affected surface

Skills column resolved from `.claude/skill-routing.md`.

| File | New/Mod | Package | Ring / home | Skills that govern it | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/vendor/shared/contracts/productionize.ts` | Mod | shared (server copy, canonical) | Ring 2 port/contract | zod | byte-identical to client copy — `server/test/vendor-shared-sync.test.ts`; section order load-bearing — `server/INSIGHTS.md:59` |
| `client/src/vendor/shared/contracts/productionize.ts` | Mod | shared (client copy) | Ring 2 | zod | same bytes as server copy — `client/src/test/vendor-shared-sync.test.ts` |
| `server/src/vendor/shared/contracts/observability.ts` | Mod | shared | Ring 2 | zod | imports from `./productionize.js` must not create a cycle (productionize imports only `./findings.js`, `productionize.ts:2`) |
| `client/src/vendor/shared/contracts/observability.ts` | Mod | shared | Ring 2 | zod | lock-step |
| `server/test/agent-performance-contracts.test.ts` | New | api | test | — (unrouted) | `server/tsconfig.json` does not typecheck `test/**` — `server/INSIGHTS.md:118` |
| `client/messages/en/agentPerformance.json` | Mod (rewrite) | web | i18n namespace | frontend-ui-architecture | no duplicate keys / leaf-vs-parent collision — `client/INSIGHTS.md:65` |
| `client/messages/en/agents.json` | Mod | web | i18n namespace | frontend-ui-architecture | `editor.tabs.stats` already exists (`agents.json:57`); add only `stats.*` |
| `server/src/modules/agent-performance/constants.ts` | New | api | Ring 1 | onion-architecture | — |
| `server/src/modules/agent-performance/helpers/window.ts` | New | api | Ring 1 (RING1 regex covers `helpers/*.ts`, `server/.dependency-cruiser.cjs:23`) | onion-architecture | pure: no db / clock — `now` is a parameter |
| `server/src/modules/agent-performance/helpers/aggregate.ts` | New | api | Ring 1 | onion-architecture | pure; the ONE aggregation rule (AC-14 by construction) |
| `server/src/modules/agent-performance/repository.ts` | New | api | Ring 3 | onion-architecture, drizzle-orm-patterns | findings only through `reviews.workspace_id = ws` — `server/INSIGHTS.md:50`; no Drizzle row type leaves (ban 3) |
| `server/src/modules/agent-performance/service.ts` | New | api | Ring 3 | onion-architecture, security | inject the repository, never `Container` — `server/INSIGHTS.md:55` |
| `server/src/modules/agent-performance/routes.ts` | New | api | Ring 4 | onion-architecture, security, fastify-best-practices | no `drizzle-orm` / `db/schema` import (ban 1, `.dependency-cruiser.cjs:88`); schema-first `querystring` (`server/CLAUDE.md` Conventions) |
| `server/src/modules/index.ts` | Mod | api | Ring 4 registry | onion-architecture | one import + one map entry — `modules/index.ts:23-31` |
| `server/test/agent-performance-rules.test.ts` | New | api | unit test | — (unrouted) | no Docker |
| `server/test/agent-performance.it.test.ts` | New | api | integration test | — (unrouted) | `*.it.test.ts` suffix mandatory; pass `ranAt` / `createdAt` explicitly — `server/INSIGHTS.md:86` |
| `server/src/db/seed-performance.ts` | New | api | seed data (ring 4 `db/**`) | onion-architecture | seed never updates; insert-when-absent only — `server/INSIGHTS.md:62` |
| `server/src/db/seed.ts` | Mod | api | seed | onion-architecture | call the new seeder after agents + PR blocks; keep `return { workspaceId, userId }` (`seed.ts:486`) |
| `server/test/agent-performance-seed.it.test.ts` | New | api | integration test | — (unrouted) | re-seed must be a no-op |
| `server/test/agent-performance-nfr.it.test.ts` | New | api | integration test | — (unrouted) | bulk inserts chunked (≤1000 rows per insert) |
| `client/src/lib/agent-performance.ts` | New | web | domain module (`lib/<concept>.ts`) | — (unrouted, see gaps) | pure; no `utils` naming — frontend-ui-architecture §4 |
| `client/src/lib/agent-performance.test.ts` | New | web | test | react-testing-library | — |
| `client/src/lib/hooks/agent-performance.ts` | New | web | data hooks | frontend-ui-architecture, react-best-practices | all API access via `lib/api.ts`; types via `import type` only (client build — `client/INSIGHTS.md:22`) |
| `client/src/lib/hooks/agent-performance.test.tsx` | New | web | test | react-testing-library | — |
| `client/src/components/PerfWindowSelector/{PerfWindowSelector.tsx,styles.ts,index.ts,PerfWindowSelector.test.tsx}` | New | web | shared component (2 routes) | frontend-ui-architecture, react-best-practices (tsx), react-testing-library (test) | colours via CSS vars — never hex; no shorthand+longhand mix |
| `client/src/components/EstimateLabel/{EstimateLabel.tsx,styles.ts,index.ts,EstimateLabel.test.tsx}` | New | web | shared component (2 routes) | frontend-ui-architecture, react-best-practices, react-testing-library | explanation reachable by hover AND focus (AC-49) |
| `client/src/vendor/ui/charts/Donut.tsx` | Mod | web | design system | frontend-ui-architecture | additive optional prop only; default output unchanged |
| `client/src/vendor/ui/nav.ts` | Mod | web | design system | frontend-ui-architecture | `activeKeyFor` already maps `/agent-performance` (`app-shell/helpers.ts:41`) — `client/INSIGHTS.md:40` |
| `client/src/components/app-shell/nav-context.test.ts` | Mod | web | test | react-testing-library | — |
| `client/src/components/app-shell/helpers.test.ts` | Mod | web | test | react-testing-library | — |
| `client/src/app/agent-performance/page.tsx` | New | web | route entry | frontend-ui-architecture, next-best-practices, react-best-practices | static route + `useSearchParams` ⇒ `<Suspense>` or `next build` fails — `client/src/app/multi-agent/page.tsx:5-11` |
| `client/src/app/agent-performance/_components/AgentPerformanceView/*` | New | web | route-local | frontend-ui-architecture, react-best-practices, react-testing-library | states loading / error / no-agents / no-runs / data |
| `client/src/app/agent-performance/_components/SummaryCards/*` | New | web | route-local | same | — |
| `client/src/app/agent-performance/_components/AgentTable/*` (incl. `_components/AgentRow`, `_components/RecentRuns`, `constants.ts`, `helpers.ts`) | New | web | route-local | same | `COLUMN_KEYS` and `GRID` length-aligned with a comment — `client/INSIGHTS.md:36` |
| `client/src/app/agent-performance/_components/CostBreakdown/*` | New | web | route-local | same | — |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/*` | New | web | route-local (editor tab) | frontend-ui-architecture, react-best-practices, react-testing-library | — |
| `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` | Mod | web | route-local | frontend-ui-architecture | tab order Config, Skills, Context, Evals, Stats, CI |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` | Mod | web | route-local | frontend-ui-architecture, react-best-practices | `key={agent.id}` remount like the other tabs (`AgentEditor.tsx:28-39`) |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` | Mod | web | test | react-testing-library | every `vi.mock` factory must export what newly rendered children call — `client/INSIGHTS.md:64` |
| `e2e/specs/10-agent-performance.flow.json` | New | e2e | browser flow | — (unrouted) | `wait --url` matches the URL END — `e2e/INSIGHTS.md:157` |

**Coverage gaps:** `client/src/lib/agent-performance.ts` (no routing row covers `client/src/lib/*.ts` other than
`api.ts`); every new `server/test/*.ts` file; `e2e/specs/10-agent-performance.flow.json`. These are reviewed by
nothing in the routing table — say so in the review handoff rather than letting them look reviewed.

## Contract changes

- **vendor/shared:** **yes.** Files: `contracts/productionize.ts` and `contracts/observability.ts`, in BOTH
  `server/src/vendor/shared/` and `client/src/vendor/shared/`, byte-identical. Order: edit the server copy, copy
  the file bytes to the client copy (comments included). `AgentPerf`, `AgentPerfRow` and `AgentStats` are
  REPLACED (today they have no route and no consumer anywhere in `server/src`, `server/test`, `client/src`,
  `mcp/src` — verified by grep). Exact shape in W1.
- **Migration:** **no.** Every column read exists (`agent_runs`, `reviews.run_id` + `reviews_run_idx`,
  `findings_review_idx`). Contingency in W6 only.
- **Seed:** **yes** → W5: a dedicated demo PR #484 with priced local runs, CI runs, a failed run, an unpriced
  run, reviews linked by `run_id` and decided findings, at fixed September 2026 timestamps (for the e2e) plus a
  few runs relative to seed time (so the default 30-day view of a fresh stack is not empty).
- **Client build check needed:** **yes**, but NOT because of a value import — every client import of
  `@devdigest/shared` in this plan is `import type`. It is required because `/agent-performance` is a new STATIC
  route whose client tree calls `useSearchParams`, which fails `next build` without a `<Suspense>` boundary
  (`client/src/app/ci-runs/page.tsx:4-5`). L3 runs `pnpm build` in `client/`.
- **i18n:** **yes** → `client/messages/en/agentPerformance.json` (rewrite; it exists today unused with a different
  key set) and `client/messages/en/agents.json` (`stats.*` added). Exact keys in W2.

## Work items

### Lane L0 — contracts (both shared copies + i18n)

#### W1 — Replace the Agent Performance and Agent Stats contracts (both vendor copies)
- **Serves:** enables AC-14 … AC-28, AC-59 and every client item; directly AC-15/AC-16 (schema), AC-25.
- **Do:** In `server/src/vendor/shared/contracts/productionize.ts`, replace the body of the
  `// ---- Agent Performance (GET /agents/performance) ----` section (`productionize.ts:134-186`, i.e.
  `AgentPerfRow`, `PerfCostSegment`, `AgentPerf`) with the schemas below, in this order (each references only
  names declared above it — TDZ rule, `server/INSIGHTS.md:59`). Keep the `export { Severity };` line and the
  Weekly Digest section untouched. Update the file header comment line for AgentPerf if needed.

  ```ts
  /** Rolling presets the window selector offers. */
  export const PERF_WINDOW_DAYS = [1, 30] as const;
  /** Longest custom window, in days (24 h each), measured as `to − from`. */
  export const PERF_MAX_SPAN_DAYS = 366;

  /** Query of GET /agents/performance and GET /agents/:id/stats (AC-15, AC-16). */
  export const PerfWindowQuery = z.object({
    days: z.coerce.number().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  }).superRefine((q, ctx) => {
    // issues (each with a `path`): days not in PERF_WINDOW_DAYS; days together with from/to;
    // only one of from/to; from >= to; (to − from) > PERF_MAX_SPAN_DAYS × 86_400_000 ms.
  });
  export type PerfWindowQuery = z.infer<typeof PerfWindowQuery>;

  export const PerfWindowDays = z.union([z.literal(1), z.literal(30)]);
  export const PerfWindow = z.object({ from: z.string(), to: z.string(), days: PerfWindowDays.nullable() });
  export const CostBasis = z.literal('estimate');

  export const PerfRecentRun = z.object({
    run_id: z.string(), ran_at: z.string(), source: z.enum(['local', 'ci']),
    duration_ms: z.number().int().nullable(), cost_usd: z.number().nullable(),
  });

  /** The ONE per-agent row both endpoints return (spec "Per-agent row"). */
  export const AgentPerfRow = z.object({
    agent_id: z.string(), agent_name: z.string(), enabled: z.boolean(),
    runs: z.number().int(), failed_runs: z.number().int(), priced_runs: z.number().int(),
    total_cost_usd: z.number().nullable(), avg_cost_usd: z.number().nullable(),
    avg_duration_ms: z.number().nullable(),
    findings: z.number().int(), accepted: z.number().int(), dismissed: z.number().int(),
    accept_rate: z.number().min(0).max(1).nullable(), small_sample: z.boolean(),
    last_run_at: z.string().nullable(),
    recent_runs: z.array(PerfRecentRun).max(5),
  });

  export const PerfMostActive = z.object({ agent_id: z.string(), agent_name: z.string(), runs: z.number().int() });
  export const PerfSummary = z.object({
    runs: z.number().int(), failed_runs: z.number().int(), priced_runs: z.number().int(),
    total_cost_usd: z.number().nullable(), accepted: z.number().int(), dismissed: z.number().int(),
    accept_rate: z.number().min(0).max(1).nullable(), small_sample: z.boolean(),
    most_active: PerfMostActive.nullable(),
  });
  export const PerfAgentCost = z.object({ agent_id: z.string(), agent_name: z.string(), cost_usd: z.number() });
  export const PerfModelCost = z.object({ model: z.string().nullable(), cost_usd: z.number(), runs: z.number().int() });

  /** Response of GET /agents/performance. */
  export const AgentPerf = z.object({
    window: PerfWindow, cost_basis: CostBasis, min_decisions: z.number().int(),
    summary: PerfSummary, agents: z.array(AgentPerfRow),
    cost_by_agent: z.array(PerfAgentCost), cost_by_model: z.array(PerfModelCost),
  });
  ```
  Export the inferred type for every schema under the same name (`zod` skill `type-export-schemas-and-types`).
  In `observability.ts`, replace `AgentStats` (`observability.ts:145-168`) with
  `AgentStats = z.object({ window: PerfWindow, cost_basis: CostBasis, min_decisions: z.number().int(), agent: AgentPerfRow })`,
  importing `AgentPerfRow, CostBasis, PerfWindow` from `./productionize.js`. Leave `StatPoint` in place (harmless,
  avoids churn). Copy both files byte-for-byte into `client/src/vendor/shared/contracts/`.
  Add `server/test/agent-performance-contracts.test.ts`: parses a full `AgentPerf` and `AgentStats` fixture;
  `PerfWindowQuery.safeParse` accepts `{}`, `{days:'1'}`, `{days:'30'}`, a valid `from`/`to` pair with `+03:00`
  offsets, and rejects each of the six AC-16 cases (`days:'7'`; `days` + `from`/`to`; only `from`; unparsable
  `from`; `from >= to`; span 366 d + 1 ms).
- **Files:** the four contract files; `server/test/agent-performance-contracts.test.ts`.
- **Done means:** both vendor copies are byte-identical (sync tests green); the new contract test passes all
  accept/reject cases above; `pnpm typecheck` green in `server/` and `client/`.
- **Verify:** `node scripts/verify.mjs server test/agent-performance-contracts.test.ts test/vendor-shared-sync.test.ts`
  and `node scripts/verify.mjs client src/test/vendor-shared-sync.test.ts` (repo root).
- **Rules that apply:** zod → `parse-validate-early`, `refine-add-path` (each superRefine issue carries its
  path), `object-optional-vs-nullable`; onion-architecture §2 (contracts are ring 2, no server import).
- **Risk:** a TDZ ordering mistake throws at import for every consumer while `tsc` is silent — the contract test
  imports the barrel, which catches it.

#### W2 — i18n namespaces for the dashboard and the Stats tab
- **Serves:** NFR-5; enables AC-30 … AC-65 strings.
- **Do:** Replace the whole content of `client/messages/en/agentPerformance.json` with the tree below and add the
  `stats` object at the top level of `client/messages/en/agents.json` (sibling of `editor`, `config`, …). Keep
  wording exactly where an AC quotes it.

  `agentPerformance.json`:
  ```json
  {
    "title": "Agent Performance",
    "subtitle": "Which agents earn their keep — accept rate is the quality signal",
    "window": {
      "label": "Period", "days1": "1 day", "days30": "30 days", "custom": "Custom range",
      "start": "Start date", "end": "End date", "apply": "Apply",
      "errors": {
        "empty": "Pick both a start and an end date.",
        "reversed": "The start date is after the end date.",
        "future": "The end date is after today.",
        "tooLong": "The range is longer than 366 days."
      }
    },
    "estimate": {
      "label": "DevDigest estimate",
      "explanation": "Cost is computed by DevDigest at run time — from token counts and its price table, or the per-request cost OpenRouter reports — and is not reconciled with provider billing."
    },
    "summary": {
      "totalRuns": "Total runs",
      "failedExcluded": "{count} failed or cancelled, not counted",
      "totalCost": "Total cost",
      "unpriced": "{unpriced} of {runs} runs unpriced",
      "avgAcceptRate": "Avg accept rate",
      "mostActive": "Most-active agent",
      "runsCount": "{count, plural, one {# run} other {# runs}}"
    },
    "metrics": {
      "ofDecided": "{accepted} of {decided} decided",
      "zeroDecided": "0 decided",
      "smallSample": "small sample (n = {n})"
    },
    "relative": { "now": "just now", "minutes": "{n}m ago", "hours": "{n}h ago", "days": "{n}d ago" },
    "table": {
      "agent": "Agent", "runs": "Runs", "avgCost": "Avg cost", "avgDuration": "Avg duration",
      "acceptRate": "Accept rate", "lastRun": "Last run", "view": "View",
      "viewLabel": "View stats for {name}",
      "expand": "Show recent runs for {name}",
      "never": "Never",
      "noRunsInPeriod": "No runs in this period",
      "recentRuns": "Recent runs",
      "source": { "local": "Local", "ci": "CI" }
    },
    "breakdown": {
      "title": "Cost breakdown", "byAgent": "By agent", "byModel": "By model",
      "modelNotRecorded": "Model not recorded",
      "noPriced": "No priced runs in this period"
    },
    "states": {
      "loading": "Loading agent performance",
      "loadError": "Could not load agent performance.",
      "retry": "Retry",
      "noRuns": { "title": "No agent runs in this period", "body": "{from} – {to}. Pick a wider range to see more." },
      "noAgents": { "title": "No agents yet", "body": "Create an agent to start measuring its performance.", "link": "Go to Agents" }
    }
  }
  ```
  `agents.json` → add:
  ```json
  "stats": {
    "totalRuns": "Total runs",
    "avgCost": "Avg cost / run",
    "avgDuration": "Avg duration",
    "acceptRate": "Accept rate",
    "pricedOf": "{priced} of {runs} runs priced",
    "neverRun": "This agent has not run yet",
    "noRunsInPeriod": "No runs in this period · last run {when}",
    "loading": "Loading agent stats",
    "loadError": "Could not load this agent's stats.",
    "retry": "Retry"
  }
  ```
  Then scan both files for duplicate keys per object (a key that is both a leaf and a parent, or repeated in one
  object) — `client/INSIGHTS.md:65`; `JSON.parse` alone cannot see duplicates.
- **Files:** `client/messages/en/agentPerformance.json`, `client/messages/en/agents.json`.
- **Done means:** both files parse; no duplicate key in any object; every key listed above exists; no existing
  `agents.json` key changed or removed.
- **Verify:** `node scripts/verify.mjs client src/test/smoke.test.tsx` (repo root) plus the duplicate-key scan
  (a throwaway script in the session scratchpad — never committed).
- **Rules that apply:** frontend-ui-architecture §7 (one namespace per feature area, dot-path keys, a missing key
  renders the raw key).
- **Risk:** low; the old `agentPerformance` keys have no consumer (`grep -rn agentPerformance client/src` finds none).

### Lane L1 — server (after L0; parallel with L2, L3, L4)

#### W3 — The aggregation rule and window resolution as pure ring-1 functions
- **Serves:** AC-3 … AC-7, AC-9, AC-10, AC-12, AC-14, AC-15, AC-17, AC-19 … AC-24 (unit); enables AC-1, AC-2, AC-8, AC-11, AC-18.
- **Do:** Create `server/src/modules/agent-performance/constants.ts` (`COUNTED_STATUS = 'done'`,
  `FAILED_STATUSES = ['failed','cancelled'] as const`, `MIN_DECISIONS = 5`, `RECENT_RUNS_LIMIT = 5`,
  `MAX_VALID_COST_USD = 1000`, `DEFAULT_WINDOW_DAYS = 30`, `COST_BASIS = 'estimate' as const`).
  `helpers/window.ts`: `resolveWindow(q: PerfWindowQuery, now: Date): { from: Date; to: Date; days: 1 | 30 | null }`
  (days → `[now − days×24h, now)`; from/to → `[from, to)`; nothing → days 30) and
  `windowDto(w): PerfWindow` (`toISOString()` both ends).
  `helpers/aggregate.ts` declares the ring-1 input shapes the repository maps into —
  `PerfAgentInput {id, name, enabled}`, `PerfRunInput {id, agentId, ranAt: Date, status: string|null, source: 'local'|'ci', durationMs: number|null, costUsd: number|null, model: string|null}`,
  `PerfFindingCounts {runId, findings, accepted, dismissed}`, `PerfLastRun {agentId, lastRunAt: Date}` — and:
  - `validCostUsd(c)` → `c` if finite and `0 ≤ c ≤ MAX_VALID_COST_USD`, else `null` (AC-3);
  - `isCountedRun(r)` → `r.status === COUNTED_STATUS` (the single counted-run predicate);
  - `buildAgentRow(agent, runsOfAgent, countsByRunId, lastRunAt)` → `AgentPerfRow` per AC-1 … AC-12
    (`failed_runs` counts `FAILED_STATUSES`; findings summed only over counted runs; `recent_runs` = counted runs
    sorted by `ranAt` desc then id, first `RECENT_RUNS_LIMIT`, each `cost_usd: validCostUsd(...)`);
  - `buildAgentRows(agents, runs, counts, lastRuns)` → one row per agent (AC-18), rows in input agent order;
  - `summarize(rows)` → `PerfSummary` (AC-19, AC-20, AC-23; `small_sample` by the AC-10 rule on pooled counts);
  - `pickMostActive(rows)` (AC-24: most `runs`; tie → newer `recent_runs[0].ran_at`; then
    `agent_name.toLowerCase()` ascending via plain `<` compare, not `localeCompare`; then `agent_id`; null when
    total runs 0);
  - `costByAgent(rows)` (AC-21: rows with `priced_runs ≥ 1`, value = `total_cost_usd`, sorted cost desc then name);
  - `costByModel(runs)` (AC-22: counted runs with a valid cost grouped by `model`, `null` model its own segment,
    `runs` = priced runs in the segment, sorted cost desc then model with null last on ties).
  Add `server/test/agent-performance-rules.test.ts` with the exact cases from the spec's unit `Verify:` lines for
  AC-4, 5, 6, 7, 9, 10, 20, 21, 22, 23, 24, plus: AC-3 values (−0.5, 5000, NaN, Infinity → unpriced; 1000 → priced),
  AC-12 (7 counted → 5 newest desc), failed runs change no cost/duration/finding figure (AC-2 rule half),
  `resolveWindow` for `days=1`, `days=30`, empty query, explicit pair.
- **Files:** `server/src/modules/agent-performance/{constants.ts,helpers/window.ts,helpers/aggregate.ts}`,
  `server/test/agent-performance-rules.test.ts`.
- **Done means:** every listed unit case passes with no Docker; no file under `helpers/` imports `db/`,
  `adapters/`, `platform/container`, `drizzle-orm` or reads the clock.
- **Verify:** `node scripts/verify.mjs server test/agent-performance-rules.test.ts` (repo root).
- **Rules that apply:** onion-architecture §1 (default to ring 1; "a rule that needs Postgres to test is in the
  wrong ring"), §3 ban 3 (inputs are plain interfaces, not `$inferSelect`).
- **Risk:** low.

#### W4 — Repository, service, routes and module registration (+ integration tests)
- **Serves:** AC-1, AC-2, AC-8, AC-11 … AC-19, AC-22, AC-25 … AC-28, AC-59 (server half).
- **Do:**
  - `repository.ts` — `class AgentPerformanceRepository { constructor(private db: Db) }`, read-only, every
    method scoped by `workspaceId`, mapping selects into the W3 input interfaces:
    `listAgents(ws, agentId?)` (id, name, enabled; order by name, id);
    `runsInWindow(ws, from, to, agentId?)` (`agent_id IS NOT NULL` [or `= agentId`], `ran_at >= from AND ran_at < to`,
    `status IN ('done','failed','cancelled')`);
    `findingCountsByRun(ws, from, to, agentId?)` — `findings ⋈ reviews ON reviews.id = findings.review_id ⋈
    agent_runs ON agent_runs.id = reviews.run_id`, WHERE `reviews.workspace_id = ws AND agent_runs.workspace_id = ws`
    and the same window/agent filter on `agent_runs`, GROUP BY `reviews.run_id`, selecting `count(*)::int`,
    `count(findings.accepted_at)::int`, `count(findings.dismissed_at)::int` (counted as in `skillStatsFrom`,
    `skills/stats.ts:49-51`; the counted-run filter itself stays in W3's `isCountedRun`);
    `lastDoneRunAt(ws, agentId?)` — `max(ran_at)` GROUP BY `agent_id` WHERE `status = COUNTED_STATUS`, any time.
  - `service.ts` — `class AgentPerformanceService { constructor(private repo: AgentPerformanceRepository, private now: () => Date = () => new Date()) }`.
    Private `rowsFor(ws, window, agentId?)` runs the four reads (`Promise.all`) and calls `buildAgentRows` — BOTH
    public methods go through it (AC-14 by construction).
    `performance(ws, q)` → `AgentPerf` (`summarize`, `costByAgent`, `costByModel` over the counted runs,
    `cost_basis: COST_BASIS`, `min_decisions: MIN_DECISIONS`, `window: windowDto`).
    `stats(ws, agentId, q)` → `AgentStats | undefined` (undefined when `listAgents(ws, agentId)` is empty — same
    for unknown and foreign ids, AC-27). No cache (AC-13), no write, no job, no LLM (AC-28).
  - `routes.ts` — default Fastify plugin; `new AgentPerformanceService(new AgentPerformanceRepository(app.container.db))`;
    `GET /agents/performance` `{ schema: { querystring: PerfWindowQuery, response: { 200: AgentPerf } } }`;
    `GET /agents/:id/stats` `{ schema: { params: IdParams, querystring: PerfWindowQuery, response: { 200: AgentStats } } }`
    throwing `NotFoundError('Agent not found')` on undefined. Tenancy via `getContext`. Header comment lists both
    routes. (Static `/agents/performance` outranks the agents module's parametric `/agents/:id` in find-my-way.)
  - `modules/index.ts` — `import agentPerformance from './agent-performance/routes.js';` + `agentPerformance,` in
    the map.
  - `server/test/agent-performance.it.test.ts` (Docker-gated like `skills.it.test.ts:18-24`): one test per spec
    integration `Verify:` line — AC-1 (done/failed/cancelled/running local, CI done succeeded + skipped, CI status
    null, multi-agent child, one run 1 s outside), AC-2, AC-3, AC-8 (incl. a finding on a failed run's review),
    AC-11, AC-12, AC-13, AC-14 (deep-equal every agent over a mixed seed and an explicit `from`/`to`), AC-15
    (run 23 h vs 25 h old; run at `from` counted, at `to` not; no params = `days=30`), AC-16 (six cases → 422,
    including the query sent with `+` encoded as `%2B`), AC-17, AC-18, AC-19, AC-22 (a CI row shaped like
    `ci/repository.ts:301-311`, `model` null → null segment), AC-25, AC-26 (second workspace inserted like
    `agents-versions.it.test.ts:241`; drive the service with each workspace id; a review in B whose `run_id` equals a
    run of A adds nothing to A), AC-27 (unknown uuid and other-workspace agent → byte-identical 404 body), AC-28
    (`overrides.llm` providers whose methods are `vi.fn()`, `vi.spyOn(app.container.jobs, 'enqueue')`; row counts of
    `agent_runs`, `reviews`, `findings` and `max(ran_at)` unchanged), and `GET /agents/performance` answering 200
    (not the 422 the agents module's uuid `IdParams` would give). Insert rows with explicit `ranAt` / `createdAt`.
- **Files:** `server/src/modules/agent-performance/{repository.ts,service.ts,routes.ts}`, `server/src/modules/index.ts`,
  `server/test/agent-performance.it.test.ts`.
- **Done means:** every listed integration case passes with **0 skipped**; `pnpm arch:check` reports no new
  violation (delta against the pre-change count); `routes.ts` imports neither `drizzle-orm` nor `db/schema`;
  `service.ts` imports neither `platform/container` nor `adapters/`.
- **Verify:** `node scripts/verify.mjs server src/modules/agent-performance/service.ts` (typecheck + related unit +
  arch:check), then from `server/`: `pnpm exec vitest run test/agent-performance.it.test.ts` and read the skipped
  count (`server/INSIGHTS.md:102` — `verify.mjs --it` ignores the file list).
- **Rules that apply:** onion-architecture §3 bans 1–3, §4 (inject the repository; composition in `routes.ts`);
  fastify-best-practices → schema-first validation, response schemas; drizzle-orm-patterns → typed aggregates
  (`sql<number>` with `::int`), no N+1; security A01 → tenancy on every read, foreign id indistinguishable from
  unknown.
- **Risk:** medium — the findings join is where tenancy can leak (AC-26); a missing `reviews.workspace_id` filter
  passes every single-workspace test.

#### W5 — Seed the performance demo data
- **Serves:** enables AC-31 and AC-62 (e2e needs seeded runs and decisions) and the "feature is in the seed"
  contract (`server/INSIGHTS.md:62`); demonstrates EC-2, EC-5/6, EC-8, EC-10, EC-14.
- **Do:** Create `server/src/db/seed-performance.ts` exporting the fixtures and
  `seedPerformance(db, { workspaceId, repoId, agentIdsByName })`; call it from `seed()` after the agents and the
  PR #483 block, before `return`. Contents (all ids are fixed UUID constants; inserts use
  `onConflictDoNothing()`; findings are inserted only for review rows the insert actually returned — so a re-seed
  changes nothing):
  - PR **#484** in the seeded demo repo, insert-when-absent by `(repo, number)` like the PR #483 block
    (`seed.ts:310-330`), title "Retry policy for webhook delivery", no files needed.
  - **Historic set** (dates fixed at 12:00:00Z so every browser timezone's local-midnight bounds of
    2026-09-01 … 2026-09-30 contain them):
    - Security Reviewer — 6 `done` local runs on 2026-09-05, 08, 11, 14, 17, 20 with `cost_usd`
      [0.04, 0.04, 0.05, 0.05, 0.06, 0.06], `duration_ms` [6000, 6200, 6400, 6000, 6200, 6400], `model` =
      `DEFAULT_MODEL`, `pr_id` = #484; one review per run (`run_id` set, `createdAt` = run `ran_at`); across those
      reviews 5 accepted, 2 dismissed, 2 untriaged findings. Plus 1 `failed` run on 2026-09-21 (cost null, error
      "seed: provider timeout"). → row: Runs 6, Avg cost $0.05, Avg duration 6.2s, 71% · 5/7, failed 1.
    - General Reviewer — 3 `done` local runs on 2026-09-06, 12, 18 with `cost_usd` [0.02, 0.02, null],
      `duration_ms` [4000, 5000, null], `model` `'openai/gpt-4.1-mini'`; reviews with 1 accepted, 1 dismissed,
      1 untriaged. → Runs 3, Avg cost $0.02, Avg duration 4.5s, 50% · 1/2, small sample (n = 2), 1 of 3 unpriced.
    - Performance Reviewer — 2 `done` CI runs (`source: 'ci'`, `model` null, `pr_id` null, no review) on
      2026-09-09 and 2026-09-23, `cost_usd` [0.01, 0.01], `duration_ms` [30000, 32000]. → Runs 2, $0.01, 31.0s,
      "—" + "0 decided", "Model not recorded" segment.
    - API Contract Reviewer and Test Quality Reviewer — no runs (→ "Never").
  - **Recent set** (relative to seed time, no reviews): Security Reviewer runs at now − 2 h and now − 26 h
    (cost 0.05, 6000 ms), General Reviewer at now − 3 d (cost 0.03, 5000 ms).
  - Add `server/test/agent-performance-seed.it.test.ts`: after `seed()`, `GET /agents/performance?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z`
    returns the historic figures above for each agent; calling `seed()` a second time leaves `agent_runs`,
    `reviews` and `findings` row counts unchanged.
- **Files:** `server/src/db/seed-performance.ts`, `server/src/db/seed.ts`, `server/test/agent-performance-seed.it.test.ts`.
- **Done means:** the seed test passes (0 skipped); the full integration lane stays green (other suites call
  `seed()` too); PR #482 / #483 reviews and their "latest review" are untouched (the new reviews hang off #484 only).
- **Verify:** from `server/`: `pnpm exec vitest run test/agent-performance-seed.it.test.ts`; then
  `node scripts/verify.mjs server --it` once at the end of the lane (alone, not while other lanes hammer Docker —
  `server/INSIGHTS.md:102`, `:120`).
- **Rules that apply:** onion-architecture (seed is ring 4 `db/**`; it may import schema).
- **Risk:** medium — seeded `done` runs now feed the multi-agent estimate (`multi-agent/repository.ts:137-154`
  reads newest done runs with no source filter, `server/INSIGHTS.md:81`), so studio estimates on a fresh stack show
  seeded numbers. Expected; no test asserts an empty estimate (no multi-agent `.it` suite exists).

#### W6 — NFR timing tests
- **Serves:** NFR-1, NFR-2.
- **Do:** `server/test/agent-performance-nfr.it.test.ts`: fresh workspace with 50 agents, 10,000 counted runs in the
  last 30 days (skewed so one agent is busiest), reviews for them, 30,000 findings (mixed decided/untriaged),
  inserted in chunks of ≤1000 rows. Warm up once, then time `GET /agents/performance?days=30` (< 2000 ms) and
  `GET /agents/<busiest>/stats?days=30` (< 1000 ms) via `app.inject`.
- **Files:** `server/test/agent-performance-nfr.it.test.ts`.
- **Done means:** both assertions pass on the local Docker Postgres. **Contingency (only if they fail):** add an
  index `agent_runs (workspace_id, agent_id, ran_at)` in `server/src/db/schema/runs.ts`, run `pnpm db:generate`
  (never hand-written SQL, never a hand-picked filename) and `pnpm db:migrate`, then re-run; record it in the report
  — that adds a migration this plan otherwise does not have.
- **Verify:** from `server/`: `pnpm exec vitest run test/agent-performance-nfr.it.test.ts`.
- **Rules that apply:** drizzle-orm-patterns → batch inserts chunked.
- **Risk:** load flake under parallel lanes (`server/INSIGHTS.md:37`, `:119`) — re-run alone before chasing a cause.

### Lane L2 — client foundation (after L0; parallel with L1)

#### W7 — Pure window and metric-formatting module
- **Serves:** AC-32, AC-33, AC-34 (rules), AC-46 (params), AC-52 (date label), AC-56, AC-62 (single formatter).
- **Do:** `client/src/lib/agent-performance.ts` (pure, no React, no hooks):
  - `type UiWindow = { kind: "days"; days: 1 | 30 } | { kind: "custom"; start: string; end: string }` (dates `YYYY-MM-DD`); `DEFAULT_WINDOW = { kind: "days", days: 30 }`.
  - `todayLocal(now: Date): string`.
  - `localMidnightIso(date: string): string` → `"2026-10-01T00:00:00+03:00"` — local midnight of that calendar
    day with THAT day's offset (from `new Date(y, m-1, d).getTimezoneOffset()`), so DST ranges get two offsets (EC-23).
  - `customRangeInstants(start, end)` → `{ from: localMidnightIso(start), to: localMidnightIso(end + 1 day) }`.
  - `validateCustomRange(start, end, today): "empty" | "reversed" | "future" | "tooLong" | null` — tooLong when
    `Date.parse(to) − Date.parse(from) > 366 × 86_400_000` (same measure as the server, A5).
  - `parseWindowParams(params: URLSearchParams, today): { window: UiWindow; repaired: boolean }` — no window
    params → default, `repaired: false`; `days` ∈ {1,30} alone → days; `from`+`to` valid `YYYY-MM-DD` real dates
    passing `validateCustomRange` → custom; anything else (e.g. `?from=2026-13-01`, `?days=7`, both kinds) →
    default with `repaired: true` (AC-32).
  - `windowParams(w): [string, string][]` → `[["days","30"]]` or `[["from",S],["to",E]]` (URL + View link).
  - `windowApiQuery(w): string` → built with `URLSearchParams` (`days=30` or `from=<iso>&to=<iso>`, so `+` is
    sent as `%2B`).
  - `windowDateLabels(win: PerfWindow, now)` → local `en-US` dates of `from` and of `to − 1 ms` (AC-52 shows the
    inclusive end).
  - `formatCount(n)` → `n.toLocaleString("en-US")`; `formatPercent(rate)` → `"78%"` (`Math.round(rate*100)`) or
    `"—"`; `formatDurationMs(ms)` → `"6.2s"` (one decimal) or `"—"`; `relativeAge(iso, now)` →
    `{ key: "now"|"minutes"|"hours"|"days"; n } | null` (shape of `CiTab/helpers.ts:23-35`).
  - `metricStrings(row: AgentPerfRow)` → `{ runs, avgCost, avgDuration, rate, accepted, decided }` strings
    (`formatCount`, `formatCost` from `lib/cost.ts`, `formatDurationMs`, `formatPercent`) — the ONE function both
    views render metric values from (AC-62 unit half).
  - `client/src/lib/agent-performance.test.ts`: AC-33 with `process.env.TZ = "Europe/Kyiv"` set in `beforeAll` and
    restored in `afterAll` (2026-10-01..07 → `+03:00` bounds; a range across 2026-10-25 gets `+03:00`/`+02:00`);
    AC-32 cases; the four AC-34 reasons; AC-56 (`6234` → `"6.2s"`, `1234` → `"1,234"`); `windowApiQuery` encodes `+`.
- **Files:** `client/src/lib/agent-performance.ts`, `client/src/lib/agent-performance.test.ts`.
- **Done means:** all listed cases pass; the module imports nothing from React or `next/*`; type imports from
  `@devdigest/shared` are `import type`.
- **Verify:** `node scripts/verify.mjs client src/lib/agent-performance.test.ts` (repo root).
- **Rules that apply:** frontend-ui-architecture §4 (pure helpers, concept-named module, no `utils`), §5 rung 1.
- **Risk:** timezone tests — if changing `process.env.TZ` at runtime proves unreliable in the vitest worker, make
  `localMidnightIso` take an optional offset resolver and test through it; record the deviation.

#### W8 — Data hooks and the URL window hook
- **Serves:** AC-30 (default request), AC-31 (write to URL), AC-32 (repair), AC-54, AC-58 (shared behaviour).
- **Do:** `client/src/lib/hooks/agent-performance.ts`:
  - `usePerfWindow()` — reads `useSearchParams`, `usePathname`, `useRouter`; `{ window, repaired } = parseWindowParams(search, todayLocal(new Date()))`;
    an effect `router.replace`s the URL with the window params replaced by `days=30` when `repaired` (other params
    such as `tab` preserved); `setWindow(w)` replaces only the window params (removes the other kind's keys,
    keeps the rest) via `router.replace`. Returns `{ window, setWindow, apiQuery: windowApiQuery(window), params: windowParams(window) }`.
  - `useAgentPerformance(apiQuery)` → `useQuery({ queryKey: ["agent-performance", apiQuery], queryFn: () => api.get<AgentPerf>(`/agents/performance?${apiQuery}`) })`.
  - `useAgentStats(agentId, apiQuery)` → key `["agent-stats", agentId, apiQuery]`, `enabled: !!agentId`,
    `api.get<AgentStats>(`/agents/${agentId}/stats?${apiQuery}`)`.
  - No `placeholderData` / keep-previous: a new window must show placeholders (AC-50) and only the current key's
    data renders (AC-54).
  - `client/src/lib/hooks/agent-performance.test.tsx`: with `next/navigation` mocked — malformed params trigger one
    `router.replace` to `…days=30` keeping `tab=stats`; `setWindow(custom)` writes `from`/`to` and drops `days`;
    the query URL for a custom window contains `%2B03%3A00`-encoded offsets (or decodes to `+03:00`).
- **Files:** `client/src/lib/hooks/agent-performance.ts`, `client/src/lib/hooks/agent-performance.test.tsx`.
- **Done means:** listed cases pass; all fetching goes through `api.get` from `lib/api.ts`.
- **Verify:** `node scripts/verify.mjs client src/lib/hooks/agent-performance.test.tsx`.
- **Rules that apply:** frontend-ui-architecture §5 rungs 2–3 (hooks are thin adapters; server data only via query
  hooks; URL is the state bucket for the window); react-best-practices → the one `useEffect` synchronises an
  external system (the router), never derived state.
- **Risk:** low.

#### W9 — Shared `PerfWindowSelector` and `EstimateLabel`
- **Serves:** AC-30, AC-34, AC-49 (label + explanation), AC-58, AC-61 (label), NFR-3.
- **Do:**
  - `client/src/components/PerfWindowSelector/` — props `{ value: UiWindow; onChange(w: UiWindow): void }`.
    Three toggle buttons (`aria-pressed`) labelled from `agentPerformance.window.*`; "Custom range" reveals two
    `<input type="date">` (labels `window.start` / `window.end`, `max` = today) and an Apply button. Draft dates are
    local state initialised from `value` when custom. Apply is `disabled` while `validateCustomRange` returns a
    reason, and the reason is shown inline (`window.errors.<reason>`), linked via `aria-describedby`; choosing a
    preset or applying calls `onChange` — nothing else (no fetch).
  - `client/src/components/EstimateLabel/` — props `{ basis: "estimate" }`; renders the `estimate.label` text as a
    focusable element (`tabIndex={0}`, `aria-describedby` → a `role="tooltip"` element with `estimate.explanation`),
    the tooltip visible on mouse-enter and on focus, hidden on leave/blur/Escape. Renders nothing for any other
    basis value (AC-49 "driven by `cost_basis`").
  - Colocated tests: AC-34 four cases (Apply disabled, message shown, `onChange` and `fetch` not called); presets
    call `onChange` with `{kind:"days",days:1}`; keyboard (Enter/Space on buttons via `fireEvent.keyDown`/click);
    EstimateLabel explanation appears on hover and on focus.
  - Each folder has `index.ts` (one-line purpose comment) and `styles.ts` (`s` object, CSS variables only).
- **Files:** `client/src/components/PerfWindowSelector/{PerfWindowSelector.tsx,styles.ts,index.ts,PerfWindowSelector.test.tsx}`,
  `client/src/components/EstimateLabel/{EstimateLabel.tsx,styles.ts,index.ts,EstimateLabel.test.tsx}`.
- **Done means:** listed tests pass; no hex colour; no barrel beyond the per-folder `index.ts`.
- **Verify:** `node scripts/verify.mjs client src/components/PerfWindowSelector/PerfWindowSelector.test.tsx src/components/EstimateLabel/EstimateLabel.test.tsx`.
- **Rules that apply:** frontend-ui-architecture §1 (two routes use them → `src/components/`), §2 anatomy, §7
  (no shorthand + longhand mix); react-best-practices → accessibility (labels, `aria-describedby`), no derived
  state in `useState` beyond the draft; react-testing-library → query by role/name, `fireEvent` (this repo has no
  `@testing-library/user-event`, `client/INSIGHTS.md:60`).
- **Risk:** low.

#### W10 — Donut value formatter and the GLOBAL nav entry
- **Serves:** AC-29; enables AC-47 (legend amounts through `formatCost`).
- **Do:** `client/src/vendor/ui/charts/Donut.tsx`: add optional `formatValue?: (v: number) => string`; when given,
  the legend renders `formatValue(s.value)` instead of `valuePrefix + toFixed(2)` (`Donut.tsx:48-50`); default
  output byte-for-byte unchanged. `client/src/vendor/ui/nav.ts`: in the GLOBAL section insert
  `{ key: "agent-performance", label: "Agent Performance", icon: "Activity", href: "/agent-performance" }` between
  `multi-agent` and `ci-runs` (mock order, `docs/design/extracted/chrome.jsx:15-20`), and update the section
  comment. Tests: `nav-context.test.ts` — GLOBAL order `["multi-agent","agent-performance","ci-runs"]` and the
  entry's href/label; `helpers.test.ts` — `activeKeyFor("/agent-performance") === "agent-performance"` and
  `activeKeyFor("/agents/x") === "agents"`.
- **Files:** `client/src/vendor/ui/charts/Donut.tsx`, `client/src/vendor/ui/nav.ts`,
  `client/src/components/app-shell/nav-context.test.ts`, `client/src/components/app-shell/helpers.test.ts`.
- **Done means:** listed tests pass; existing Donut consumers render unchanged (their tests stay green).
- **Verify:** `node scripts/verify.mjs client src/components/app-shell/nav-context.test.ts src/components/app-shell/helpers.test.ts src/vendor/ui/charts/Donut.tsx`.
- **Rules that apply:** frontend-ui-architecture §1 (check `vendor/ui` before building new — compose `Donut`,
  `Sparkline`, `Skeleton`, `ErrorState`, `EmptyState`, `Card`, `SectionLabel`, `MonoLink`, `Button`).
- **Risk:** low.

### Lane L3 — dashboard page (after L2; parallel with L4 and L1)

#### W11 — Route entry and `AgentPerformanceView` (states, selector, latest-window rendering)
- **Serves:** AC-30, AC-50, AC-51, AC-52, AC-53, AC-54; NFR-3, NFR-5.
- **Do:** `client/src/app/agent-performance/page.tsx` → `<Suspense fallback={null}><AgentPerformanceView /></Suspense>`
  with a header comment (mirror `multi-agent/page.tsx`). `_components/AgentPerformanceView/` (`"use client"`):
  `AppShell` with crumb "Agent Performance"; title + subtitle; `PerfWindowSelector` bound to `usePerfWindow`;
  `useAgentPerformance(apiQuery)`; then exactly one of: placeholders (`Skeleton`s in cards, table and breakdown —
  no digit, "$", "0" or "—"; the selector stays) while pending; `ErrorState` with a Retry calling `refetch` (selector
  still enabled) on error; "No agents yet" + link to `/agents` when `agents` is empty; "No agent runs in this
  period" + `windowDateLabels` + hint when `summary.runs === 0`; otherwise `SummaryCards`, `AgentTable`,
  `CostBreakdown`. Wrap the three content regions in elements the tests can scope to (e.g. `role="region"` with an
  accessible name), because the selector itself contains digits ("1 day", "30 days").
  Test (`AgentPerformanceView.test.tsx`, hooks or `fetch` mocked, `next/navigation` mocked): AC-30 (three options,
  "30 days" pressed, request URL has `days=30`), AC-50 (pending → regions contain no digit/"$"/"—"), AC-51 (500 →
  error + Retry, Retry re-requests, selector enabled), AC-52, AC-53, AC-54 (resolve the `days=30` response after
  the `days=1` one → `days=1` figures shown), NFR-5 (no rendered text starts with `agentPerformance.`).
- **Files:** `client/src/app/agent-performance/page.tsx`,
  `client/src/app/agent-performance/_components/AgentPerformanceView/{AgentPerformanceView.tsx,styles.ts,index.ts,AgentPerformanceView.test.tsx}`.
- **Done means:** listed tests pass; `pnpm build` in `client/` succeeds (Suspense boundary present).
- **Verify:** `node scripts/verify.mjs client src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx`;
  after W14: `pnpm build` in `client/` (never while a `pnpm dev` is serving the same `.next` — `client/INSIGHTS.md:49`).
- **Rules that apply:** next-best-practices → Suspense boundary for `useSearchParams` on a static route;
  frontend-ui-architecture §6 (`'use client'` at the top of the subtree, page stays thin); react-best-practices →
  early-return states, no `count && …` on numbers.
- **Risk:** low.

#### W12 — `SummaryCards`
- **Serves:** AC-35, AC-36, AC-37, AC-38, AC-49 (Total cost card label).
- **Do:** `_components/SummaryCards/` — props `{ summary: PerfSummary; costBasis }`. Four cards (compose the mock's
  `PerfSummaryCard` look with `vendor/ui` primitives; no delta, no sparkline — D-13): Total runs (`formatCount`;
  `summary.failedExcluded` when `failed_runs > 0`); Total cost (`formatCost`; `summary.unpriced` when
  `runs − priced_runs > 0`; `EstimateLabel`); Avg accept rate (`formatPercent` + `metrics.ofDecided`, or "—" +
  `metrics.zeroDecided`; may show `CircularScore` only when the rate is non-null); Most-active (name +
  `summary.runsCount`; card shows "—" text only if `most_active` is null, which the view never reaches since
  runs > 0). Test the exact fixtures from the spec Verify lines for AC-35 … AC-38 (incl. "no `0%` for 0 decided").
- **Files:** `client/src/app/agent-performance/_components/SummaryCards/{SummaryCards.tsx,styles.ts,index.ts,SummaryCards.test.tsx}`.
- **Done means:** listed tests pass.
- **Verify:** `node scripts/verify.mjs client src/app/agent-performance/_components/SummaryCards/SummaryCards.test.tsx`.
- **Rules that apply:** react-best-practices → no zero-rendering `&&`; frontend-ui-architecture §7 styles.
- **Risk:** em-dash collisions in tests (`client/INSIGHTS.md:59`) — give fixtures non-empty defaults.

#### W13 — `AgentTable` (rows, sorting, expansion, View link)
- **Serves:** AC-39 … AC-46, AC-49 (Avg cost header label), AC-55, AC-56, AC-62 (unit, dashboard side), NFR-3.
- **Do:** `_components/AgentTable/` with `constants.ts` (`COLUMN_KEYS` and `GRID`, length-aligned, with the
  coupling comment), `helpers.ts` (pure: `defaultOrder(rows, minDecisions)` — tiers `decided ≥ min`, then
  `1..min−1`, then 0; within a tier rate desc, runs desc, `agent_name` asc; `sortRows(rows, key, dir, minDecisions)`
  — nulls last in both directions, Accept rate keeps tiers), `_components/AgentRow/` and
  `_components/RecentRuns/`. Sortable header cells carry `aria-sort` and contain a button; sort state is local
  `useState` (not persisted, D-17). Each row: name (ellipsis styling, full text in DOM + `title`), Runs, Avg cost,
  Avg duration, Accept rate, Last run, View — values from `metricStrings(row)`; Accept-rate cell
  `"{rate} · {accepted}/{decided}"` or "—" + `metrics.zeroDecided`, plus `metrics.smallSample` when `small_sample`;
  Last run = `relative.*` from `relativeAge(last_run_at)` with `formatWhen` absolute in `title`, or `table.never`.
  Expand control is a button with `aria-expanded`; one expanded row at a time (lifted state in `AgentTable`);
  `RecentRuns` lists `recent_runs` newest first (time, `table.source.*`, duration, cost) and a `Sparkline` of
  durations oldest→newest only when ≥ 2 non-null durations; a 0-run row's expansion reads `table.noRunsInPeriod`.
  View = `MonoLink`/`Link` to `/agents/<id>?tab=stats&<windowParams>` (`aria-label` `table.viewLabel`). Avg cost
  header carries `EstimateLabel`.
  Tests: AC-39 … AC-46 and AC-55 exactly per their Verify lines (fetch spied to prove no request on sort/expand);
  AC-62 unit half — a fixture row's displayed runs/avg cost/avg duration/rate equal `metricStrings(row)`.
- **Files:** `client/src/app/agent-performance/_components/AgentTable/{AgentTable.tsx,constants.ts,helpers.ts,helpers.test.ts,styles.ts,index.ts,AgentTable.test.tsx}`,
  `.../AgentTable/_components/AgentRow/{AgentRow.tsx,styles.ts,index.ts}`,
  `.../AgentTable/_components/RecentRuns/{RecentRuns.tsx,styles.ts,index.ts}`.
- **Done means:** listed tests pass; `COLUMN_KEYS.length === GRID` track count asserted in a test.
- **Verify:** `node scripts/verify.mjs client src/app/agent-performance/_components/AgentTable/AgentTable.test.tsx src/app/agent-performance/_components/AgentTable/helpers.test.ts`.
- **Rules that apply:** frontend-ui-architecture §3 (split on two jobs / unrelated state — expansion lives in the
  table, sort logic in `helpers.ts`), §4 (coupled constants in one file); react-best-practices → stable keys
  (`agent_id`, `run_id`), no component defined inside render, `aria-sort`/`aria-expanded`; security → names and
  model strings rendered as text only (no `dangerouslySetInnerHTML`).
- **Risk:** medium — largest component; keep row and expansion in their own folders.

#### W14 — `CostBreakdown`
- **Serves:** AC-47, AC-48, AC-49 (section label).
- **Do:** `_components/CostBreakdown/` — props `{ byAgent, byModel, totalCostUsd, runs, costBasis }`. `SectionLabel`
  "Cost breakdown" + `EstimateLabel`; two `Card`s "By agent" / "By model", each a `Donut` with
  `formatValue={formatCost}`, segments mapped to `{label, value, color}` (model null → `breakdown.modelNotRecorded`;
  colours from a constant palette of existing CSS variables in `constants.ts`). When `totalCostUsd === null` and
  `runs > 0`, both cards show `breakdown.noPriced` instead of the donut. Tests per AC-47 / AC-48 Verify lines.
- **Files:** `client/src/app/agent-performance/_components/CostBreakdown/{CostBreakdown.tsx,constants.ts,styles.ts,index.ts,CostBreakdown.test.tsx}`.
- **Done means:** listed tests pass (mock `ResponsiveContainer` is not needed — `Donut` uses a fixed-size
  `PieChart`; legend text is plain DOM).
- **Verify:** `node scripts/verify.mjs client src/app/agent-performance/_components/CostBreakdown/CostBreakdown.test.tsx`,
  then (lane end) `pnpm build` in `client/`.
- **Rules that apply:** frontend-ui-architecture §1 (compose `Donut`, `Card`, `SectionLabel`), §7 (CSS variables).
- **Risk:** low.

### Lane L4 — agent Stats tab (after L2; parallel with L3 and L1)

#### W15 — `StatsTab`
- **Serves:** AC-56 (Stats side), AC-58, AC-59 (client), AC-60, AC-61, AC-62 (unit, Stats side), AC-63, AC-64, AC-65; NFR-3, NFR-5.
- **Do:** `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/` — props `{ agent: Agent }`.
  `usePerfWindow()` + `PerfWindowSelector`; `useAgentStats(agent.id, apiQuery)`. States: placeholders while pending
  (no digit/"$"/"—" in the cards region); `ErrorState` + Retry on error; when `agent.runs === 0`:
  `stats.neverRun` if `last_run_at` null, else `stats.noRunsInPeriod` with the `relative.*` phrase; otherwise four
  cards — Total runs, Avg cost / run (+ `EstimateLabel` + `stats.pricedOf` when `priced_runs < runs`), Avg
  duration, Accept rate (`"{rate} · " + metrics.ofDecided` [+ `" · " + metrics.smallSample`] or
  `"— · " + metrics.zeroDecided`) — values from `metricStrings(row)`. Stats-only labels from `agents.stats.*`,
  shared phrases from `agentPerformance` (A8).
  Test `StatsTab.test.tsx` (hooks or fetch mocked, `next/navigation` mocked): AC-58 (default `days=30` request to
  `/agents/<id>/stats`, URL write, custom-range conversion delegated to the shared selector), AC-59, AC-60 (both
  strings verbatim), AC-61, AC-63, AC-64, AC-65, AC-62 unit half (displayed values equal `metricStrings(row)`),
  NFR-5.
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/{StatsTab.tsx,styles.ts,index.ts,StatsTab.test.tsx}`.
- **Done means:** listed tests pass.
- **Verify:** typecheck via `node scripts/verify.mjs client <file>` is not enough under `[id]` routes
  (`client/INSIGHTS.md:28`); run from `client/`: `pnpm typecheck && pnpm exec vitest run StatsTab`.
- **Rules that apply:** frontend-ui-architecture §1 (tab is route-local), §5 (data via hooks only);
  react-best-practices → early-return states.
- **Risk:** low.

#### W16 — Wire the Stats tab into the agent editor
- **Serves:** AC-57.
- **Do:** `AgentEditor/constants.ts`: insert `{ key: "stats", labelKey: "editor.tabs.stats", icon: "Activity" }`
  between `evals` and `ci`; drop "Stats arrives with a later lesson" from the comment. `AgentEditor.tsx`: add the
  `tab === "stats"` branch rendering `<StatsTab key={agent.id} agent={agent} />`; update the header comment.
  `AgentEditor.test.tsx`: assert tab order Config, Skills, Context, Evals, Stats, CI and that `tab="stats"` renders
  the Stats tab; extend the `next/navigation` mock factory with `useSearchParams` / `usePathname` / `useRouter` as
  `StatsTab` needs, and add a `vi.mock("@/lib/hooks/agent-performance", …)` factory (`useAgentStats`,
  `usePerfWindow`) — or whatever the mounted tree calls (`client/INSIGHTS.md:64`).
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,AgentEditor.test.tsx}`.
- **Done means:** listed tests pass; `?tab=stats` is in `VALID_TABS` (derived from `TABS`, `constants.ts:20`).
- **Verify:** from `client/`: `pnpm typecheck && pnpm exec vitest run AgentEditor StatsTab`.
- **Rules that apply:** frontend-ui-architecture; react-testing-library (scope queries; tab labels may collide with
  card labels — use `within`).
- **Risk:** low.

### Lane L5 — e2e (after L1 W5, L3, L4)

#### W17 — Browser flow: custom range survives reload; dashboard row ≡ Stats tab
- **Serves:** AC-31 (e2e), AC-62 (e2e).
- **Do:** `e2e/specs/10-agent-performance.flow.json` (format of `09-pr-brief.flow.json`): open
  `{BASE}/agent-performance`; wait for "Agent Performance"; select "Custom range"; set Start date 2026-09-01 and
  End date 2026-09-30 through the labelled date inputs (`find label "Start date" fill 2026-09-01`, same for end);
  click Apply; `wait --url` on the URL END `to=2026-09-30`; fresh `open` of
  `{BASE}/agent-performance?from=2026-09-01&to=2026-09-30` (reload) and wait for the same URL end plus the seeded
  Security Reviewer row texts "6", "$0.05", "6.2s", "71%", "5/7"; click that row's View link (`find role link click
  --name "View stats for Security Reviewer"`); `wait --url to=2026-09-30` (URL now `/agents/<id>?tab=stats&from=…&to=…`);
  wait for "6", "$0.05", "6.2s", "71%", "5 of 7 decided" on the Stats tab. If agent-browser cannot `fill` a native
  date input, drive the first selection through the URL instead (the reload half still exercises AC-31) and record
  the deviation in the report. Scroll the `main` container before clicking below-the-fold elements
  (`scroll down 3000 --selector main`, `e2e/INSIGHTS.md:157`).
- **Files:** `e2e/specs/10-agent-performance.flow.json`.
- **Done means:** the flow passes in the hermetic runner, and flows 01–09 still pass (the seed changed).
- **Verify:** `./scripts/e2e.sh` from the repo root (Git Bash; on Windows with `E2E_PG_PORT=5440` and
  `AGENT_BROWSER_BIN=<npm prefix -g>/node_modules/agent-browser/bin/agent-browser-win32-x64.exe`, dev web stopped,
  `rm -rf client/.next` afterwards — `e2e/INSIGHTS.md:149`). Never `cd e2e && npm test` against the dev DB.
- **Rules that apply:** `e2e/CLAUDE.md` — deterministic locators only, no `chat` command.
- **Risk:** medium — date-input driving and cold Next compile timeouts (`e2e/INSIGHTS.md:157` item 4).

## Execution

| Lane | Executor | Work items | Files (disjoint) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| L0 — contracts + i18n | implementer | W1, W2 | both `vendor/shared/contracts/{productionize,observability}.ts`, `server/test/agent-performance-contracts.test.ts`, `client/messages/en/{agentPerformance,agents}.json` | — | — | shared tree |
| L1 — server | implementer | W3, W4, W5, W6 | `server/src/modules/agent-performance/**`, `server/src/modules/index.ts`, `server/src/db/{seed.ts,seed-performance.ts}`, `server/test/agent-performance{-rules,,-seed,-nfr}.*test.ts` | L0 | L2, L3, L4 | shared tree (no generator; W6 contingency `pnpm db:generate` would touch only `server/src/db/**` — run it with no other server lane active) |
| L2 — client foundation | implementer | W7, W8, W9, W10 | `client/src/lib/agent-performance*.ts`, `client/src/lib/hooks/agent-performance*`, `client/src/components/{PerfWindowSelector,EstimateLabel}/**`, `client/src/vendor/ui/{charts/Donut.tsx,nav.ts}`, `client/src/components/app-shell/{nav-context,helpers}.test.ts` | L0 | L1 | shared tree |
| L3 — dashboard | implementer | W11, W12, W13, W14 | `client/src/app/agent-performance/**` | L2 | L1, L4 | shared tree |
| L4 — Stats tab | implementer | W15, W16 | `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,AgentEditor.test.tsx,_components/StatsTab/**}` | L2 | L1, L3 | shared tree |
| L5 — e2e | implementer | W17 | `e2e/specs/10-agent-performance.flow.json` | L1 (W5), L3, L4 | — | hermetic stack (`./scripts/e2e.sh`); run alone — it builds `client/.next` |

Order: **L0 → (L1 ∥ L2) → (L3 ∥ L4, L1 may still be running) → L5 → integration.** Each executor is dispatched with
this plan's path **and its lane id**, and touches only its lane's files. L3 and L4 must not run `pnpm build`
concurrently (one `client/.next`); L3 owns the build step.

**Integration:** after L5, one agent (the caller) runs the full Verification plan below and the cross-lane checks:
both `vendor/shared` copies identical (sync tests in both packages); `agentPerformance` module registered once in
`server/src/modules/index.ts`; the seeded demo data visible on `/agent-performance` of a freshly seeded stack;
NFR-3 visible focus ring checked once in the browser; NFR-4 contrast measured in light and dark themes with
devtools ("small sample" mark and "DevDigest estimate" label included).

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | typecheck clean · unit suite green · `arch:check` no new violation vs. the pre-change count |
| `node scripts/verify.mjs server --it` | repo root | — | integration lane green with **0 skipped** (Docker up; nothing else hammering Docker) |
| `node scripts/verify.mjs client` | repo root | — | typecheck clean · full client unit suite green (covers the bracketed `[id]` tests the related-tests mode misses) |
| `pnpm build` | `client/` | pnpm | builds — new static route with `useSearchParams` behind `<Suspense>`; no dev server on the same `.next` |
| `./scripts/e2e.sh` | repo root | (npm inside e2e) | flows 01–10 pass on the isolated stack (Windows env vars per W17) |

## Assumptions

- **A1** — New server module `server/src/modules/agent-performance/`, not an extension of `modules/agents/`:
  `agents/service.ts` takes the whole `Container` (known debt, onion-architecture §5); a new module keeps the new
  code on injected ports and leaves the debt alone. Both routes live under `/agents/...` as the spec names them.
- **A2** — The counted-run predicate lives once in ring 1 (`isCountedRun`); SQL only pre-filters
  (`status IN ('done','failed','cancelled')`, window, workspace). `lastDoneRunAt` necessarily filters
  `status = COUNTED_STATUS` in SQL and imports that constant.
- **A3** — Findings counts are fetched per run (`GROUP BY reviews.run_id`) and summed in ring 1, so the AC-1 rule
  decides which runs' decisions count, and AC-14 parity cannot drift between two SQL paths.
- **A4** — No migration: at NFR scale the existing `agent_runs_ws_pr_ran_idx` (leading `workspace_id`),
  `reviews_run_idx` and `findings_review_idx` are expected to suffice; W6 carries a generated-index contingency.
- **A5** — The client measures the custom-range span as the server does (`to − from` in instants, ≤ 366 × 24 h), so
  a range the client accepts is never a 422 (Spec follow-up 3).
- **A6** — `PerfWindowQuery` lives in `@devdigest/shared` (it is part of the contract table); only the server
  value-imports it. Client code imports shared types with `import type` only.
- **A7** — AC-62 compares rate string and accepted/decided counts; denominator phrasing follows AC-40 (table) and
  AC-60 (Stats card) (Spec follow-up 1).
- **A8** — Strings rendered by both views (selector, estimate label, small-sample mark, "of decided", relative
  time) live in `agentPerformance`; Stats-only labels in `agents.stats.*` (Spec follow-up 2).
- **A9** — The View link always carries the resolved window (`days=30` when the URL has none) (Spec follow-up 4).
- **A10** — The NAV label is a literal in `vendor/ui/nav.ts`, like every other NAV item (Spec follow-up 5).
- **A11** — "6.2s", "78%" and "1,234" are produced by pure formatters (unit symbols, as `formatCost` produces "$"),
  not i18n templates.
- **A12** — Seed data hangs off a new demo PR #484 so PR #482 / #483 "latest review", their findings panels and e2e
  flows 02/04/05/09 are untouched; historic runs sit at fixed 2026-09 noon-UTC timestamps so the e2e custom range
  is deterministic in any browser timezone.
- **A13** — Server row order is agent name then id (deterministic); the client applies the AC-42 default order.
  `cost_by_agent` / `cost_by_model` are ordered cost desc then label (null model last on ties).
- **A14** — Window-selector presets are toggle buttons with `aria-pressed`; "selected" in AC-30 means pressed.
- **A15** — Response schemas are declared on both routes so the serializer enforces the contract at runtime.

## Open questions

None.

## Rollback / blast radius

Reverting the files removes both routes, both screens, the nav item and the Stats tab; the contracts revert to
their unused scaffold shapes (no consumer existed). Nothing in the schema changes (unless the W6 contingency index
was generated — then revert the generated migration only via a new `pnpm db:generate`, never by deleting an applied
file). What reverting files does NOT undo: rows already written by the new seed into an existing database — PR #484,
its reviews and findings, and the seeded `agent_runs` (fixed UUIDs listed in `seed-performance.ts`, deletable by id).
Until removed they keep feeding the multi-agent time/cost estimate (`multi-agent/repository.ts:137-154`) and the
PR-list cost of PR #484.
