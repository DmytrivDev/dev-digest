# Where `costUsd` comes from

The engine reports what a review cost as part of its normal return value. No
consumer needs to price anything, and nothing here makes an extra call.

## Per LLM call (`src/llm/openrouter.ts`)

Every `completeStructured` response carries the provider's `usage`. OpenRouter
adds a non-standard `usage.cost` (USD) that the OpenAI SDK's types don't know
about, so it is read through a cast and accumulated across retry attempts:

```ts
const apiCost = (res.usage as { cost?: number } | undefined)?.cost;
if (typeof apiCost === 'number') costFromApi = (costFromApi ?? 0) + apiCost;
…
costUsd: costFromApi ?? this.estimateCost?.(req.model, tokensIn, tokensOut) ?? null
```

So the precedence is **real price → estimate → `null`**:

1. `usage.cost` from the API, when the provider sends it;
2. the injected `estimateCost` hook (the server passes `PriceBook.estimate`,
   which uses live OpenRouter `/models` prices and falls back to a static table);
3. `null` — the call could not be priced at all.

`estimateCost` is synchronous by design, because it runs inside the provider's
per-call path where there is nothing to await.

## Per review (`src/review/run.ts`)

`reviewPullRequest` sums the per-call costs across chunks (map-reduce makes one
call per file; single-pass makes one call for the whole diff):

```ts
costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
```

This is deliberately **null-poisoning**: if any single call could not be priced,
the whole run's cost is `null` rather than a silently-too-small number. A run
that genuinely cost nothing (a free model) stays `0`, which is why consumers must
keep `null` and `0` distinct all the way to the UI ("—" vs "$0.00").

`ReviewOutcome` then exposes `tokensIn`, `tokensOut` and `costUsd` together —
read them from the outcome, never recompute them from tokens × price.
