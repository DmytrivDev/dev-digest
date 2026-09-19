---
name: response-schema
description: Use when the diff changes what a route returns: a contract in vendor/shared/contracts, a DTO mapper in a module's helpers.ts, or a handler's return. Judge whether a consumer still parses it.
type: convention
---

# Response schema

The response contract is the Zod schema in `vendor/shared/contracts/*.ts` plus
the mapper in the module's `helpers.ts` that fills it (`toRepoDto`,
`toSkillDto`). The studio parses responses with the same schemas, so a shape
change in the mapper is a change every consumer sees. Compare the shape BEFORE
the diff with the shape AFTER, field by field.

## Field removed or renamed

Bad:
```ts
 export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
   return {
-    full_name: row.fullName,
+    fullName: row.fullName,
```
A consumer reading `full_name` now gets `undefined`. The wire is snake_case; a
camelCase key leaking out of a Drizzle row is a rename AND a convention break.
Good — the new key arrives beside the old one:
```ts
     full_name: row.fullName,
+    display_name: row.displayName ?? row.fullName,
```

## Presence or nullability flips

A field that was always present becoming optional or nullable breaks every
consumer that dereferences it.

Bad:
```ts
 export const Skill = z.object({
-  version: z.number().int(),
+  version: z.number().int().nullish(),
```
Good — the other direction is compatible: `agent_count: z.number().int().nullish()`
becoming always-present is not a finding.

## Type changed

Bad:
```ts
-  cost_usd: z.number(),
+  cost_usd: z.string(),
```
Even when the value is "the same number", a consumer that adds or formats it
breaks. Same for `string` to `string[]`, and for an ISO string to a Unix number.

## Enum member set changed

Any change to a RESPONSE enum's members. Adding a member breaks every exhaustive
`switch` on the consumer side; removing one breaks a consumer that filters or
displays by it.

Bad:
```ts
-export const Verdict = z.enum(['request_changes', 'approve', 'comment']);
+export const Verdict = z.enum(['request_changes', 'approve', 'comment', 'escalate']);
```
Good — the new state is carried by a new optional field until consumers can
handle it: `escalated: z.boolean().optional()`.

## Wrapper changed

An array becoming an object, an envelope added or removed, a single object
becoming a list.

Bad:
```ts
   app.get('/skills', async (req) => {
-    return service.list(workspaceId);
+    return { items: await service.list(workspaceId), total };
```
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
its shape after, and what a consumer does with it that now fails: "`SkillCard`
renders `version` as a number; it is now `null` for imported skills".
