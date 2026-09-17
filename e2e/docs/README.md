# docs — e2e

Deep-dives for the `e2e` package (pipelines, diagrams, design notes).
`e2e/CLAUDE.md` links here via *Use when*.

## Naming
One file per topic: `<topic>.md` (e.g. `review-context.md`). Add a line to this
index when you add a file — keep the index itself short, the depth goes in the file.

## Index
- [`adding-a-flow.md`](adding-a-flow.md) — how to cover a new UI surface with a flow: `wait` is the assertion, deterministic locators, seeded read-only data, never trigger a model call.
