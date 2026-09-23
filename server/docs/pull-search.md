# Pull-request title search

The PR list can be narrowed by title. Matching lives in
`src/modules/pulls/search.ts` and runs in memory over the already-loaded list.

- Case-insensitive: `fix` matches "Fix cost column".
- Plain text: the query is escaped with `escape-string-regexp`, so `(v2)` is
  not a regex group.
- Queries shorter than two characters match everything.
