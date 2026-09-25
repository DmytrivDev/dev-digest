/**
 * Onion Architecture boundaries for @devdigest/mcp (D8 in
 * docs/plans/devdigest-mcp.plan.md — `.claude/skills/onion-architecture/`
 * scoped to `@devdigest/api`/`@devdigest/reviewer-core` in its first draft,
 * so this package gets its own ring map here rather than reusing server's).
 *
 *   ring 1 core        pure rules, no I/O      src/core/**
 *   ring 2 ports       interfaces              src/ports/**
 *   ring 3 application use cases               src/app/**
 *   ring 4 adapters    driven (fetch/env/log)   src/adapters/**
 *   ring 4 adapters    driving (MCP tools)      src/tools/**
 *   —      composition root                    src/server.ts
 *   —      entry                                src/index.ts
 *
 * All six rules are `error` — there is no legacy debt to baseline (this is a
 * brand-new package).
 *
 * Run: pnpm arch:check
 */

module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment:
        'Ring 1 (core/**) may depend only on itself and `zod` at runtime, plus ' +
        'TYPE-ONLY imports from @devdigest/shared (erased by esbuild — D8\'s ' +
        'documented ring-1 deviation). No node builtins, no SDK, no adapters/ports/' +
        'app/tools, and no VALUE import of @devdigest/shared.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: {
        pathNot: ['^src/core/', 'node_modules/zod'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-no-outer-rings',
      comment:
        'Ring 1 (core/**) must not name ANY outer-ring file, not even type-only: ' +
        'core-is-pure exempts type-only imports so core can type-import ' +
        '@devdigest/shared, which also let a type-only import of ports/** slip ' +
        'through (caught by pr-self-review 2026-09-25). A type core needs lives in core.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(ports|app|adapters|tools)/|^src/(server|index)\.ts$' },
    },
    {
      name: 'ports-are-types',
      comment:
        'Ring 2 (ports/**) is the technology-neutral conversation with the API and ' +
        'the clock. It may depend on ring 1 (core/**) and on TYPE-ONLY imports ' +
        '(including @devdigest/shared) — never a concrete adapter, the SDK, or a ' +
        'VALUE import from outside core/**.',
      severity: 'error',
      from: { path: '^src/ports/' },
      to: {
        pathNot: ['^src/core/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'app-no-outward',
      comment:
        'Ring 3 (app/**) orchestrates D1/D3/D5 using rings 1-2 only. It must never ' +
        'import a driven adapter, a tool (driving adapter), the composition root, ' +
        'the MCP SDK, or a node builtin — that is what keeps run-review.ts testable ' +
        'with fake-api + a fake Clock and reusable outside an MCP server.',
      severity: 'error',
      from: { path: '^src/app/' },
      to: {
        path: ['^src/adapters/', '^src/tools/', '^src/server\\.ts$', 'node_modules/@modelcontextprotocol', '^node:'],
      },
    },
    {
      name: 'tools-no-driven-adapters',
      comment:
        'Ring 4 driving adapters (tools/**) parse, call ONE app function, and map ' +
        'the result (transport.md\'s "thin controller"). Importing a driven adapter ' +
        'directly skips the app layer and makes the tool untestable without the ' +
        'real HTTP client.',
      severity: 'error',
      from: { path: '^src/tools/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'only-root-wires-server',
      comment:
        '`server.ts` is the composition root; only `index.ts` (the entry) may ' +
        'import it. Anything else constructing/consuming a second `McpServer` ' +
        'would be a second wiring point.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/index\\.ts$' },
      to: { path: '^src/server\\.ts$' },
    },
    {
      name: 'only-root-wires-adapters',
      comment:
        'Nothing but `server.ts` (and its caller `index.ts`) may CONSTRUCT a driven ' +
        'adapter (adapters/**) — routes/services elsewhere depend on the PORT type ' +
        'from ports/**, never a concrete adapter (onion §4/ban 2 analogue). A ' +
        'TYPE-only reference between two adapters (e.g. `http-client.ts` naming ' +
        '`Config`\'s shape) constructs nothing and is not what this rule guards.',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/server\\.ts$', '^src/index\\.ts$'] },
      to: { path: '^src/adapters/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-server-src',
      comment:
        '`mcp` is a thin HTTP client of the API — no DB access, no import of ' +
        'server services (the goal statement). The ONE sanctioned exception is the ' +
        'tsconfig `paths` alias to the vendored shared contracts (D4); anything ' +
        'else reaching into `server/src` re-introduces the coupling the alias was ' +
        'meant to avoid.',
      severity: 'error',
      from: { path: '^src/' },
      to: {
        path: '(^|/)server/src/',
        pathNot: '(^|/)server/src/vendor/shared/',
      },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.ts'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
