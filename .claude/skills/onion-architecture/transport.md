# Transport: routes as driving adapters

Ring 4's inbound half. Read [SKILL.md](SKILL.md) §3 ban 1 first. For *how* to write a
Fastify route, hook or plugin, use the `fastify-best-practices` skill; for schema authoring,
the `zod` skill. This file is only about what a route is allowed to contain.

## A route does four things

`repos/routes.ts` states the contract in its own header — "Transport layer only: parses
requests, maps status codes, and delegates all business logic to RepoService." Expanded,
a handler may:

1. **Declare** its Zod `params` / `body` / `querystring` schema
2. **Resolve tenancy** via `getContext(container, req)`
3. **Delegate** to exactly one service method
4. **Map** the result to a status code

Anything else is a smell. Concretely, a handler must not contain: a SQL query, a loop over
rows computing a total, an `if` on a business condition, a `try/catch` that decides product
behaviour, or a call to an adapter.

```ts
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  const { repo, created } = await service.add(workspaceId, userId, req.body.url);
  reply.status(created ? 201 : 200);
  return repo;
});
```

Four lines: context, delegate, status, return. `created ? 201 : 200` is the *right* kind of
route logic — it is an HTTP concern, and the service returning `{ repo, created }` instead
of throwing on duplicate is what keeps it one.

## Wiring

`routes.ts` is ring 4, so it is the legitimate place to read `app.container` and construct
the module's service — see [SKILL.md](SKILL.md) §4:

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container.reposRepo, app.container.git, /* … */);
  service.registerCloneJobHandler();
  // routes…
}
```

**`withTypeProvider<ZodTypeProvider>()` is per-module.** The compilers are set once in
`app.ts` (`setValidatorCompiler` / `setSerializerCompiler`), but each module opts into the
*types* itself. Skip it and your `req.params` is `unknown`.

**Register the module in `modules/index.ts`** — one import, one entry. Registration is
static, not autoloaded, deliberately: "so the same code path works under tsx, the bundler,
and vitest — native dynamic `import()` of .ts files is not portable."

## Zod at the boundary

**Parse once, at the edge, declaratively.** Validation is schema-first: routes declare Zod
`params`/`body` and Fastify parses before the handler runs. Never `Schema.parse(req.body)`
inside a handler — it duplicates what the type provider already did and it produces a raw
`ZodError` instead of the structured envelope the error handler builds.

The consequence for the inner rings is the point: **ring 3 receives parsed, typed values and
may assume they are valid.** A service re-validating its own arguments is a sign the parse
did not happen at the boundary.

Response schemas are also worth declaring — `serializerCompiler` will strip unknown fields,
which is the cheapest guard against accidentally returning a Drizzle row (ban 3) where a DTO
was meant.

## Errors

The taxonomy lives in `platform/errors.ts` — ring 1, importable from anywhere:

| Class | Code | Status |
|---|---|---|
| `AppError` | (given) | 400 |
| `NotFoundError` | `not_found` | 404 |
| `ValidationError` | `validation_error` | 422 |
| `ExternalServiceError` | `external_service_error` | 502 |
| `ConfigError` | `config_error` | 500 |

**Services throw these; the route does not catch them.** `app.ts` has one error handler that
turns an `AppError` into the `ApiErrorBody` envelope (`{ error: { code, message, details } }`)
and handles Zod validation/serialization failures. A `try/catch` in a handler that converts
an error into a different status is business logic in ring 4.

**Adapters translate vendor failures into this taxonomy.** An Octokit 404 becomes
`NotFoundError`, a network failure becomes `ExternalServiceError`. A `RequestError` from
Octokit reaching ring 3 means the adapter did half its job.

## Degrade, don't throw — when it is a product decision

Some failures are not errors. `server/CLAUDE.md`: "Context enrichment is best-effort: on
error/unindexed, omit the section, don't throw." `pulls/routes.ts` does the same for GitHub
— on an unavailable client it logs a warning and serves persisted PRs.

That choice is a **product rule, not a transport concern**. The pattern to follow: the
service decides to degrade and returns a partial result; the route just returns it. A route
deciding on its own to swallow an error is ring 4 making a ring-3 decision.

## Jobs — the second driving adapter

`platform/jobs.ts` (`JobRunner`) is a driving adapter with no HTTP. A handler is registered
by kind and a payload is enqueued:

```ts
this.jobs.register(CLONE_JOB_KIND, async (payload) => {
  await this.runCloneJob(payload as CloneJobPayload);
});
```

Rules:

- **Register once**, at module setup (`service.registerCloneJobHandler()` from `routes.ts`).
- **Payloads are plain serialisable data** — ids and primitives, never a row, a class
  instance or a port. The payload survives a process boundary; typed handles do not.
- **Job kinds are constants**, in `modules/<name>/constants.ts`. `enqueue` throws if no
  handler is registered for the kind, so a typo is a runtime failure, not a no-op.
- **The handler body belongs in the service**, not in the closure — that is what makes
  `runCloneJob` directly testable without the runner.

⚠️ **Known hazard, not yet fixed:** a failed job rethrows and rejects the `done` promise,
which no call site awaits — under Node 22 that unhandled rejection **kills the API process**.
The symptom is misleading: the UI still renders (Next.js is a separate process) with empty
lists, looking like data loss. `curl localhost:3001/health` before suspecting the database.
Until it is fixed, treat any new `enqueue` call site as a place that must handle `done`.

## SSE

`platform/sse.ts` (`runBus`) streams `RunEvent`s to the client. Same rule as everything
else: **services publish domain events to the bus; the route subscribes and serialises.**
The bus carries `@devdigest/shared` contract types, so ring 3 emits meaning ("a chunk
finished") and ring 4 decides it becomes an SSE frame. A service formatting an SSE frame has
reached outward.
