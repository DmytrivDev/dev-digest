---
name: semver-discipline
description: Use when the diff changes a package.json version, a public export from vendor/shared or reviewer-core, or an HTTP contract. Check that the version bump matches the kind of change.
type: convention
---

# Semver discipline

The `version` in `package.json` is the only signal a consumer gets before
reading the diff. Every package here (`server/`, `client/`, `reviewer-core/`)
carries its own. Decide what KIND of change the diff makes, then check the bump
that accompanies it.

## Which bump the diff earns

- MAJOR — a route, wire field, enum member or public export is removed or
  renamed; an input requirement is tightened; a response shape changes; an
  interface in `vendor/shared/adapters.ts` gains a required member.
- MINOR — a new route, a new optional input field, a new response field, a new
  export, a new enum member on an input schema.
- PATCH — behaviour is fixed with no change to any of the above.

Under `0.x` the same rule applies one digit to the right: MINOR is the breaking
bump and PATCH is the additive one. The rule does not relax; only the digit
moves.

## The bump matches the change

Bad — a removed enum member shipped as a patch:
```diff
 // server/package.json
-  "version": "1.4.2",
+  "version": "1.4.3",
 // server/src/vendor/shared/contracts/knowledge.ts
-export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
+export const SkillSource = z.enum(['manual', 'imported', 'extracted']);
```
Good:
```diff
+  "version": "2.0.0",
```
with a changelog line naming the removed member and its replacement.

## A bump is present at all

A diff that removes or renames a public export and never touches
`package.json` is a finding on its own. Cite the export line and say that no
version line appears in the diff.

## Public export removed or renamed

```ts
 // server/src/vendor/shared/index.ts
-export * from './contracts/why.js';
```
Every `import { WhyReport } from '@devdigest/shared'` in the other package
breaks. `@devdigest/shared` exists as TWO vendored copies (`server/src/vendor/`,
`client/src/vendor/`): a removal must appear in both, and the bump is major.

## Interface widened in the wrong direction

```ts
 export interface GitClient {
   readFile(repoPath: string, ref: string, path: string): Promise<string>;
+  listFiles(repoPath: string, ref: string): Promise<string[]>;
```
A new REQUIRED member breaks every implementer, including the test fakes —
major. `listFiles?(...)` (optional) is minor.

## Version and changelog agree

A major bump with no line explaining what broke, or a break with no bump: the
finding is the mismatch. Cite the `package.json` line and the contract line
together.

## Do not report

Bumps of `devDependencies` or lockfile-only changes. Changes under `test/`
or `fixtures/`. A version bump with no contract change (harmless).
