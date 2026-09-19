---
name: breaking-change
description: Use when the diff touches a Fastify route's path, method, params, querystring or body schema. Report every change that an existing caller's request would no longer survive.
type: convention
---

# Breaking change

A route in this repository is a published contract:
`app.<method>('<path>', { schema: { params, querystring, body } }, handler)`.
Callers you cannot see in the diff (the studio, CI, scripts) were written against
the OLD signature. Treat each change below as a break unless the same PR keeps
the old request working. Response bodies are judged by a separate rule; here,
judge the request and the status.

## Path or method changed

A changed path segment, a renamed path param, or a swapped method invalidates
every existing call.

Bad:
```ts
-  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, ...)
+  app.get('/repos/:repoId/convention-candidates', { schema: { params: RepoParams } }, ...)
```
Good — the old path stays, the new one is added beside it:
```ts
   app.get('/repos/:id/conventions', { schema: { params: IdParams } }, list);
+  app.get('/repos/:id/convention-candidates', { schema: { params: IdParams } }, list);
```

## Input field becomes required, or disappears

An optional body or query field turning required, or a field removed or
renamed, rejects a request that passed validation yesterday.

Bad:
```ts
 const CreateSkillBody = z.object({
-  description: z.string().max(DERIVED_DESCRIPTION_MAX).optional(),
+  description: z.string().max(DERIVED_DESCRIPTION_MAX),
-  enabled: z.boolean().optional(),
+  is_enabled: z.boolean().optional(),
 });
```
Good — a default instead of a requirement, and the new name arrives as an alias:
```ts
   description: z.string().max(DERIVED_DESCRIPTION_MAX).default(''),
   enabled: z.boolean().optional(),
+  is_enabled: z.boolean().optional(), // alias; `enabled` still accepted
```

## Accepted type, enum or range narrowed

Tightening what a schema accepts: `z.string()` to `z.string().uuid()`, an enum
member dropped, a `.max()` lowered, `z.coerce.number()` to `z.number()`.

Bad:
```ts
-export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
+export const SkillSource = z.enum(['manual', 'imported_url', 'extracted']);
```
Good — widening is always compatible; adding `'generated'` to the enum is not a
finding.

## Success status or rejection changed

A success code moving (`200` to `201`, `201` to `202`), a tolerated input now
throwing, or a `404` turning into a `422`.

Bad:
```ts
-  reply.status(201);
-  return skill;
+  reply.status(202);
+  return { job_id: job.id };
```

## Default changed under an absent field

A `.default(30)` becoming `.default(7)` changes what every caller that omits the
field gets back. It is a break for those callers; say which default moved.

## Not breaking — do not report

A new route. A new optional input field. A relaxed validation. A new enum member
on an INPUT schema. A rename of a Drizzle column (`fullName`) that the DTO mapper
still emits under the same wire name (`full_name`) — the contract is the wire
name, not the column.

## How to report

Cite the route line and the schema line. State the request that succeeded
before and fails after: "POST /skills without `description` now returns 422".
A break with a same-PR migration path (alias, default, versioned route) is a
lower severity than a bare removal.
