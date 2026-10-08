/**
 * CI change detector for the harness evals (.github/workflows/evals.yml).
 *
 * Maps the PR's changed files (newline-separated, repo-relative, in $CHANGED_FILES) onto the eval
 * suites to run. $EVAL_SCOPE overrides the diff for a manual run: changed (default) | all |
 * skills | agents | workflow.
 *
 *   .claude/skills/<name>/**  OR evals/skills/<name>/**   → evals/skills/<name>   (content tier)
 *   .claude/agents/<name>.md  OR evals/agents/<name>/**   → evals/agents/<name>   (tool tier)
 *   an eval folder importing another's cases (`../<name>/`) re-runs with it (agent A/B variants)
 *   any CLAUDE.md, .claude settings/hooks/skill-routing, any agent, evals/workflow/**, or a skill
 *   the workflow cases name                               → the workflow tier
 *   the eval engine or this CI workflow itself             → everything
 *
 * Nothing here is a failure: an artifact with no written evals, or an eval folder whose artifact
 * no longer exists, is logged as `SKIP <tier> <name> — <reason>` and left out of the run.
 *
 * Emits step outputs (skills, agents as JSON arrays; run_workflow, has_work as "true"/"false") to
 * $GITHUB_OUTPUT, or prints them when run locally. No deps — Node built-ins only.
 */

import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCOPES = ["changed", "all", "skills", "agents", "workflow"];

// Changing any of these changes how EVERY eval runs, so the whole suite re-runs.
const ENGINE = [
  /^evals\/src\//,
  /^evals\/(package\.json|pnpm-lock\.yaml|vitest\.config\.ts|tsconfig\.json)$/,
  /^evals\/proxy\//,
  /^\.github\/workflows\/evals\.yml$/,
  /^\.github\/actions\/evals-setup\//,
];

// The workflow tier loads the LIVE harness (settingSources: ["project"]), so these re-trigger it.
const WORKFLOW = [
  /(^|\/)CLAUDE\.md$/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/hooks\//,
  /^\.claude\/skill-routing\.md$/,
  /^\.claude\/agents\/[^/]+\.md$/,
  /^evals\/workflow\//,
];

const SKILL_PATHS = [/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//];
const AGENT_PATHS = [/^\.claude\/agents\/([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//];

/**
 * Pure decision. `repo` is the filesystem view:
 *   evalNames(tier)          → names under evals/<tier>/ that contain a *.eval.ts
 *   artifactExists(tier, n)  → .claude/skills/<n>/SKILL.md or .claude/agents/<n>.md is present
 *   sharedCases(tier, n)     → other eval folders of that tier whose cases n imports
 *   workflowSkills           → skill names quoted in evals/workflow/*.cases.ts
 */
export function detect({ changed, scope = "changed", repo }) {
  if (!SCOPES.includes(scope)) throw new Error(`EVAL_SCOPE must be one of ${SCOPES.join(", ")}, got "${scope}"`);

  const engineChanged = scope === "changed" && changed.some((f) => ENGINE.some((re) => re.test(f)));
  const effective = engineChanged ? "all" : scope;

  const touched = (patterns) => {
    const names = new Set();
    for (const f of changed) {
      for (const re of patterns) {
        const m = f.match(re);
        if (m) names.add(m[1]);
      }
    }
    return names;
  };

  const skipped = [];
  const pick = (tier, candidates) => {
    const withEvals = new Set(repo.evalNames(tier));
    // A variant folder (architecture-reviewer-lite) reuses another folder's cases: run it too.
    for (const name of withEvals) {
      if (repo.sharedCases(tier, name).some((dep) => candidates.has(dep))) candidates.add(name);
    }
    const run = [];
    for (const name of [...candidates].sort()) {
      if (!withEvals.has(name)) skipped.push({ tier, name, reason: `no evals written (evals/${tier}/${name}/)` });
      else if (!repo.artifactExists(tier, name)) skipped.push({ tier, name, reason: `artifact not found (${artifactPath(tier, name)})` });
      else run.push(name);
    }
    return run;
  };

  let skillCandidates;
  let agentCandidates;
  let runWorkflow;
  if (effective === "changed") {
    skillCandidates = touched(SKILL_PATHS);
    agentCandidates = touched(AGENT_PATHS);
    runWorkflow =
      changed.some((f) => WORKFLOW.some((re) => re.test(f))) ||
      [...skillCandidates].some((s) => repo.workflowSkills.has(s));
  } else {
    const all = effective === "all";
    skillCandidates = new Set(all || effective === "skills" ? repo.evalNames("skills") : []);
    agentCandidates = new Set(all || effective === "agents" ? repo.evalNames("agents") : []);
    runWorkflow = all || effective === "workflow";
  }

  const skills = pick("skills", skillCandidates);
  const agents = pick("agents", agentCandidates);
  return { scope: effective, engineChanged, skills, agents, runWorkflow, skipped };
}

function artifactPath(tier, name) {
  return tier === "skills" ? `.claude/skills/${name}/SKILL.md` : `.claude/agents/${name}.md`;
}

/** The real filesystem view of the repo, for `detect`. */
export function fsRepo(repoRoot) {
  const evalsDir = join(repoRoot, "evals");
  const evalFiles = (tier, name) => {
    const dir = join(evalsDir, tier, name);
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".ts")) : [];
  };
  const workflowDir = join(evalsDir, "workflow");
  const workflowText = existsSync(workflowDir)
    ? readdirSync(workflowDir)
        .filter((f) => f.endsWith(".cases.ts"))
        .map((f) => readFileSync(join(workflowDir, f), "utf8"))
        .join("\n")
    : "";
  const skillsDir = join(repoRoot, ".claude", "skills");
  const allSkills = existsSync(skillsDir) ? readdirSync(skillsDir) : [];

  return {
    evalNames(tier) {
      const dir = join(evalsDir, tier);
      if (!existsSync(dir)) return [];
      return readdirSync(dir).filter((n) => evalFiles(tier, n).some((f) => f.endsWith(".eval.ts")));
    },
    artifactExists: (tier, name) => existsSync(join(repoRoot, artifactPath(tier, name))),
    sharedCases(tier, name) {
      const deps = new Set();
      for (const f of evalFiles(tier, name)) {
        const src = readFileSync(join(evalsDir, tier, name, f), "utf8");
        // `../<sibling>/` only — `../../src/index.js` is the engine barrel, not a case folder.
        for (const m of src.matchAll(/from\s+["']\.\.\/([^./"'][^/"']*)\//g)) if (m[1] !== name) deps.add(m[1]);
      }
      return [...deps];
    },
    workflowSkills: new Set(allSkills.filter((s) => workflowText.includes(`"${s}"`))),
  };
}

function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const changed = (process.env.CHANGED_FILES ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const scope = process.env.EVAL_SCOPE || "changed";
  const r = detect({ changed, scope, repo: fsRepo(repoRoot) });

  const out = process.env.GITHUB_OUTPUT;
  const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));
  write("skills", JSON.stringify(r.skills));
  write("agents", JSON.stringify(r.agents));
  write("run_workflow", String(r.runWorkflow));
  write("has_work", String(r.skills.length > 0 || r.agents.length > 0 || r.runWorkflow));

  const log = (s) => console.error(s);
  log("── eval change detection ──");
  log(`scope         : ${r.scope}${r.engineChanged ? " (eval engine / CI workflow changed → full suite)" : ""}`);
  if (scope === "changed") log(`changed files : ${changed.length}`);
  for (const s of r.skills) log(`RUN  skill    ${s}`);
  for (const a of r.agents) log(`RUN  agent    ${a}`);
  log(`${r.runWorkflow ? "RUN " : "SKIP"} workflow${r.runWorkflow ? "" : "  — no harness-level change (CLAUDE.md, .claude settings/hooks/agents, workflow cases)"}`);
  for (const s of r.skipped) log(`SKIP ${s.tier === "skills" ? "skill" : "agent"}    ${s.name} — ${s.reason}`);
  if (!r.skills.length && !r.agents.length && !r.runWorkflow) log("nothing to evaluate for this change");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
