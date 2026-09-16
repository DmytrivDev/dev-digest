# e2e (@devdigest/e2e)

Deterministic browser flows for the web app.

## Stack
Vercel `agent-browser` (Rust + CDP CLI). NOT Playwright. No LLM, no API key.

## Commands
- Install once: `npm i -g agent-browser && agent-browser install`
- Hermetic (ALWAYS prefer): `./scripts/e2e.sh` — isolated stack on :5433/:3101/:3100
- Against your own stack: `cd e2e && npm test` — only if your DB has ONLY the seed repo

## Conventions (not obvious from code)
- A flow is a JSON list of agent-browser commands in `specs/NN-name.flow.json`,
  run in order against one shared session by `run.ts`.
- `wait --text` / `wait --url` ARE the assertions — non-zero exit fails the step.
- Locators must be deterministic (`--url`, `--text`, `find role|text|label`).
  Never use the AI `chat` command — runs must be key-free and stable.
- `{BASE}` is substituted from `E2E_BASE_URL`.
- Flows target read-only seeded data, so nothing triggers a model call.

## Gotchas & do-not-touch
- Flows 02/04/05 follow the home redirect to the FIRST repo — they assume the seeded
  demo repo is the only one. Your dev DB usually has more → they fail. Use the
  hermetic runner.
- NEVER `docker compose down -v` to "reset" the dev DB — it deletes every imported
  repo and review.

## Use when
- Structure, flow format → `e2e/README.md`
- Flow scenarios → `e2e/specs/*.flow.json` · findings → `e2e/INSIGHTS.md`
