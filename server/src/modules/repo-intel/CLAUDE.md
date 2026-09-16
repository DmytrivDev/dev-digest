# repo-intel (inside @devdigest/api)

Codebase indexer: symbols, import graph, PageRank, repo map. Read-only at review time.

## Conventions
- Consumers call the facade `service.ts` (`repoIntel.*`) ONLY — never the pipeline.
- Indexing happens on clone + incrementally on fetch, keyed by file content hash.
  A review never triggers analysis.
- Unindexed/partial repos degrade gracefully: the facade returns empty, never throws.

## Gotchas
- `REPO_INTEL_ENABLED` (global) AND a per-agent `repo_intel` flag both gate enrichment.
- Facade methods exist for lessons not yet built (`getBlastRadius`,
  `getUnresolvedReferences`, `getConventionSamples`) — unused ≠ dead.

## Use when
- Pipeline, facade surface, routes → `server/src/modules/repo-intel/README.md`
