---
name: flaky-test-guard
description: Use whenever a diff adds or changes a test. Flag every source of nondeterminism in the new test and name the input or ordering that would make it fail in CI but pass locally.
type: rubric
---

# Flaky test guard

A test that fails once a week is worse than no test: it trains the team to
re-run CI instead of reading it. Flag these, and say which line makes the test
nondeterministic.

## Time

- `Date.now()`, `new Date()` or a timezone-dependent format with no injected
  clock or fake timer.
- A fixed `sleep`, `setTimeout` or `waitFor` budget used as a substitute for
  waiting on a condition. Name the condition it should wait on instead.
- An assertion on elapsed time or on a timestamp's exact value.

## Ordering

- Asserting on the order of an unordered result: object key iteration, a SQL
  query with no `ORDER BY`, `Promise.all` results consumed positionally, or a
  set/map converted to an array.
- Two rows inserted back to back and then distinguished by a `defaultNow()`
  timestamp — they can share one.

## Shared state

- Module-level mutable state, a database row, or a temp directory reused across
  test cases without reset, so the suite passes only in the order it happens to
  run in.
- A test that depends on a value another test wrote.

## The outside world

- Real network, real filesystem outside a temp dir, real clock, real randomness.
  Each one needs a seam: an injected client, a fixture, a fake, a seed.

Report the line, the mechanism, and the concrete circumstance under which the
test fails. "Could be flaky" is not a finding.
