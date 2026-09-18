# frontend-ui-architecture — sources and rationale

**Version 1.0.0** · research conducted 2026-09-18

This file records every source behind [SKILL.md](SKILL.md) and its reference files, and —
more importantly — the places where respected sources **contradict each other**, together
with the side this skill picked and why.

Every URL below was fetched and confirmed reachable during research. Links that could not be
verified were dropped rather than guessed; one notable omission is recorded under
[Verification notes](#verification-notes).

## Contents

- [Why this skill exists](#why-this-skill-exists)
- [Sources](#sources)
  - [1. Official React](#1-official-react)
  - [2. Next.js and Vercel](#2-nextjs-and-vercel)
  - [3. Next.js App Router architecture](#3-nextjs-app-router-architecture)
  - [4. Feature-Sliced Design](#4-feature-sliced-design)
  - [5. Reference architectures and structure essays](#5-reference-architectures-and-structure-essays)
  - [6. Component granularity and composition](#6-component-granularity-and-composition)
  - [7. Business logic, data and state](#7-business-logic-data-and-state)
  - [8. Constants, utils, types, barrels](#8-constants-utils-types-barrels)
  - [9. Styling, tests, assets, i18n](#9-styling-tests-assets-i18n)
  - [10. Boundary enforcement tooling](#10-boundary-enforcement-tooling)
- [Where the sources disagree](#where-the-sources-disagree)
- [Verification notes](#verification-notes)
- [Changelog](#changelog)

## Why this skill exists

Two skills already covered parts of this ground, and neither answered "where does this go?":

- `react-best-practices` — anti-patterns, hooks misuse, memoization, key props. It has a
  four-line "Code Organization" section and nothing more.
- `next-best-practices` — a mechanics reference: which special file does what, async APIs,
  runtime selection. No architectural guidance.

Placement questions were therefore being answered from memory, inconsistently. This skill
fills that gap and deliberately does not repeat either of the other two.

## Sources

### 1. Official React

| Title | URL |
|---|---|
| Thinking in React | https://react.dev/learn/thinking-in-react |
| Your First Component | https://react.dev/learn/your-first-component |
| Passing Props to a Component | https://react.dev/learn/passing-props-to-a-component |
| Sharing State Between Components | https://react.dev/learn/sharing-state-between-components |
| Choosing the State Structure | https://react.dev/learn/choosing-the-state-structure |
| Extracting State Logic into a Reducer | https://react.dev/learn/extracting-state-logic-into-a-reducer |
| Keeping Components Pure | https://react.dev/learn/keeping-components-pure |
| You Might Not Need an Effect | https://react.dev/learn/you-might-not-need-an-effect |
| Reusing Logic with Custom Hooks | https://react.dev/learn/reusing-logic-with-custom-hooks |
| Server Components (reference) | https://react.dev/reference/rsc/server-components |
| File Structure (legacy FAQ, archived) | https://legacy.reactjs.org/docs/faq-structure.html |

Supplies: one concern per component; state at the closest common parent; never nest
component definitions; `children` as composition; **a function calling no hooks must not be
named `use*`**; hooks share logic but not state; derive instead of storing; "Some duplication
is fine".

The archived FAQ is the origin of the two most-quoted numbers in the field — "a maximum of
three or four nested folders" and "don't spend more than five minutes on choosing a file
structure" — and has no equivalent page on modern react.dev.

### 2. Next.js and Vercel

| Title | URL |
|---|---|
| Project structure and organization | https://nextjs.org/docs/app/getting-started/project-structure |
| Getting Started: CSS | https://nextjs.org/docs/app/getting-started/css |
| How to set up Vitest with Next.js | https://nextjs.org/docs/app/guides/testing/vitest |
| Image Optimization | https://nextjs.org/docs/app/getting-started/images |
| Font Optimization | https://nextjs.org/docs/app/getting-started/fonts |
| optimizePackageImports | https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports |
| How we optimized package imports in Next.js | https://vercel.com/blog/how-we-optimized-package-imports-in-next-js |
| Next.js Commerce | https://github.com/vercel/commerce |

Supplies: the framework is **unopinionated** and says so; `components` and `lib` have "no
special framework significance"; `_folder` opts out of routing; `(group)` organizes without
touching the URL; three sanctioned organization strategies — pick one and be consistent.

Two hard technical facts worth knowing: **Vitest cannot test async Server Components** (use
e2e), and a statically imported colocated image gets automatic `width`/`height`/`blurDataURL`.
Next.js Commerce is an existence proof that a flat `app/ components/ lib/` survives at
production scale with no `features/` folder at all.

### 3. Next.js App Router architecture

| Title | URL |
|---|---|
| The Server and Client Boundary | https://nextjs.org/docs/app/guides/server-and-client-boundary |
| Server and Client Components | https://nextjs.org/docs/app/getting-started/server-and-client-components |
| use client (Next.js directive reference) | https://nextjs.org/docs/app/api-reference/directives/use-client |
| use client (React reference) | https://react.dev/reference/rsc/use-client |
| use server (React reference) | https://react.dev/reference/rsc/use-server |
| How to Think About Security in Next.js | https://nextjs.org/blog/security-nextjs-server-components-actions |
| How to think about data security in Next.js | https://nextjs.org/docs/app/guides/data-security |
| How to implement authentication in Next.js | https://nextjs.org/docs/app/guides/authentication |
| Server Actions and Mutations | https://nextjs.org/docs/app/guides/server-actions |
| Fetching Data | https://nextjs.org/docs/app/getting-started/fetching-data |
| layout.js | https://nextjs.org/docs/app/api-reference/file-conventions/layout |
| template.js | https://nextjs.org/docs/app/api-reference/file-conventions/template |
| Route Groups | https://nextjs.org/docs/app/api-reference/file-conventions/route-groups |
| Parallel Routes | https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes |
| Intercepting Routes | https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes |
| route.js | https://nextjs.org/docs/app/api-reference/file-conventions/route |
| Next.js as a backend for your frontend | https://nextjs.org/docs/app/guides/backend-for-frontend |
| Building APIs with Next.js | https://nextjs.org/blog/building-apis-with-nextjs |
| Making Sense of React Server Components | https://www.joshwcomeau.com/react/server-components/ |
| The Ultimate Next.js App Router Architecture (FSD) | https://feature-sliced.design/blog/nextjs-app-router-guide |
| Next.js Colocation Template | https://next-colocation-template.vercel.app/ |

Supplies: code crosses the boundary through imports, data through props; **ownership, not
nesting**, decides the render environment; `'use client'` marks an entry point and infects
all transitive imports; Server Components cannot create context, so providers are client
wrappers.

Architectural facts that are otherwise learned painfully: layouts **cannot pass data to
children** and cannot read `pathname`/`searchParams`; `layout` persists while `template`
resets identity; **conditional parallel slots all render on the server** regardless of which
the layout returns; compound components lose static properties across the boundary; Server
Actions dispatch one at a time per client.

The last two entries are the two sides of the `app/`-versus-`src/` argument, included
deliberately so the disagreement is visible rather than hidden.

### 4. Feature-Sliced Design

| Title | URL |
|---|---|
| Overview | https://feature-sliced.design/docs/get-started/overview |
| Layers | https://feature-sliced.design/docs/reference/layers |
| Slices and segments | https://feature-sliced.design/docs/reference/slices-segments |
| Public API | https://feature-sliced.design/docs/reference/public-api |
| Migration from a custom architecture | https://feature-sliced.design/docs/guides/migration/from-custom |

Seven layers, downward-only imports, no sibling imports within a layer, segments named by
**purpose** (`ui`/`api`/`model`/`lib`/`config`) — with the explicit claim that "components,
hooks, and types are bad segment names". The migration guide is the only ordered, incremental
type-based → feature-based recipe anywhere, and it is duplication-tolerant: copy-paste code
to break a cross-page dependency.

We adopt FSD's *reasoning* about public APIs and import direction without adopting its layer
vocabulary — see [the disagreements](#where-the-sources-disagree).

### 5. Reference architectures and structure essays

| Title | URL |
|---|---|
| bulletproof-react — project structure | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md |
| bulletproof-react — project standards | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md |
| React Folder Structure Best Practices | https://www.robinwieruch.de/react-folder-structure/ |
| React project structure for scale | https://www.developerway.com/posts/react-project-structure |
| Screaming Architecture | https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html |
| Evolution of a React folder structure | https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25 |
| May I Interest You In a Modular Monolith? | https://frontendatscale.com/issues/45/ |

Supplies: unidirectional flow `shared → features → app`; promotion on the **second**
consumer; the import rules that make circular dependencies structurally impossible (only
`index.ts` owns sub-components, import only from children, never from neighbours, never skip
a level); and the observation that a tree reading `components/ hooks/ contexts/` describes
the framework rather than the product.

### 6. Component granularity and composition

| Title | URL |
|---|---|
| When to Break Up a Component into Multiple Components | https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components |
| Prop Drilling | https://kentcdodds.com/blog/prop-drilling |
| State Colocation Will Make Your React App Faster | https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster |
| Colocation | https://kentcdodds.com/blog/colocation |
| AHA Programming | https://kentcdodds.com/blog/aha-programming |
| Components Composition: How to Get It Right | https://www.developerway.com/posts/components-composition-how-to-get-it-right |
| How to Write Performant React Code | https://www.developerway.com/posts/how-to-write-performant-react-code |
| Tao of React | https://alexkondov.com/tao-of-react/ |
| Container/Presentational Pattern | https://www.patterns.dev/react/presentational-container-pattern/ |
| Compound Pattern | https://www.patterns.dev/react/compound-pattern/ |
| Atomic Web Design | https://bradfrost.com/blog/post/atomic-web-design/ |
| Atomic Design, Chapter 2 | https://atomicdesign.bradfrost.com/chapter-2/ |
| Rethinking Atomic Design in React Projects | https://cheesecakelabs.com/blog/rethinking-atomic-design-react-projects/ |
| The Two Reacts | https://overreacted.io/the-two-reacts/ |
| Explain Presentational vs Container Pattern | https://www.greatfrontend.com/questions/quiz/explain-the-presentational-vs-container-component-pattern-in-react |
| RSC and the Echo of Presentational and Container Components | https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i |

Supplies the seven concrete reasons to split a component, "Duplication is far cheaper than
the wrong abstraction", the rule-of-three, the "implements *or* composes, never both"
heuristic, and the warning against creating components inside render.

On Atomic Design: Brad Frost's own Chapter 2 contains the caveat most adopters skip — atomic
design "is not a linear process", it is a mental model, and he drops the chemistry analogy at
the template stage. The real dispute is not Frost versus React; it is Frost versus people who
turned a mental model into a directory tree.

### 7. Business logic, data and state

| Title | URL |
|---|---|
| Presentation Domain Data Layering | https://martinfowler.com/bliki/PresentationDomainDataLayering.html |
| Humble Object | https://martinfowler.com/bliki/HumbleObject.html |
| Yagni | https://martinfowler.com/bliki/Yagni.html |
| Modularizing React Applications with Established UI Patterns | https://martinfowler.com/articles/modularizing-react-apps.html |
| Practical React Query | https://tkdodo.eu/blog/practical-react-query |
| Effective React Query Keys | https://tkdodo.eu/blog/effective-react-query-keys |
| React Query as a State Manager | https://tkdodo.eu/blog/react-query-as-a-state-manager |
| Type-safe React Query | https://tkdodo.eu/blog/type-safe-react-query |
| Does TanStack Query replace Redux, MobX…? | https://tanstack.com/query/v5/docs/framework/react/guides/does-this-replace-client-state |
| React State Management in 2025: What You Actually Need | https://www.developerway.com/posts/react-state-management-2025 |
| Hexagonal-Inspired Architecture in React | https://alexkondov.com/hexagonal-inspired-architecture-in-react/ |
| Clean Architecture in React | https://alexkondov.com/full-stack-tao-clean-architecture-react/ |
| Why I Like Hexagonal Architecture | https://alexkondov.com/why-i-favor-hexagonal-architecture/ |
| Clean Architecture: Practical Insights and Pitfalls | https://dev.to/harunou/clean-architecture-practical-insights-and-pitfalls-1mdj |
| Parse, don't validate | https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ |

Fowler supplies the limit most layering advocates skip — layering "should only be applied at
a relatively small granularity", with domain modules on top for larger systems — and the
YAGNI boundary that makes the cost-of-carry argument precise: YAGNI applies to presumptive
*features*, "it does not apply to effort to make the software easier to modify".

TkDodo supplies the query conventions: never copy query data into `useState`; wrap even a
single query in a hook; keys colocated per feature with only hooks exported. TanStack's own
docs supply the observation that after adopting a server-state library, the remaining truly
global client state "is usually very tiny".

### 8. Constants, utils, types, barrels

| Title | URL |
|---|---|
| Please Stop Using Barrel Files | https://tkdodo.eu/blog/please-stop-using-barrel-files |
| Speeding up the JS ecosystem — The barrel file debacle | https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/ |
| Vite — Performance ("Avoid barrel files") | https://vite.dev/guide/performance |
| Why I Prefer Barrel Files in 2026 | https://codecompose.com/articles/why-i-prefer-barrel-files-in-2026/ |
| TypeScript Handbook — Enums | https://www.typescriptlang.org/docs/handbook/enums.html |
| Why I Don't Like TypeScript Enums | https://www.totaltypescript.com/why-i-dont-like-typescript-enums |
| Google TypeScript Style Guide | https://google.github.io/styleguide/tsguide.html |
| ESLint — no-magic-numbers | https://eslint.org/docs/latest/rules/no-magic-numbers |
| typescript-eslint — prefer-enum-initializers | https://typescript-eslint.io/rules/prefer-enum-initializers/ |
| Consistent Type Imports and Exports: Why and How | https://typescript-eslint.io/blog/consistent-type-imports-and-exports-why-and-how/ |
| Better ways to name your utils module | https://www.moderndescartes.com/essays/noutils/ |
| Import path aliasing is a crutch for poor architecture | https://paularmstrong.dev/blog/2023/08/29/import-path-aliasing-is-a-crutch-for-poor-architecture/ |

The only hard measurements in the entire corpus live here: one real project went from ~11k
modules per page to ~3.5k after deleting internal barrels; module-load cost scales to 3.12s
at 10k modules, 16.81s at 25k and 48.44s at 50k, and test runners multiply that into minutes
of pure overhead. The pro-barrel rebuttal brings no benchmarks — weight the two accordingly.

Also supplies the definition of a magic number ("numbers that occur multiple times in code
without an explicit meaning"), the case against TypeScript `enum`, the universal agreement
that `const enum` is unsafe under `isolatedModules`, and the concrete replacement taxonomy
for a `utils/` dumping ground.

### 9. Styling, tests, assets, i18n

| Title | URL |
|---|---|
| Styling with utility classes (Managing duplication) | https://tailwindcss.com/docs/styling-with-utility-classes |
| Functions and directives | https://tailwindcss.com/docs/functions-and-directives |
| Theme variables | https://tailwindcss.com/docs/theme |
| Storybook — How to write stories | https://storybook.js.org/docs/writing-stories |
| React Testing Library — Setup | https://testing-library.com/docs/react-testing-library/setup/ |
| Vitest config — include | https://vitest.dev/config/include.html |
| next-intl — Messages | https://next-intl.dev/docs/usage/messages |
| i18next — Namespaces | https://www.i18next.com/principles/namespaces |
| MSW — Browser integration | https://mswjs.io/docs/integrations/browser |

Notable: Tailwind never lists `@apply` among its duplication strategies — the documented rule
is "reuse across files → make a component; third-party override → `@apply`". Neither Vitest
nor Testing Library has an opinion on colocated tests versus a `__tests__` folder, so that
choice must be presented as a project decision rather than a citation. i18next supplies the
only measurable i18n threshold in the literature: about 300 segments per file.

### 10. Boundary enforcement tooling

Recorded for reference. **This repo has no linter configured**, so the skill mentions
enforcement in one line rather than shipping configs that have nowhere to live.

| Title | URL |
|---|---|
| eslint-plugin-boundaries | https://github.com/javierbrea/eslint-plugin-boundaries |
| dependency-cruiser | https://github.com/sverweij/dependency-cruiser |
| Taking Frontend Architecture Serious With Dependency-cruiser | https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/ |
| Nx — Enforce Module Boundaries | https://nx.dev/docs/features/enforce-module-boundaries |
| Turborepo — Structuring a repository | https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository |

These are not substitutes for each other: ESLint rules give fast in-editor feedback on path
patterns, dependency-cruiser is the only one that also catches orphans and undeclared
dependencies, and Nx replaces path rules with project tags. bulletproof-react's position is
worth repeating — standards enforced pre-push actually hold, and structure rules that are not
linted hold only by discipline.

## Where the sources disagree

Ten genuine conflicts surfaced. A skill that papers over them produces inconsistent answers
to equivalent questions, so each is resolved explicitly below. **These are choices, not
universal truths** — another project could reasonably decide differently.

### 1. Barrel files — the sharpest conflict

All the measurements are against them (TkDodo, Hagemeister, Vite, and bulletproof-react,
which publicly *reversed* its earlier advice). All the encapsulation arguments are for them
(FSD mandates one per slice; Makarevich builds her whole import model on them). Wieruch
endorses them for encapsulation and concedes they hurt tree-shaking in the same article.

**Decision:** keep the narrow per-component barrel (already the repo's convention, small and
cohesive); forbid wide aggregators and same-directory barrel imports. This targets the
mechanism that actually causes the measured damage while keeping the public-API benefit.

### 2. Is there a component size threshold?

"Fits on a laptop screen" and "more than five props" versus Kent C. Dodds, who publishes no
number and splits only on one of seven concrete problems.

**Decision:** no threshold. Size is a prompt to look, not a rule to obey. The skill lists the
problems instead, because a rule with a number invites gaming and misses the long-but-simple
component that is genuinely fine.

### 3. Where business logic lives

The "hooks as ports" camp versus react.dev's explicit rule that a function calling no hooks
must not be a hook.

**Decision:** react.dev. Pure rules go in plain modules; the hook is the thin stateful
adapter. A hook is not a humble object — it still needs a renderer to test.

### 4. Promotion threshold to shared

Second consumer (Wieruch) versus third (Kent C. Dodds' AHA) versus FSD, which says
copy-paste to kill a cross-boundary import.

**Decision:** second consumer, with the rule-of-three applied to *abstractions* rather than
*moves*. Moving a file is cheap and reversible; inventing the wrong abstraction is not.

### 5. Segment naming inside a feature

`components/hooks/types/utils` (bulletproof-react) versus `ui/api/model/lib/config` (FSD,
which calls the former "bad segment names").

**Decision:** neither, because our unit is a component folder rather than a feature slice.
Roles are named by what the file *is for* — `constants`, `helpers`, `styles` — which follows
FSD's reasoning without importing its vocabulary.

### 6. Path aliases

`@/` everywhere (bulletproof-react, Next.js, the ecosystem) versus relative imports (Google,
Armstrong: aliases need duplicated config across TS/ESLint/Vite/Jest and mask the real
problem, which is depth).

**Decision:** keep `@/` — it is already configured and working. Armstrong's underlying point
is honoured by the nesting ceiling: shallow trees are what make aliases unnecessary, and
keeping trees shallow is worth doing for its own sake.

### 7. File naming

`snake_case` (Google) versus kebab-case with PascalCase components (Wieruch, most React
tooling) versus no opinion (Next.js).

**Decision:** PascalCase folders and component files, lowercase role files — matching what
the repo already does. There is no industry consensus to appeal to here, and consistency
within a codebase beats conformity to any external guide.

### 8. Does domain code live inside `app/` or outside it?

FSD is categorical that `app/` is routing-only with domain code in `src/`; the colocation
camp and Next.js's own third strategy push features into route segments. Next.js explicitly
refuses to arbitrate.

**Decision:** colocate inside route segments. Routes here map 1:1 onto features, so a
parallel tree would mean every change touches two places. Note what the framework actually
guarantees: colocation *safety*, not colocation *wisdom*.

### 9. Is fetching directly inside a component acceptable?

The Fetching Data guide shows `await db.select()` straight in `page.tsx`; the security model
classifies exactly that as "component-level data access", fit "only for rapid iteration and
prototyping".

**Decision:** moot for this repo — data comes from a separate API through `lib/api.ts`. The
reasoning is documented in [nextjs-architecture.md](nextjs-architecture.md) so the pattern is
recognizable when met elsewhere.

### 10. Where mutation logic lives

Newer Vercel material has drifted from "the action contains the logic and the auth check"
toward "the action is a thin transport adapter over a `server-only` service layer". Both
positions are currently live in the official docs.

**Decision:** not applicable here (no Server Actions), but the invariant that transfers is
recorded: every entry point authorizes itself, because a check on one path does not protect
another.

## Verification notes

- **Dan Abramov's "Presentational and Container Components"** (the original Medium article)
  returns HTTP 403 to automated fetching, and archive.org was unreachable from the research
  environment. It is therefore **not cited**. Its widely-repeated 2019 retraction is attested
  only second-hand, so this skill does not quote its wording — it relies on Abramov's current
  framing in "The Two Reacts" instead.
- One claim encountered during research — a TkDodo post arguing against extracting event
  handlers out of components — could not be verified against a fetched URL and was excluded.
- Source counts: 109 unique verified URLs across ten topic areas.

## Changelog

### 1.0.0 — 2026-09-18

Initial version. Research across six parallel workstreams (folder architecture, component
splitting, business-logic placement, constants/utils/barrels, styling/tests/scaling, and
Next.js App Router architecture), 109 verified sources, ten documented conflicts resolved.

Grounded against the DevDigest `client/` package as it actually stands — including the fact
that it is a client-rendered App Router app (54 of 116 `.tsx` files carry `'use client'`),
that it styles via `styles.ts` objects and CSS custom properties rather than Tailwind utility
classes despite Tailwind v4 being installed, and that it has no linter to enforce any of
this.
