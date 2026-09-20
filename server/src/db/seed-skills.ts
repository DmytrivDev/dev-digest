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

/**
 * The four API-contract skills, mirrored from `docs/skills/api-contract/`.
 *
 * They are seeded rather than left as files because a skill only exists for the
 * product when it is a ROW: the canonical markdown is what a human reviews, and
 * a fresh checkout has to come up with the same set an agent actually carries.
 * They replace the single `api-contract-guard`, which said all four things at
 * once and could not be enabled, versioned or attributed separately.
 */

export const BREAKING_CHANGE: SeedSkill = {
  name: 'breaking-change',
  description:
    'Use when the diff touches a Fastify route\'s path, method, params, querystring or body schema. Report every change that an existing caller\'s request would no longer survive.',
  type: 'convention',
  body: `# Breaking change

A route in this repository is a published contract:
\`app.<method>('<path>', { schema: { params, querystring, body } }, handler)\`.
Callers you cannot see in the diff (the studio, CI, scripts) were written against
the OLD signature. Treat each change below as a break unless the same PR keeps
the old request working. Response bodies are judged by a separate rule; here,
judge the request and the status.

## Path or method changed

A changed path segment, a renamed path param, or a swapped method invalidates
every existing call.

Bad:
\`\`\`ts
-  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, ...)
+  app.get('/repos/:repoId/convention-candidates', { schema: { params: RepoParams } }, ...)
\`\`\`
Good — the old path stays, the new one is added beside it:
\`\`\`ts
   app.get('/repos/:id/conventions', { schema: { params: IdParams } }, list);
+  app.get('/repos/:id/convention-candidates', { schema: { params: IdParams } }, list);
\`\`\`

## Input field becomes required, or disappears

An optional body or query field turning required, or a field removed or
renamed, rejects a request that passed validation yesterday.

Bad:
\`\`\`ts
 const CreateSkillBody = z.object({
-  description: z.string().max(DERIVED_DESCRIPTION_MAX).optional(),
+  description: z.string().max(DERIVED_DESCRIPTION_MAX),
-  enabled: z.boolean().optional(),
+  is_enabled: z.boolean().optional(),
 });
\`\`\`
Good — a default instead of a requirement, and the new name arrives as an alias:
\`\`\`ts
   description: z.string().max(DERIVED_DESCRIPTION_MAX).default(''),
   enabled: z.boolean().optional(),
+  is_enabled: z.boolean().optional(), // alias; \`enabled\` still accepted
\`\`\`

## Accepted type, enum or range narrowed

Tightening what a schema accepts: \`z.string()\` to \`z.string().uuid()\`, an enum
member dropped, a \`.max()\` lowered, \`z.coerce.number()\` to \`z.number()\`.

Bad:
\`\`\`ts
-export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
+export const SkillSource = z.enum(['manual', 'imported_url', 'extracted']);
\`\`\`
Good — widening is always compatible; adding \`'generated'\` to the enum is not a
finding.

## Success status or rejection changed

A success code moving (\`200\` to \`201\`, \`201\` to \`202\`), a tolerated input now
throwing, or a \`404\` turning into a \`422\`.

Bad:
\`\`\`ts
-  reply.status(201);
-  return skill;
+  reply.status(202);
+  return { job_id: job.id };
\`\`\`

## Default changed under an absent field

A \`.default(30)\` becoming \`.default(7)\` changes what every caller that omits the
field gets back. It is a break for those callers; say which default moved.

## Not breaking — do not report

A new route. A new optional input field. A relaxed validation. A new enum member
on an INPUT schema. A rename of a Drizzle column (\`fullName\`) that the DTO mapper
still emits under the same wire name (\`full_name\`) — the contract is the wire
name, not the column.

## How to report

Cite the route line and the schema line. State the request that succeeded
before and fails after: "POST /skills without \`description\` now returns 422".
A break with a same-PR migration path (alias, default, versioned route) is a
lower severity than a bare removal.`,
};

export const RESPONSE_SCHEMA: SeedSkill = {
  name: 'response-schema',
  description:
    'Use when the diff changes what a route returns: a contract in vendor/shared/contracts, a DTO mapper in a module\'s helpers.ts, or a handler\'s return. Judge whether a consumer still parses it.',
  type: 'convention',
  body: `# Response schema

The response contract is the Zod schema in \`vendor/shared/contracts/*.ts\` plus
the mapper in the module's \`helpers.ts\` that fills it (\`toRepoDto\`,
\`toSkillDto\`). The studio parses responses with the same schemas, so a shape
change in the mapper is a change every consumer sees. Compare the shape BEFORE
the diff with the shape AFTER, field by field.

## Field removed or renamed

Bad:
\`\`\`ts
 export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
   return {
-    full_name: row.fullName,
+    fullName: row.fullName,
\`\`\`
A consumer reading \`full_name\` now gets \`undefined\`. The wire is snake_case; a
camelCase key leaking out of a Drizzle row is a rename AND a convention break.
Good — the new key arrives beside the old one:
\`\`\`ts
     full_name: row.fullName,
+    display_name: row.displayName ?? row.fullName,
\`\`\`

## Presence or nullability flips

A field that was always present becoming optional or nullable breaks every
consumer that dereferences it.

Bad:
\`\`\`ts
 export const Skill = z.object({
-  version: z.number().int(),
+  version: z.number().int().nullish(),
\`\`\`
Good — the other direction is compatible: \`agent_count: z.number().int().nullish()\`
becoming always-present is not a finding.

## Type changed

Bad:
\`\`\`ts
-  cost_usd: z.number(),
+  cost_usd: z.string(),
\`\`\`
Even when the value is "the same number", a consumer that adds or formats it
breaks. Same for \`string\` to \`string[]\`, and for an ISO string to a Unix number.

## Enum member set changed

Any change to a RESPONSE enum's members. Adding a member breaks every exhaustive
\`switch\` on the consumer side; removing one breaks a consumer that filters or
displays by it.

Bad:
\`\`\`ts
-export const Verdict = z.enum(['request_changes', 'approve', 'comment']);
+export const Verdict = z.enum(['request_changes', 'approve', 'comment', 'escalate']);
\`\`\`
Good — the new state is carried by a new optional field until consumers can
handle it: \`escalated: z.boolean().optional()\`.

## Wrapper changed

An array becoming an object, an envelope added or removed, a single object
becoming a list.

Bad:
\`\`\`ts
   app.get('/skills', async (req) => {
-    return service.list(workspaceId);
+    return { items: await service.list(workspaceId), total };
\`\`\`
Good — a new route or a new query flag delivers the envelope; the bare list
stays where it was.

## Schema and mapper disagree

A field added to the mapper but not to the Zod contract, or the reverse, is a
defect: the client's parse either drops the field or fails. Cite both lines.

## Compatible — do not report

A new field. A nullable field that becomes always-present. A wider numeric or
string constraint. A rename of a Drizzle column that the mapper still emits
under the old wire name.

## How to report

Cite the contract line and the mapper line. Name the field, its shape before,
its shape after, and what a consumer does with it that now fails: "\`SkillCard\`
renders \`version\` as a number; it is now \`null\` for imported skills".`,
};

export const SEMVER_DISCIPLINE: SeedSkill = {
  name: 'semver-discipline',
  description:
    'Use when the diff changes a package.json version, a public export from vendor/shared or reviewer-core, or an HTTP contract. Check that the version bump matches the kind of change.',
  type: 'convention',
  body: `# Semver discipline

The \`version\` in \`package.json\` is the only signal a consumer gets before
reading the diff. Every package here (\`server/\`, \`client/\`, \`reviewer-core/\`)
carries its own. Decide what KIND of change the diff makes, then check the bump
that accompanies it.

## Which bump the diff earns

- MAJOR — a route, wire field, enum member or public export is removed or
  renamed; an input requirement is tightened; a response shape changes; an
  interface in \`vendor/shared/adapters.ts\` gains a required member.
- MINOR — a new route, a new optional input field, a new response field, a new
  export, a new enum member on an input schema.
- PATCH — behaviour is fixed with no change to any of the above.

Under \`0.x\` the same rule applies one digit to the right: MINOR is the breaking
bump and PATCH is the additive one. The rule does not relax; only the digit
moves.

## The bump matches the change

Bad — a removed enum member shipped as a patch:
\`\`\`diff
 // server/package.json
-  "version": "1.4.2",
+  "version": "1.4.3",
 // server/src/vendor/shared/contracts/knowledge.ts
-export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
+export const SkillSource = z.enum(['manual', 'imported', 'extracted']);
\`\`\`
Good:
\`\`\`diff
+  "version": "2.0.0",
\`\`\`
with a changelog line naming the removed member and its replacement.

## A bump is present at all

A diff that removes or renames a public export and never touches
\`package.json\` is a finding on its own. Cite the export line and say that no
version line appears in the diff.

## Public export removed or renamed

\`\`\`ts
 // server/src/vendor/shared/index.ts
-export * from './contracts/why.js';
\`\`\`
Every \`import { WhyReport } from '@devdigest/shared'\` in the other package
breaks. \`@devdigest/shared\` exists as TWO vendored copies (\`server/src/vendor/\`,
\`client/src/vendor/\`): a removal must appear in both, and the bump is major.

## Interface widened in the wrong direction

\`\`\`ts
 export interface GitClient {
   readFile(repoPath: string, ref: string, path: string): Promise<string>;
+  listFiles(repoPath: string, ref: string): Promise<string[]>;
\`\`\`
A new REQUIRED member breaks every implementer, including the test fakes —
major. \`listFiles?(...)\` (optional) is minor.

## Version and changelog agree

A major bump with no line explaining what broke, or a break with no bump: the
finding is the mismatch. Cite the \`package.json\` line and the contract line
together.

## Do not report

Bumps of \`devDependencies\` or lockfile-only changes. Changes under \`test/\`
or \`fixtures/\`. A version bump with no contract change (harmless).`,
};

export const DEPRECATION_POLICY: SeedSkill = {
  name: 'deprecation-policy',
  description:
    'Use when the diff deletes or renames a route, a wire field, an enum member or a public export. Check that the removal was announced first and the old path still works for now.',
  type: 'convention',
  body: `# Deprecation policy

Nothing a caller depends on disappears in one step. A legitimate removal is
the SECOND diff; the FIRST one marks the thing deprecated and keeps it working.
When the diff removes something, look for the evidence below in the removed
(\`-\`) lines and in the same PR. A removal with none of it is a silent break.

## A route: keep the old path answering

Bad — the rename is the removal:
\`\`\`ts
-  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, list);
+  app.get('/repos/:id/convention-candidates', { schema: { params: IdParams } }, list);
\`\`\`
Good — step one, the old route stays and says it is going:
\`\`\`ts
+  /** @deprecated since 1.5 — use GET /repos/:id/convention-candidates; removed in 2.0 */
   app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req, reply) => {
+    reply.header('Deprecation', 'true');
+    reply.header('Sunset', 'Wed, 01 Apr 2027 00:00:00 GMT');
     return list(req, reply);
   });
+  app.get('/repos/:id/convention-candidates', { schema: { params: IdParams } }, list);
\`\`\`

## A wire field: emit both, mark the old one

Bad — the mapper renames in place:
\`\`\`ts
-    clone_path: row.clonePath,
+    local_path: row.clonePath,
\`\`\`
Good — both keys for one release, the contract carries the notice:
\`\`\`ts
     clone_path: row.clonePath,
+    local_path: row.clonePath,
\`\`\`
\`\`\`ts
   /** @deprecated since 1.5 — read \`local_path\`; removed in 2.0 */
   clone_path: z.string().describe('Deprecated: use local_path'),
+  local_path: z.string(),
\`\`\`

## An input value: accept and translate, do not reject

An old enum member or field stays accepted and is mapped to the new one in the
service, so an unchanged caller keeps working.

Bad:
\`\`\`ts
-export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
+export const SkillSource = z.enum(['manual', 'imported', 'extracted', 'community']);
\`\`\`
Good:
\`\`\`ts
 export const SkillSource = z.enum(['manual', 'imported_url', 'imported', 'extracted', 'community']);
 // service.ts
+const source = input.source === 'imported_url' ? 'imported' : input.source; // legacy alias
\`\`\`

## What the diff must show for a removal to be legitimate

1. The deprecation marker already existed: a \`@deprecated\` comment, a
   \`.describe('Deprecated…')\`, or a \`Deprecation\` header appears in the REMOVED
   lines, not only in the PR description.
2. The replacement was already in place before this diff, not added by it.
3. The \`package.json\` bump the removal earns is in the diff.

Missing one of the three is a finding that names which one. Missing all three
is a silent removal.

## Do not report

Removal of a helper that was never exported or routed. Removal of something
this same PR added. Test files and fixtures. A \`@deprecated\` marker being
added — that is the policy working.

## How to report

Cite the removed line, name what a caller sent or read there, and state which
of the three pieces of evidence is absent.`,
};

export const SEED_SKILLS: readonly SeedSkill[] = [
  TEST_QUALITY_RUBRIC,
  BREAKING_CHANGE,
  RESPONSE_SCHEMA,
  SEMVER_DISCIPLINE,
  DEPRECATION_POLICY,
];
