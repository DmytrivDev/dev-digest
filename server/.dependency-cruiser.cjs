/**
 * Onion Architecture boundaries for @devdigest/api.
 *
 * Encodes the inward-only dependency rule from `.claude/skills/onion-architecture/`:
 * a file may import from its own ring and rings closer to the core, never outward.
 *
 *   ring 1 core        pure rules, no I/O      modules/<n>/{cost,status,findings,helpers}.ts
 *   ring 2 ports       interfaces              vendor/shared/**
 *   ring 3 application services, repositories  modules/<n>/{service,repository}.ts
 *   ring 4 adapters    routes, db, SDKs        modules/<n>/routes.ts, adapters/**, db/**
 *
 * `platform/container.ts` is the composition root and is exempt by design — wiring
 * the rings together is its whole job.
 *
 * Severity policy: rules that are CLEAN today are `error` (they must stay clean).
 * Rules with pre-existing violations are `warn` and listed as known debt in SKILL.md §5 — new
 * code must not add to them; existing code migrates when touched.
 *
 * Run: pnpm arch:check
 */

/** Ring-1 rule/mapper files: pure functions, unit-tested without a database. */
const RING1 = '^src/modules/[^/]+/(cost|status|findings|helpers)\\.ts$';
const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
const SERVICES = '^src/modules/[^/]+/service\\.ts$';

module.exports = {
  forbidden: [
    // ---------------------------------------------------------------- clean
    {
      name: 'no-circular',
      comment:
        'Circular imports mean the two files are one module pretending to be two, ' +
        'and they make ring boundaries unenforceable. Extract the shared part. ' +
        'NOTE: 4 of the 5 current cycles are a SYMPTOM of service-not-to-composition-root ' +
        '(service → container → service) and disappear when that is fixed — which is the ' +
        'clearest evidence that the rule is not bureaucracy.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-not-to-io',
      comment:
        'Ring 1 (pure rules and mappers) must stay free of I/O: no db connection, no ' +
        'adapters, no composition root, no job runner or SSE bus. A rule that needs ' +
        'Docker to test is in the wrong ring — see SKILL.md §1. (Importing db/schema ' +
        'for a row TYPE is allowed: that is exactly what a mapper translates.)',
      severity: 'error',
      from: { path: RING1 },
      to: {
        path: [
          '^src/db/client\\.ts$',
          '^src/platform/(container|jobs|sse)\\.ts$',
          '^src/adapters/',
        ],
      },
    },
    {
      name: 'db-not-to-modules',
      comment:
        'The persistence layer is ring 4 infrastructure. Importing a feature module ' +
        'inverts the arrow and couples every table to a use case.',
      severity: 'error',
      from: { path: '^src/db/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'ports-not-to-implementations',
      comment:
        'Ring 2 is technology-neutral by definition. A port that imports an adapter, ' +
        'the db or a module has stopped being an interface.',
      severity: 'error',
      from: { path: '^src/vendor/shared/' },
      to: { path: ['^src/adapters/', '^src/db/', '^src/modules/', '^src/platform/'] },
    },

    // ------------------------------- known debt (SKILL.md §5), warn-only
    {
      name: 'routes-not-to-orm',
      comment:
        'Ban 1. A route is a driving adapter: parse, delegate, map the status code. ' +
        'SQL in a route skips rings 3 and 2, so the rule cannot be unit-tested and ' +
        'workspace scoping is re-implemented per endpoint. Move the query into the ' +
        "module's repository and the rule into a pure ring-1 file. " +
        'Known: pulls, polling, settings, workspace.',
      severity: 'warn',
      from: { path: ROUTES },
      to: { path: ['^src/db/schema', '^src/db/client\\.ts$'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'routes-not-to-orm-pkg',
      comment:
        'Ban 1, npm half: a route importing drizzle-orm is building a query. ' +
        'Known: pulls, polling, settings, workspace.',
      severity: 'warn',
      from: { path: ROUTES },
      to: { dependencyTypes: ['npm'], path: 'node_modules/drizzle-orm' },
    },
    {
      name: 'service-not-to-adapters',
      comment:
        'Ban 2. Ring 3 depends on the PORT type from @devdigest/shared; the instance ' +
        'arrives through the constructor from the composition root. Importing a ' +
        'concrete adapter points the arrow outward and makes the service untestable ' +
        'without the real technology. Known: repo-intel.',
      severity: 'warn',
      from: { path: SERVICES },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'service-not-to-composition-root',
      comment:
        'SKILL.md §4. A service that imports the Container depends on ring 4, hides ' +
        'its real dependencies from its own signature, and forces every unit test to ' +
        'build a container. Inject the ports it actually uses. ' +
        'Known: repos, reviews, agents, repo-intel.',
      severity: 'warn',
      from: { path: SERVICES },
      to: { path: '^src/platform/container\\.ts$' },
    },

    // -------------------------------------------------------------- hygiene
    {
      name: 'no-orphans',
      comment: 'A module nothing imports is either dead code or a forgotten wiring step.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '^src/server\\.ts$', '(^|/)drizzle\\.config\\.ts$'],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.ts$', '^src/db/migrations/'] },
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
