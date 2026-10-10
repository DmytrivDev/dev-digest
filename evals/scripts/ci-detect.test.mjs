// Unit tests for the CI change detector: `node --test evals/scripts/ci-detect.test.mjs`.
// The repo is a fake filesystem view, so adding real evals never breaks these.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { detect, fsRepo, tierTargets } from "./ci-detect.mjs";

const repo = {
  evalNames: (tier) =>
    tier === "skills" ? ["dependency-checker", "engineering-insights"] : ["architecture-reviewer", "architecture-reviewer-lite"],
  artifactExists: (tier, name) => name !== "architecture-reviewer-lite",
  sharedCases: (tier, name) => (name === "architecture-reviewer-lite" ? ["architecture-reviewer"] : []),
  workflowSkills: new Set(["engineering-insights"]),
};
const run = (changed, scope) => detect({ changed, scope, repo });

test("a changed skill with evals runs; one without evals is skipped, not failed", () => {
  const r = run([".claude/skills/dependency-checker/SKILL.md", ".claude/skills/zod/SKILL.md"]);
  assert.deepEqual(r.skills, ["dependency-checker"]);
  assert.deepEqual(r.skipped, [{ tier: "skills", name: "zod", reason: "no evals written (evals/skills/zod/)" }]);
  assert.equal(r.runWorkflow, false);
});

test("editing only the eval cases re-runs that skill", () => {
  assert.deepEqual(run(["evals/skills/dependency-checker/dependency-checker.cases.ts"]).skills, ["dependency-checker"]);
});

test("skills/README.md is not a skill", () => {
  const r = run([".claude/skills/README.md"]);
  assert.deepEqual(r.skills, []);
  assert.deepEqual(r.skipped, []);
});

test("a skill the workflow cases name also triggers the workflow tier", () => {
  const r = run([".claude/skills/engineering-insights/SKILL.md"]);
  assert.deepEqual(r.skills, ["engineering-insights"]);
  assert.equal(r.runWorkflow, true);
});

test("a changed agent runs its evals and the workflow tier; a variant whose artifact is gone is skipped", () => {
  const r = run([".claude/agents/architecture-reviewer.md"]);
  assert.deepEqual(r.agents, ["architecture-reviewer"]);
  assert.equal(r.runWorkflow, true);
  assert.deepEqual(r.skipped, [
    { tier: "agents", name: "architecture-reviewer-lite", reason: "artifact not found (.claude/agents/architecture-reviewer-lite.md)" },
  ]);
});

test("an agent without evals is skipped but still re-runs the workflow tier", () => {
  const r = run([".claude/agents/researcher.md"]);
  assert.deepEqual(r.agents, []);
  assert.equal(r.skipped[0].name, "researcher");
  assert.equal(r.runWorkflow, true);
});

test("root and nested CLAUDE.md, settings, hooks and skill-routing trigger the workflow tier", () => {
  for (const f of ["CLAUDE.md", "server/CLAUDE.md", ".claude/settings.json", ".claude/hooks/x.mjs", ".claude/skill-routing.md"]) {
    const r = run([f]);
    assert.equal(r.runWorkflow, true, f);
    assert.deepEqual([...r.skills, ...r.agents], [], f);
  }
});

test("unrelated changes run nothing", () => {
  const r = run(["server/src/index.ts", "client/INSIGHTS.md", ".claude/settings.local.json"]);
  assert.deepEqual([r.skills, r.agents, r.runWorkflow, r.skipped], [[], [], false, []]);
});

test("an eval-engine or shared-CI change runs the full suite", () => {
  for (const f of ["evals/src/tasks.ts", "evals/package.json", ".github/workflows/eval-detect.yml", ".github/actions/evals-setup/action.yml"]) {
    const r = run([f]);
    assert.equal(r.scope, "all", f);
    assert.deepEqual(r.skills, ["dependency-checker", "engineering-insights"]);
    assert.deepEqual(r.agents, ["architecture-reviewer"]);
    assert.equal(r.runWorkflow, true);
  }
});

test("a tier's own workflow file re-runs that whole tier and nothing else", () => {
  const s = run([".github/workflows/eval-skills.yml"]);
  assert.deepEqual([s.scope, s.skills, s.agents, s.runWorkflow], ["changed", ["dependency-checker", "engineering-insights"], [], false]);
  const a = run([".github/workflows/eval-agents.yml"]);
  assert.deepEqual([a.skills, a.agents, a.runWorkflow], [[], ["architecture-reviewer"], false]);
  const w = run([".github/workflows/eval-workflow.yml"]);
  assert.deepEqual([w.skills, w.agents, w.runWorkflow], [[], [], true]);
});

test("tierTargets slices one tier out of a detect result", () => {
  const r = run([".claude/agents/architecture-reviewer.md"]);
  assert.deepEqual(tierTargets(r, "skills"), []);
  assert.deepEqual(tierTargets(r, "agents"), ["architecture-reviewer"]);
  assert.deepEqual(tierTargets(r, "workflow"), ["workflow"]);
  assert.deepEqual(tierTargets(run(["server/src/index.ts"]), "workflow"), []);
  assert.throws(() => tierTargets(r, "all"), /EVAL_TIER/);
});

test("the old single evals.yml no longer triggers anything", () => {
  const r = run([".github/workflows/evals.yml"]);
  assert.deepEqual([r.skills, r.agents, r.runWorkflow], [[], [], false]);
});

test("manual scopes ignore the diff", () => {
  assert.deepEqual(run([], "skills").agents, []);
  assert.deepEqual(run([], "agents").agents, ["architecture-reviewer"]);
  const wf = run([], "workflow");
  assert.deepEqual([wf.skills, wf.agents, wf.runWorkflow], [[], [], true]);
  assert.throws(() => run([], "everything"), /EVAL_SCOPE/);
});

test("fsRepo reads the real layout", () => {
  const real = fsRepo(fileURLToPath(new URL("../..", import.meta.url)));
  assert.ok(real.evalNames("skills").includes("dependency-checker"));
  assert.ok(real.artifactExists("skills", "dependency-checker"));
  assert.deepEqual(real.sharedCases("agents", "architecture-reviewer-lite"), ["architecture-reviewer"]);
});
