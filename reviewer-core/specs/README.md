# specs — reviewer-core

Specs / acceptance criteria for the `reviewer-core` package.

## Naming
One file per lesson feature: `L0N-<feature>.md` (e.g. `L02-conventions-extractor.md`).
Requirements + acceptance criteria only — implementation notes belong in `docs/`,
findings from building it belong in `INSIGHTS.md`.

## Index
- [`L01-run-cost.md`](L01-run-cost.md) — engine contract for per-run cost: what `ReviewOutcome` must carry and why no extra model call is allowed.

> **Closed to new specs.** New features are specified once, across packages, in the root
> `specs/SPEC-NN-<slug>.md` (see `specs/README.md`, written by the `spec-creator` agent). The
> files here are the L01–L04 history: cite and supersede them, never extend them.
