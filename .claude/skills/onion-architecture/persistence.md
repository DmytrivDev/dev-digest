# Persistence: repositories, DTOs, transactions

Ring 3's data-access half and its boundary with ring 4. Read [SKILL.md](SKILL.md) §3 ban 3
first. For *how* to write a Drizzle query, use the `drizzle-orm-patterns` skill — this file
is only about where the query may live and what may come back out.

## Why we keep repositories at all

Honestly: **not** to swap the database. Jay Freestone's critique lands — with a typed query
builder, a repository that grows `findActiveById`, `getWithProduct`, `listByFilter(opts)`
becomes a worse interface over the database than the database's own. And swapping Postgres
for something else would change our problem, not just our driver.

Our repositories earn their keep for two different reasons, and **a repository that serves
neither is dead weight**:

1. **Tenancy chokepoint.** Every domain table has `workspace_id`. Concentrating queries in
   one class per table makes "is this scoped?" a property you can verify by reading one
   file, instead of an invariant re-checked at every call site.
2. **Test grade.** With persistence behind a class, ring-1 rules take rows as arguments and
   test with no Docker. That is exactly how `pulls/cost.ts` gets unit coverage while the
   same logic inline in the route would have needed `.it.test.ts`.

So: a repository is a **table-scoped, tenancy-guarding query chokepoint**, not a domain
abstraction. Name it after the table, not a fantasy aggregate.

## Shape

```ts
export class RepoRepository {
  constructor(private db: Db) {}

  async getById(workspaceId: string, id: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row;
  }
}
```

Rules:

- **`workspaceId` is the first parameter of every read and write.** Not optional, not
  defaulted, not pulled from ambient state. A method that cannot be scoped needs a comment
  saying why.
- **One table per repository** — `repos/repository.ts` documents itself as "The ONLY place
  that touches the `repos` table". Cross-table reads used by several modules go in the
  composition root's shared repositories (`container.agentsRepo`, `container.reviewRepo`),
  not by reaching into another module's folder.
- **No business rules.** A repository filters, sorts, paginates and writes. It does not
  decide what a score means or which run counts. Those are ring 1.
- **Inject `Db`, not `Container`.** `constructor(private db: Db)` is already right
  everywhere; keep it that way.

## The DTO boundary (ban 3)

`type RepoRow = typeof t.repos.$inferSelect` is a *persistence* shape. Two things make it
unfit to cross a module boundary:

- it is coupled to the column layout — adding a column changes every consumer's type
- it is **camelCase**, and our wire contract is **snake_case** (`cost_usd`, `tokens_in`)

So the mapper is not ceremony, it is the place where that translation happens exactly once:

```ts
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    full_name: row.fullName,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    // …
  };
}
```

Note what else it does: `Date → ISO string`. Dates are the other thing that must not escape
— a `Date` serialises differently depending on who calls `JSON.stringify`, and the contract
says string.

**Where mappers live:** `modules/<name>/helpers.ts`, as pure ring-1 functions. They are
trivially unit-testable and they keep `service.ts` free of field-by-field copying.

**What we deliberately do not do:** maintain a separate domain entity alongside the Drizzle
row. Rentea's warning is the reason — a parallel persistence model quadruples CRUD code and
teams regret it within two years. One shape inside the module, one DTO at its edge. That is
the whole mapping budget.

## Transactions

**The service owns the boundary; the repository does not know it is in one.** The service
is the only layer that knows the scope of a business operation, so it decides what is
atomic. The repository must work identically inside and outside a transaction, or it stops
being reusable.

Drizzle's transaction handle is the same shape as the db handle, which makes this cheap —
pass it in:

```ts
// ring 3 — the service decides what is atomic
await this.db.transaction(async (tx) => {
  const review = await this.reviews.insert(tx, workspaceId, values);
  await this.findings.insertMany(tx, review.id, kept);
});
```

```ts
// ring 3 — the repository accepts either handle and never opens its own
async insert(db: Db | Tx, workspaceId: string, values: InsertReview) { … }
```

Two failure modes to avoid:

- **A repository opening its own transaction.** Two repositories in one use case then commit
  independently and a half-finished write survives a failure.
- **A transaction held open across a port call.** Never `await this.llm.complete(...)` or a
  GitHub request inside `db.transaction`. A ninety-second LLM call inside an open
  transaction holds a connection and its locks for ninety seconds. Do the I/O first, then
  open the transaction around the writes.

Drizzle has no ambient/implicit transaction context (it is a long-standing open request),
so the handle is passed explicitly. That is not a workaround to fix — it is what makes the
boundary visible in the signature.

## The transitive-tenancy invariant

This one is a genuine trap and it is invisible in the schema.

**`findings` has no `workspace_id`.** Its only FK is `review_id`. Tenancy is inherited
*transitively* through `reviews.workspaceId`. Consequences:

- a findings query is safe **only** when its `review_id IN (…)` list came from an
  already-workspace-scoped read
- you cannot query findings by PR directly
- never add a findings query scoped by `pr_id` alone

This is an architectural invariant living in a layer, not in a constraint — precisely the
kind of rule that erodes silently when a route starts querying tables directly (ban 1). It
is also the clearest argument for keeping the repository chokepoint: the guard has to live
*somewhere*, and the schema has declined to hold it.

## Schema changes

Ring 4, and mechanical:

1. edit `db/schema/*.ts`
2. `pnpm db:generate` — drizzle-kit writes `00NN_<slug>.sql`
3. `pnpm db:migrate`

Never hand-write migration SQL, and never rename a generated file. Migrations are **not**
applied on boot. Two gotchas already recorded in `server/INSIGHTS.md`: drizzle's journal is
keyed by file **hash**, so a differently-named migration adding the same column from another
branch will fail with `42701 column already exists`; and adding a field to a run means
updating `completeAgentRun`'s shape in **two** places (`repository/run.repo.ts` and
`repository.ts`) or typecheck fails.
