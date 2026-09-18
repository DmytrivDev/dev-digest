/**
 * Built-in skill bodies used by the seed (L02).
 *
 * A skill is TEXT and nothing else: the body below is appended verbatim to a
 * linked agent's prompt under `## Skills / rules`. There is no templating, no
 * execution, and no access to anything but the words here — which is what makes
 * a skill safe to share between agents and safe to accept from someone else.
 *
 * The `description` is the skill's *interface*: it is what tells the model WHEN
 * the rules below apply, so it is written directively, not as a summary.
 *
 * Keep these bodies short. A skill competes with the diff for the context
 * window, and its token cost is visible in the run trace.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const TEST_QUALITY_RUBRIC: SeedSkill = {
  name: 'test-quality-rubric',
  description:
    'Use whenever a diff adds or changes tests. Check every branch the change introduces against the tests that claim to cover it, and report the ones nothing enters.',
  type: 'rubric',
  body: `Apply this rubric to the test files in the diff.

## 1. Branch coverage, concretely
List every conditional the production change introduces or touches —
\`if\`/\`else\`, \`switch\` arms, ternaries, \`??\`/\`||\` fallbacks, early returns,
guard clauses, \`catch\` blocks, retry and timeout paths. For each one, name the
test that enters it. A branch with no such test is a finding, and the finding
must name the branch and an input that would reach it.

An \`else\` with no test is not "implicitly covered" by the \`if\` test.

## 2. Corner cases the happy path hides
Check each of these that applies to the change, and flag the ones no test
exercises:
- empty collection, single element, and the last element
- \`0\`, negative, and fractional numbers where only positives are tested
- \`null\` vs \`undefined\` vs an absent key
- boundary values either side of every comparison (\`<\` vs \`<=\`)
- duplicate or repeated input, and a repeated call to the same function
- the failure path of every call that can reject or throw

## 3. Tests that cannot fail
Flag an assertion that is true by construction: comparing a literal to itself,
\`toBeDefined()\` on a value built on the line above, a \`try/catch\` that swallows
the failure, a test body with no assertion, and a snapshot of mocked output.

## 4. Mocking that voids the test
Flag a test that mocks the unit it is named after, asserts only that a mock was
called rather than what the code produced, or stubs so much that no production
line runs. Prefer a fake at the system boundary over a mock of our own code.

## 5. Flake sources
Flag reliance on wall-clock time, fixed \`sleep\`/timeout values, \`Date.now()\` or
\`Math.random()\` without injection, real network or filesystem access, ordering
assumptions over unordered results, and state shared between test cases.

Report what is missing, where, and what input would cover it. Do not ask for a
test that only restates one that already exists.`,
};

export const API_CONTRACT_GUARD: SeedSkill = {
  name: 'api-contract-guard',
  description:
    'Use whenever a diff changes an HTTP route, its params, its request body, or its response shape. Decide whether the change breaks an existing caller, and report it as breaking when it does.',
  type: 'convention',
  body: `Treat every route signature in the diff as a published contract with
callers you cannot see.

## What counts as breaking
- removing or renaming a route, a path param, a query param, or a body field
- making an optional request field required, or narrowing its accepted type,
  enum, or range
- removing a response field, renaming one, or changing its type
- changing a success status code, or turning a tolerated input into a rejection
- changing the default of a parameter callers rely on
- tightening validation (a stricter schema) on an existing endpoint

## What does not count
Adding an optional request field, adding a response field, adding a new route,
and relaxing validation are all compatible — do not report them as breaking.

## How to report one
State the old signature, the new signature, and the concrete request that used
to succeed and now fails. Name the file and line of the change, and of the
schema or type that defines the contract if it is also in the diff. A breaking
change with no migration path in the same PR is the finding; a breaking change
with a documented one is worth a lower severity.

## Wire-shape conventions to check
Fields on the wire are snake_case. The schema is the contract: a field that
exists in the type but not in the validation schema (or the reverse) is a
defect, not a style issue. A field that can be absent must be distinguishable
from one that is present and empty.`,
};

export const SEED_SKILLS: readonly SeedSkill[] = [TEST_QUALITY_RUBRIC, API_CONTRACT_GUARD];
