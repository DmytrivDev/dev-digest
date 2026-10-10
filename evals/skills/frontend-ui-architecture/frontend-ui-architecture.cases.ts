import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Skill under test: .claude/skills/frontend-ui-architecture/SKILL.md (+ its references/*.md).
// "quality" cases run with no tools, so every prompt inlines raw facts from fixtures/ and tells
// the model to treat them as already collected. Fixtures state facts only (who imports what, what
// the files contain) - never the rule or the verdict (SPEC-06 AC-6, writing-cases.md section 3).
// Each practice cites the SKILL.md section it protects in a comment above it.

const COLLECTED = `Treat the data below as already collected: answer directly from it and do not ask for tools or more files.`;

export const cases: SkillCase[] = [
  {
    // Protects SKILL.md section 1 (radius of use -> home) and "search src/vendor/ui first".
    name: "places new components by radius of use and reuses an existing design-system primitive",
    kind: "quality",
    prompt: `I am about to add three pieces of UI to the client. Tell me how to build each one and where it should live (folder, and how it is imported).\n\n${COLLECTED}\n\n${fx("placement.txt")}`,
    // The skill's home table guarantees route-local components sit in a `_components/` folder.
    grounding: ["_components/"],
    practices: [
      // SKILL.md section 1, row "One route segment": app/<route>/_components/<Name>/
      "places RepoSyncBanner, which only app/repos/[repoId]/page.tsx renders, in a route-local _components/ folder next to that route (app/repos/[repoId]/_components/RepoSyncBanner/)",
      // SKILL.md section 1, row "Several routes": src/components/<Name>/
      "places FindingsFilterBar, which three routes import, in the shared src/components/FindingsFilterBar/ folder, imported as @/components/FindingsFilterBar",
      // SKILL.md section 1, "Before creating a primitive, search src/vendor/ui first"
      "uses the existing SeverityBadge from @devdigest/ui for the coloured severity label instead of creating a new severity-label component",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    // Protects SKILL.md section 2 (narrow barrels only, same-folder ./index cycle) and section 4 (no utils.ts).
    name: "rejects a wide barrel, a utils.ts module and a same-folder ./index import",
    kind: "quality",
    prompt: `Review the structure of this PR before I merge it. List what you would change and how.\n\n${COLLECTED}\n\n${fx("anatomy-barrels.txt")}`,
    practices: [
      // SKILL.md section 2 [choice] "Narrow barrels only"
      "rejects src/components/index.ts, the file that re-exports twelve components, and says each component should be imported by its own real path (for example @/components/FindingCard) instead of through it",
      // SKILL.md section 4 "There is no utils.ts in this codebase"
      "rejects src/lib/utils.ts and recommends modules named after a domain concept (for example lib/cost.ts) or a helpers.ts next to the single caller instead",
      // SKILL.md section 2 "avoid same-directory barrel imports"
      "names FindingCard.tsx importing lineLabel from its own folder's ./index as a circular import (FindingCard.tsx -> index.ts -> FindingCard.tsx)",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    // Protects SKILL.md section 5 (logic ladder, derive-don't-store) and section 3 (renderThing()).
    name: "fixes copied query data, a render helper, derived state and a misnamed pure function",
    kind: "quality",
    prompt: `Refactor this component so it follows the project's frontend conventions. Show the revised code and say what you changed.\n\n${COLLECTED}\n\n${fx("logic-state.txt")}`,
    practices: [
      // SKILL.md section 5 ladder step 3: never copy query results into useState
      "reads the query result directly in render (for example const runs = query.data ?? []) and removes the useState copy of the query data",
      // SKILL.md section 3: only PascalCase functions may return JSX
      "replaces the camelCase renderRow function, which returns JSX, with either JSX written inline inside the map callback or a PascalCase component rendered as an element (for example <RunRow />), so that no camelCase function returns JSX any more",
      // SKILL.md section 5 "Never store what you can derive"
      "computes the total cost during render (for example with reduce over the runs) and removes both the total state and the useEffect that sets it",
      // SKILL.md section 5 ladder step 1: a function that calls no hooks must not be named use*
      "renames useFormatCost to a name without the use prefix (for example formatCost) because it calls no hooks",
    ],
    threshold: 0.75,
    maxTurns: 8,
  },
  {
    // Negative case: every convention is followed, so the skill must stay quiet (SKILL.md sections 2 and 3).
    name: "leaves a conforming folder alone and does not split on length",
    kind: "quality",
    prompt: `A teammate says RunTimeline.tsx is too long and this folder should be restructured. Should I restructure anything in this PR before merging? Answer from the data.\n\n${COLLECTED}\n\n${fx("negative.txt")}`,
    practices: [
      // SKILL.md section 2 anatomy + section 1 home: nothing to change
      "states that no structural change is needed to the RunTimeline folder",
      // SKILL.md section 3 "There is no line count"
      "states that the 168-line length of RunTimeline.tsx alone is not a reason to split it",
      // SKILL.md section 2 "index.ts is the folder's public API"
      "states that RunTimeline/index.ts, which re-exports only the RunTimeline component, is an acceptable barrel as written",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
];
