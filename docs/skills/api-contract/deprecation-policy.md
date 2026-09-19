---
name: deprecation-policy
description: Use when the diff deletes or renames a route, a wire field, an enum member or a public export. Check that the removal was announced first and the old path still works for now.
type: convention
---

# Deprecation policy

Nothing a caller depends on disappears in one step. A legitimate removal is
the SECOND diff; the FIRST one marks the thing deprecated and keeps it working.
When the diff removes something, look for the evidence below in the removed
(`-`) lines and in the same PR. A removal with none of it is a silent break.

## A route: keep the old path answering

Bad — the rename is the removal:
```ts
-  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, list);
+  app.get('/repos/:id/convention-candidates', { schema: { params: IdParams } }, list);
```
Good — step one, the old route stays and says it is going:
```ts
+  /** @deprecated since 1.5 — use GET /repos/:id/convention-candidates; removed in 2.0 */
   app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req, reply) => {
+    reply.header('Deprecation', 'true');
+    reply.header('Sunset', 'Wed, 01 Apr 2027 00:00:00 GMT');
     return list(req, reply);
   });
+  app.get('/repos/:id/convention-candidates', { schema: { params: IdParams } }, list);
```

## A wire field: emit both, mark the old one

Bad — the mapper renames in place:
```ts
-    clone_path: row.clonePath,
+    local_path: row.clonePath,
```
Good — both keys for one release, the contract carries the notice:
```ts
     clone_path: row.clonePath,
+    local_path: row.clonePath,
```
```ts
   /** @deprecated since 1.5 — read `local_path`; removed in 2.0 */
   clone_path: z.string().describe('Deprecated: use local_path'),
+  local_path: z.string(),
```

## An input value: accept and translate, do not reject

An old enum member or field stays accepted and is mapped to the new one in the
service, so an unchanged caller keeps working.

Bad:
```ts
-export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
+export const SkillSource = z.enum(['manual', 'imported', 'extracted', 'community']);
```
Good:
```ts
 export const SkillSource = z.enum(['manual', 'imported_url', 'imported', 'extracted', 'community']);
 // service.ts
+const source = input.source === 'imported_url' ? 'imported' : input.source; // legacy alias
```

## What the diff must show for a removal to be legitimate

1. The deprecation marker already existed: a `@deprecated` comment, a
   `.describe('Deprecated…')`, or a `Deprecation` header appears in the REMOVED
   lines, not only in the PR description.
2. The replacement was already in place before this diff, not added by it.
3. The `package.json` bump the removal earns is in the diff.

Missing one of the three is a finding that names which one. Missing all three
is a silent removal.

## Do not report

Removal of a helper that was never exported or routed. Removal of something
this same PR added. Test files and fixtures. A `@deprecated` marker being
added — that is the policy working.

## How to report

Cite the removed line, name what a caller sent or read there, and state which
of the three pieces of evidence is absent.
