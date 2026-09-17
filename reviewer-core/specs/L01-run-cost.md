# L01 — Run cost (USD): engine contract

What the engine owes its consumers so the studio can show per-run cost without
any extra model call.

## Requirements

1. `reviewPullRequest` returns `costUsd: number | null` on `ReviewOutcome`,
   alongside `tokensIn` / `tokensOut`, for every completed review.
2. The value is accumulated from the provider responses that the review already
   made — the engine never issues an extra call, and never re-derives cost from
   tokens × price after the fact.
3. Per call the price is: the provider's real `usage.cost` if present, else the
   injected `estimateCost` hook, else `null`.
4. Across calls the sum is null-poisoning: one un-priced call ⇒ the run's
   `costUsd` is `null`. A genuinely free run stays `0`.
5. `estimateCost` stays synchronous — it is called from a path that cannot await.

## Acceptance criteria

1. A single-pass review against a priced model returns a non-null `costUsd`
   equal to that one call's cost.
2. A map-reduce review returns the sum over its chunks.
3. Mocking one chunk's response without a cost makes the whole run's `costUsd`
   `null`, not a partial sum.
4. A provider that returns `usage.cost` wins over the `estimateCost` hook.
5. Removing the `estimateCost` hook entirely still yields a review — with
   `costUsd: null`, not a thrown error.
