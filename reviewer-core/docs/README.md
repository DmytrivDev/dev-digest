# docs — reviewer-core

Deep-dives for the `reviewer-core` package (pipelines, diagrams, design notes).
`reviewer-core/CLAUDE.md` links here via *Use when*.

## Naming
One file per topic: `<topic>.md` (e.g. `review-context.md`). Add a line to this
index when you add a file — keep the index itself short, the depth goes in the file.

## Index
- [`cost-and-usage.md`](cost-and-usage.md) — how `costUsd` is priced per call and summed per review (real `usage.cost` → `estimateCost` → `null`, null-poisoning).
