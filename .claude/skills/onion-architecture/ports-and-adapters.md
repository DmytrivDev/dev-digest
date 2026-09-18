# Ports, adapters and the composition root

Ring 2 and ring 4, and the one file allowed to see both. Read [SKILL.md](SKILL.md) §2 first
for *when* a port is justified — this file is about *how* to write one once it is.

## Driving vs driven

Cockburn's distinction, and it decides where the adapter lives:

| Side | Who starts the conversation | Ours | Home |
|---|---|---|---|
| **Driving** (primary) | The outside world calls us | HTTP routes, the job runner, the CI runner | `modules/*/routes.ts`, `platform/jobs.ts` |
| **Driven** (secondary) | We call the outside world | GitHub, git, LLMs, Postgres, ripgrep, the secrets file | `adapters/**`, `db/**` |

The asymmetry matters: **a driven port is an interface we define and the vendor obeys; a
driving adapter has no port at all** — it just calls the service. Do not invent a
`ReviewController` interface because `LLMProvider` has one. Nothing substitutes a route.

## Writing a driven port

Ports live in `vendor/shared/adapters.ts`, whose header already states the contract: "ALL
external calls go behind these interfaces. Real implementations live in
`apps/api/src/adapters/*`; mock implementations live alongside for tests/dev (Services
depend on the interface, not the impl)."

Rules:

1. **Describe the conversation, not the library.** `GitHubClient.listPulls(repo)` — not
   `octokit.rest.pulls.list(params)`. If a vendor type appears in a signature, ring 3 has
   learned which SDK is underneath and the port bought you nothing.
2. **Own your own types.** The port's inputs and outputs are `@devdigest/shared` types
   (`RepoRef`, `PrMeta`, `CompletionResult`), defined next to the port.
3. **Keep it narrow.** A port is the subset *we* use. `LLMProvider` is four methods over
   SDKs with hundreds. Adding a method because one adapter happens to support it widens the
   contract every other adapter must now satisfy.
4. **Edit both vendored copies.** `server/src/vendor/shared/` and
   `client/src/vendor/shared/` are hand-maintained duplicates resolved by tsconfig path
   alias — not auto-synced. One edited, one not, is a typecheck failure in the other
   package, usually noticed much later.
5. **Zod where it crosses the wire, plain TS where it does not.** `ModelInfo` is a Zod
   schema because it is parsed from an HTTP response; `ChatMessage` is a plain interface
   because it never crosses a boundary unvalidated. Follow what the neighbours do.

## Writing the adapter

One folder per technology under `adapters/<tech>/`, implementing the port and nothing else:

```
adapters/
  github/octokit.ts     → GitHubClient
  git/simple-git.ts     → GitClient
  llm/openai.ts         → LLMProvider ('openai')
  llm/anthropic.ts      → LLMProvider ('anthropic')
  embedder/openai.ts    → Embedder
  codeindex/ripgrep.ts  → CodeIndex
  secrets/local.ts      → SecretsProvider
  auth/local.ts         → AuthProvider
```

An adapter's job is **translation, not decision-making**. It converts our types to the
vendor's and back, and maps vendor failures into our error taxonomy
(`ExternalServiceError` from `platform/errors.ts`). The moment an adapter contains a
business rule — a retry policy tied to our product behaviour, a threshold, a fallback that
changes what the user sees — that rule belongs in ring 1 or 3, and the adapter should be
handed the decision, not make it.

**An adapter may depend on another port.** `RipgrepCodeIndex` takes a `GitClient`; that is
ring 4 → ring 2, which is inward and fine.

## The composition root

`platform/container.ts` is the only file that knows every ring. Its own header says why:
"Tests construct a container with `overrides` to inject mock adapters; the Services depend
on these interfaces, not the concrete classes."

Three properties worth preserving when you extend it:

**Lazy, cached construction.** `this._git ??= new SimpleGitClient(...)` — an adapter that is
never used is never built. This is load-bearing for adapters gated behind a secret: if
`OPENAI_API_KEY` is absent, `llm('openai')` throws `ConfigError` *before* constructing the
client, so the app makes zero requests. Same for `embedder()` when
`config.embeddingsEnabled` is false.

**Overrides win first.** Every getter checks `this.overrides.X` before building anything.
That check is what makes the whole container substitutable in tests.

**Sync getters for local adapters, async methods for secret-gated ones.** `git`,
`codeIndex`, `depgraph`, `tokenizer` are getters. `github()`, `llm(id)`, `embedder()` are
`async` because they must resolve a secret first. Follow the existing split — a new
secret-gated adapter is an async method.

### Adding an adapter

1. Port in `vendor/shared/adapters.ts` (**both copies**) — if §2 of SKILL.md justifies one.
2. Implementation in `adapters/<tech>/<lib>.ts`.
3. Field in `ContainerOverrides` so tests can substitute it.
4. Lazy getter (or async method, if secret-gated) on `Container`.
5. If a cached client depends on a secret, clear it in `invalidateSecretCaches()` — that
   is what makes "paste a new API key and it takes effect" work.

## Testing across the boundary

This is the payoff, and the reason the bans in SKILL.md are worth obeying.

```ts
const container = new Container(config, db, {
  github: fakeGitHub,
  llm: { openrouter: stubProvider },
});
```

Because every service depends on interfaces, a test substitutes the outside world at the
composition root with no mocking framework. `adapters/mocks.ts` already holds
implementations for this.

The rings give you three test grades, cheapest first — **reach for the cheapest one that
can express the assertion**:

| Grade | Tests | Needs | Suffix |
|---|---|---|---|
| Pure | ring 1 rules | nothing | `*.test.ts` |
| Container | ring 3 services with fake adapters | nothing, or an in-memory db | `*.test.ts` |
| Integration | ring 4 wiring, real SQL | Docker (testcontainers) | `*.it.test.ts` |

The `.it.test.ts` suffix is **mandatory** for anything DB-backed or the CI split breaks
(`pnpm exec vitest run --exclude '**/*.it.test.ts'` is the unit lane). A rule that forces
you into the integration lane is a ring-1 rule stuck in ring 4 — see SKILL.md §1.

## Ports we already have

Reading these before inventing a new one is usually faster than inventing a new one:

| Port | Contract | Implementations |
|---|---|---|
| `LLMProvider` | `listModels` · `complete` · `completeStructured` · `embed` | openai · anthropic · openrouter (in `reviewer-core`) |
| `Embedder` | `embed` · `dims` | openai (`text-embedding-3-small`, 1536 dims) |
| `GitHubClient` | PRs, issues, review comments | octokit |
| `GitClient` | clone, fetch, diff | simple-git |
| `CodeIndex` | search | ripgrep |
| `SecretsProvider` | `get` · `set` | local (`~/.devdigest/secrets.json`) |
| `AuthProvider` | `currentUser` · `currentWorkspace` | local no-auth |
| `RepoIntel` | the indexer facade | `RepoIntelService` |

`RepoIntel` is the one port that is not an external system: it is an internal facade,
justified because the whole indexer is substituted wholesale in tests and because
`server/CLAUDE.md` makes it a hard rule — "repo-intel is reached ONLY through
`container.repoIntel.*` — never the pipeline." That is a port protecting a module boundary
rather than a process boundary, and it is the exception, not a template.
