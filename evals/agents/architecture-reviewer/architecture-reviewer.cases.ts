import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Practices track the agent's CURRENT output contract (.claude/agents/architecture-reviewer.md):
// severities CRITICAL / WARNING / SUGGESTION ("violates the layering rule" with no mechanism is
// WARNING at most), every finding = file:line + rule as skill + section + failure scenario, and the
// report sections Scope reviewed / Findings / Checked and clean / Not checked / Out of scope —
// noticed. Change them in the same commit as the agent, or they fail regardless of quality
// (docs/writing-cases.md §5).

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// The discriminating case: both violations live in reviewer-core and are named ONLY by this repo's
// docs — reviewer-core/CLAUDE.md "Iron rule: No I/O … the ONLY side effect is the injected
// LLMProvider", and its mandatory grounding gate. Skipping the gate lets ungrounded findings out,
// which is "incorrect results" — the one mechanism that earns CRITICAL under the agent's policy.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// The benign negative: a local-variable rename, no new imports, no cross-layer edge. A grounded
// reviewer reports zero findings ("zero findings is a normal answer") instead of inventing one.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// Shared with architecture-reviewer-lite (it imports this file), so an A/B of the two variants
// grades both on the exact same task.
export const cases: AgentCase[] = [
  {
    name: "flags both checkout violations with a contract severity, a skill-section rule and a failure scenario",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags `import type { FastifyReply } from \"fastify\"` in server/src/modules/checkout/domain/checkout.ts as an inner ring depending on an outer (transport) package",
      "flags `private repo = new PgCheckoutRepository()` in CheckoutService as the service constructing its own collaborator instead of receiving it through the constructor, wired in the composition root (container.ts)",
      "names the rule of each finding as a skill plus a section, e.g. `onion-architecture` §4 / \"Inject ports, not the container\"",
      "labels each finding with exactly one of the severities CRITICAL, WARNING or SUGGESTION",
      "labels both checkout findings WARNING or SUGGESTION, not CRITICAL",
      "states a concrete failure scenario for each finding, e.g. that CheckoutService cannot be unit-tested with a substituted repository",
    ],
    threshold: 0.8, // 6 practices → one tolerated miss
    maxTurns: 25,
  },
  {
    name: "keeps non-architecture observations out of the findings table",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "has an `Out of scope — noticed` section that lists non-architecture issues one per line with no severity, or says `none`",
      "has a non-empty `Not checked` section naming what was not reviewed and why",
      "treats the unused optional `reply?: FastifyReply` parameter only as part of the fastify-import finding or as a one-line out-of-scope note, not as its own findings-table row",
    ],
    threshold: 0.6, // 3 practices → one tolerated miss
    maxTurns: 25,
  },
  {
    name: "cites reviewer-core's documented rules and rates the skipped grounding gate CRITICAL",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags `import { readFileSync } from \"node:fs\"` / the `readFileSync(input.promptPath, ...)` call in reviewer-core/src/pipeline/run.ts as file-system I/O inside reviewer-core",
      "states that reviewer-core may do no I/O and that its only side effect is the injected LLMProvider (reviewer-core CLAUDE.md \"Iron rule\" or the onion-architecture Core ring)",
      "flags that runPipeline now returns `deduped`, skipping the `groundFindings` grounding gate",
      "labels the skipped-grounding finding CRITICAL",
      "names the mechanism of the skipped gate: ungrounded or hallucinated findings reach the output (incorrect results)",
    ],
    threshold: 0.8, // 5 practices → one tolerated miss
    maxTurns: 25,
  },
  {
    name: "reports zero findings for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "states that there are no findings for the change (an empty findings table or an explicit \"no findings\")",
      "lists server/src/modules/blast/score.ts (or the `summarize` rename) under `Checked and clean`",
      "states under `Scope reviewed` that a change of one file was reviewed",
    ],
    threshold: 1.0, // short, crisp list
    maxTurns: 25,
  },
];
