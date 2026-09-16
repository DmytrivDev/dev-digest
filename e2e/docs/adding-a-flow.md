# Adding a flow for a new UI surface

`README.md` explains how the runner works; this is what to do when a feature
adds a screen element you want covered. A flow is a JSON list of agent-browser
commands — there is no test framework, no assertions API, and no LLM.

## The rules that actually bite

1. **`wait` IS the assertion.** `wait --text "$0.0039"` fails the step (non-zero
   exit) if the text never appears. A flow made only of `open` + `find … click`
   asserts nothing — it just clicks around and passes.
2. **Deterministic locators only** — `--url`, `--text`, `find role|text|label`.
   The AI `chat` command is never used, which is what keeps runs key-free and
   stable.
3. **Seeded, read-only data.** Flows target the demo repo `acme/payments-api`,
   PR #482 and the seeded agents. A flow must never trigger a model call, so
   never click "Run Review" — assert against what the seed already produced.
4. **The seeded DB must be fresh.** Flow `02` follows the home redirect to the
   *first* repo, so it assumes the demo repo is the only one. Locally, run the
   hermetic stack (`./scripts/e2e.sh`) — never point e2e at the dev DB.

## Writing one

- name the file `specs/NN-<topic>.flow.json`; run order is lexical;
- give each step a `label` — it is what the failure report prints;
- `{BASE}` expands to `E2E_BASE_URL` (default `http://localhost:3000`);
- add `"assert": { "stdoutIncludes": "…" }` only when the command prints
  something worth checking; usually `wait --text` is enough.

## Covering a value-bearing cell (e.g. per-run cost)

A number rendered from the database is only worth asserting if the seed produces
it deterministically. The seed ships PRs, agents, a review and its findings — it
does **not** ship priced agent runs, so a flow cannot assert a concrete `$`
value today; it can only assert the COST column's header exists and that an
un-priced PR shows the em dash. If a future seed adds runs with `cost_usd`,
assert the exact string (`wait --text "$0.0039"`) — the formatting rule lives in
`client/src/lib/cost.ts` and is unit-tested there, so the flow only needs to
prove the value reaches the screen.
