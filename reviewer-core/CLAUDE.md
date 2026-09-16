# reviewer-core (@devdigest/reviewer-core)

Pure review engine: diff → prompt → LLM → grounded findings.

## Iron rule
No I/O — no DB, fs, GitHub, or persistence. The ONLY side effect is the injected
`LLMProvider`. The same code runs in the studio and in CI. Keep it pure.

## Stack
TypeScript ESM, zero runtime deps beyond the injected provider. Emits no JS —
`build` is a typecheck; the server consumes the SOURCE via a tsconfig path alias.

## Commands
`npm test` (vitest, stubbed LLMProvider — no keys, no network) · `npm run typecheck`

## Conventions (not obvious from code)
- The grounding gate (`src/grounding.ts`) is mandatory; `score` is recomputed from
  findings that SURVIVED grounding — the model's self-reported score is ignored.
- skills/memory/specs arrive as RESOLVED strings (slug→body is the caller's job).
- Prompt-injection defense is ONE trusted rule (`INJECTION_GUARD` in `prompt.ts`),
  appended to every agent's system prompt. Do NOT add keyword scanning of untrusted
  text — a denylist catches one phrasing out of a thousand.
- `ReviewOutcome` already carries `tokensIn`/`tokensOut`/`costUsd` — READ them, never
  recompute. Cost goes `null` if any chunk lacked one (conservative by design).

## Gotchas & do-not-touch
- The output JSON shape is enforced out of band (`response_format: json_schema`,
  strict) — never describe field names or markdown layout in prompt text.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) exist but are unfed
  in the starter; empty slots are omitted by `assemblePrompt`, not an error.

## Use when
- Pipeline diagram, public API → `reviewer-core/README.md`
- Prompt-authoring rules → `docs/agent-prompts/`
- Deep-dives → `reviewer-core/docs/` · specs → `reviewer-core/specs/`
- Findings → `reviewer-core/INSIGHTS.md`
