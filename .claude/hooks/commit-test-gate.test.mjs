import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLOSING_LINE,
  GateError,
  appendAuditLog,
  mapTargets,
  parseNameStatus,
  redactCommand,
  runGate,
  runGateAndLog,
  spawnCheck,
} from "./commit-test-gate.mjs";

const GATE = fileURLToPath(new URL("./commit-test-gate.mjs", import.meta.url));
const PARSER = fileURLToPath(new URL("./commit-gate-parse.mjs", import.meta.url));
// The gate inherits CLAUDE_PROJECT_DIR when it runs this suite from a commit; an in-process
// runGate must never see it (it is the trust root and the log location).
delete process.env.CLAUDE_PROJECT_DIR;
// The real audit log of this checkout: no test may write to it (guard test at the end of the file).
const REAL_LOG = fileURLToPath(new URL("../../.devdigest/cache/commit-gate.jsonl", import.meta.url));
const realLogSize = () => (existsSync(REAL_LOG) ? statSync(REAL_LOG).size : -1);
const REAL_LOG_BEFORE = realLogSize();
const tmpRoots = [];
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true, maxRetries: 3 });
});

/* ------------------------------------------------------------------ helpers */

const cleanEnv = () => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE)$/.test(k) || k === "NODE_TEST_CONTEXT") delete env[k];
  return env;
};
const tmp = (prefix = "cg-") => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  tmpRoots.push(d);
  return d;
};
const fwd = (p) => p.replaceAll("\\", "/");
const same = (a, b) => realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase();
const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    env: cleanEnv(),
    stdio: "pipe",
  });
const put = (dir, rel, text = "x\n") => {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};

/** A temp git repo with one commit. `verify` adds a stub scripts/verify.mjs (a DevDigest checkout). */
function makeRepo({ verify = true, files = {} } = {}) {
  const dir = tmp();
  git(dir, "init", "-q");
  put(dir, "README.md", "hi\n");
  if (verify) put(dir, "scripts/verify.mjs", "process.exit(0);\n");
  for (const [rel, text] of Object.entries(files)) put(dir, rel, text);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

const payload = (command, extra = {}) =>
  JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: ".", session_id: "s1", ...extra });

/** Fake check runner: records every invocation; `results[target]` overrides the outcome. */
function fakeRunner(results = {}) {
  const calls = [];
  const fn = async (file, args, opts) => {
    const target = args[0] === "--test" ? "hooks" : args[1];
    calls.push({ file, args, cwd: opts.cwd, target });
    return results[target] ?? { code: 0, output: "", timedOut: false };
  };
  fn.calls = calls;
  return fn;
}
const red = (output = "FAIL typecheck (1.0s) — pnpm typecheck\nboom") => ({ code: 1, output, timedOut: false });

// `deps.projectDir` is the trust root (CLAUDE_PROJECT_DIR); by default the repo the call runs in.
const run = (cwd, command, deps = {}, extra = {}) => runGate(payload(command, { cwd, ...extra }), { projectDir: cwd, ...deps });

/** Spawn the real gate. CLAUDE_PROJECT_DIR is always set (a fresh temp dir by default), so the audit log never lands in the real checkout. */
function spawnGate(input, { projectDir = tmp("cg-proj-"), env = {} } = {}) {
  return spawnSync(process.execPath, [GATE], {
    input,
    encoding: "utf8",
    env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: projectDir, ...env },
    timeout: 30_000,
  });
}

/** A linked worktree of `repo` on a new branch (same repository, other directory). */
function addWorktree(repo, name = "wt") {
  const dir = join(tmp("cg-wt-"), name);
  git(repo, "worktree", "add", "-q", "-b", `b-${name}-${Math.random().toString(36).slice(2, 8)}`, dir);
  return realpathSync(dir);
}

/* --------------------------------------------------------------- pure pieces */

describe("path to target table (AC-26)", () => {
  const rows = [
    ["server/src/a.ts", "server"],
    ["client/src/a.tsx", "client"],
    ["reviewer-core/src/a.ts", "reviewer-core"],
    ["mcp/src/a.ts", "mcp"],
    ["specs/SPEC-06.md", "specs"],
    [".claude/hooks/commit-test-gate.mjs", "hooks"],
  ];
  for (const [path, target] of rows) {
    test(`${path} -> ${target}`, () => assert.deepEqual(mapTargets([path]), [target]));
  }
  test("any other path has no target", () => {
    assert.deepEqual(mapTargets(["docs/a.md", "evals/x.ts", "README.md", ".claude/settings.json", "servers/a.ts", ".claude/hooksx/a"]), []);
  });
  test("targets come back in the fixed order", () => {
    assert.deepEqual(mapTargets(["client/a", "server/a", "mcp/a", "reviewer-core/a", "specs/a", ".claude/hooks/a"]), [
      "hooks", "specs", "reviewer-core", "mcp", "server", "client",
    ]);
  });
});

test("parseNameStatus: renames contribute both paths (AC-25)", () => {
  const out = ["M", "a.txt", "R100", "old.ts", "new.ts", "A", "b.txt", "D", "c.txt", ""].join("\0");
  assert.deepEqual(parseNameStatus(out), ["a.txt", "old.ts", "new.ts", "b.txt", "c.txt"]);
  assert.deepEqual(parseNameStatus(""), []);
});

describe("redaction and truncation (NFR-5)", () => {
  test("leading assignment values become ***", () => {
    assert.equal(redactCommand("OPENROUTER_API_KEY=sk-or-x git commit -m y"), "OPENROUTER_API_KEY=*** git commit -m y");
    assert.equal(redactCommand("A=1 B='x y' C=\"q r\" git commit"), "A=*** B=*** C=*** git commit");
    assert.equal(redactCommand("cd x && TOKEN=abc git commit -m a"), "cd x && TOKEN=*** git commit -m a");
    assert.equal(redactCommand("git commit -m a=b"), "git commit -m a=b");
  });
  test("a 2000-character command is cut to 500", () => {
    assert.equal(redactCommand(`git commit -m ${"a".repeat(2000)}`).length, 500);
  });

  // Obviously fake values only.
  const FAKE_OR = "sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE";
  const assignForms = [
    [`$env:OPENROUTER_API_KEY = "${FAKE_OR}"; git commit -m x`, '$env:OPENROUTER_API_KEY = ***; git commit -m x'],
    [`$env:OPENROUTER_API_KEY="${FAKE_OR}"; git commit -m x`, "$env:OPENROUTER_API_KEY=***; git commit -m x"],
    [`$token = 'FAKE-not-a-known-shape'; git commit -m x`, "$token = ***; git commit -m x"],
    [`export KEY=FAKE-secret-value && git commit`, "export KEY=*** && git commit"],
    [`export A=1 B=FAKE-two; git commit`, "export A=*** B=***; git commit"],
    [`declare -x KEY=FAKE-secret-value; git commit`, "declare -x KEY=***; git commit"],
    [`readonly KEY=FAKE-secret-value; git commit`, "readonly KEY=***; git commit"],
    [`set KEY=FAKE-secret-value & git commit`, "set KEY=*** & git commit"],
    [`set "KEY=FAKE-secret-value" && git commit`, 'set "KEY=***" && git commit'],
    [`git -c http.extraheader="Authorization: basic FAKEFAKE" commit -m x`, "git -c http.extraheader=*** commit -m x"],
    [`git -c http.extraheader=FAKE-header commit -m x`, "git -c http.extraheader=*** commit -m x"],
    // behind env / sudo and their options
    [`env OPENAI_API_KEY=FAKE-secret-value git commit -m x`, "env OPENAI_API_KEY=*** git commit -m x"],
    [`env -i -u FOO OPENAI_API_KEY=FAKE-one B=FAKE-two git commit`, "env -i -u FOO OPENAI_API_KEY=*** B=*** git commit"],
    [`sudo TOKEN=FAKE-secret-value git commit`, "sudo TOKEN=*** git commit"],
    [`sudo -u me -E TOKEN=FAKE-secret-value git commit`, "sudo -u me -E TOKEN=*** git commit"],
    [`sudo env TOKEN=FAKE-secret-value git commit`, "sudo env TOKEN=*** git commit"],
    [`cd x && env TOKEN=FAKE-secret-value git commit`, "cd x && env TOKEN=*** git commit"],
    // quoted override, `basic` scheme, URL-scoped key
    [`git -c "http.extraheader=AUTHORIZATION: basic Zm9vOmJhcg==" commit -m x`, 'git -c "http.extraheader=***" commit -m x'],
    [`git -c 'http.extraheader=AUTHORIZATION: Basic Zm9vOmJhcg==' commit`, "git -c 'http.extraheader=***' commit"],
    [`git -c http.https://github.com/.extraheader=FAKE-header commit -m x`, "git -c http.https://github.com/.extraheader=*** commit -m x"],
    [`git -c "http.https://github.com/.extraheader=FAKE header" commit`, 'git -c "http.https://github.com/.extraheader=***" commit'],
    [`curl -H 'Authorization: Basic Zm9vOmJhcg==' x`, "curl -H 'Authorization: Basic ***' x"],
  ];
  for (const [input, expected] of assignForms) {
    test(`assignment form: ${input.slice(0, 48)}`, () => assert.equal(redactCommand(input), expected));
  }

  test("forms that must stay readable are left alone", () => {
    assert.equal(redactCommand("$out = git commit -m a"), "$out = git commit -m a");
    assert.equal(redactCommand("set -e; git commit -m a"), "set -e; git commit -m a");
    assert.equal(redactCommand("git commit -m a=b"), "git commit -m a=b");
    assert.equal(redactCommand("git commit -m 'basic usage guide'"), "git commit -m 'basic usage guide'");
    assert.equal(redactCommand('bash -c "x=1; git commit -m y"'), 'bash -c "x=1; git commit -m y"');
    assert.equal(redactCommand("sudo git commit -m a"), "sudo git commit -m a");
    assert.equal(redactCommand("env git commit -m a"), "env git commit -m a");
  });

  const shapes = [
    ["sk-or-v1", FAKE_OR],
    ["sk-ant", "sk-ant-api03-FAKEFAKEFAKEFAKE"],
    ["sk-proj", "sk-proj-FAKEFAKEFAKEFAKE"],
    ["generic sk-", "sk-FAKEFAKEFAKEFAKEFAKE0123"],
    ["ghp_", "ghp_FAKEFAKEFAKEFAKEFAKE0123"],
    ["gho_", "gho_FAKEFAKEFAKEFAKEFAKE0123"],
    ["ghs_", "ghs_FAKEFAKEFAKEFAKEFAKE0123"],
    ["github_pat_", "github_pat_FAKEFAKEFAKEFAKEFAKE0123"],
    ["AKIA", "AKIAFAKEFAKEFAKE0123"],
    ["xoxb-", "xoxb-0000-FAKEFAKE"],
    ["xoxa-", "xoxa-0000-FAKEFAKE"],
    ["xoxp-", "xoxp-0000-FAKEFAKE"],
  ];
  for (const [name, secret] of shapes) {
    test(`key shape ${name} is masked anywhere in the command`, () => {
      const out = redactCommand(`echo before ${secret} after && curl --data "k=${secret}" && git commit -m "${secret}"`);
      assert.equal(out.includes(secret), false, out);
      assert.equal(out.includes("FAKEFAKE"), false, out);
      assert.match(out, /^echo before \*\*\* after/);
    });
  }

  test("Bearer tokens and URL credentials are masked", () => {
    assert.equal(redactCommand('curl -H "Authorization: Bearer FAKEtoken0123abc" x && git commit'), 'curl -H "Authorization: Bearer ***" x && git commit');
    assert.equal(redactCommand("git push https://user:FAKEpass@example.com/r.git"), "git push https://***@example.com/r.git");
  });

  test("masking happens before the cut: a secret at the 500 boundary leaks no prefix", () => {
    const out = redactCommand(`${"a".repeat(495)} ${FAKE_OR}`);
    assert.equal(out.length <= 500, true);
    assert.equal(out.includes("sk-or"), false);
  });

  test("a shape inside a word is not a secret", () => {
    assert.equal(redactCommand("git commit -m task-FAKEFAKEFAKEFAKEFAKEFAKE"), "git commit -m task-FAKEFAKEFAKEFAKEFAKEFAKE");
  });
});

/* -------------------------------------------------- non-commit: spawned gate */

describe("non-commit commands (AC-18, NFR-1 path)", () => {
  for (const [tool, command] of [["Bash", "ls"], ["Bash", "git status"], ["Bash", "git log"], ["Bash", "pnpm test"], ["PowerShell", "Get-ChildItem"], ["Bash", "echo 'git commit'"]]) {
    test(`${tool}: ${command} -> exit 0, silent, no log`, () => {
      const project = tmp();
      const r = spawnGate(JSON.stringify({ tool_name: tool, tool_input: { command }, cwd: project }), { projectDir: project });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, "");
      assert.equal(r.stderr, "");
      assert.equal(existsSync(join(project, ".devdigest")), false);
    });
  }
  test("no git query and no check for a non-commit", async () => {
    const boom = async () => {
      throw new Error("git must not be called");
    };
    const runner = fakeRunner();
    const r = await runGate(payload("ls && git status"), { git: boom, runCheck: runner });
    assert.deepEqual(r, { exitCode: 0, stderr: "", logLine: null });
    assert.equal(runner.calls.length, 0);
  });
});

/* ------------------------------------------------------- AC-19 / AC-24 gating */

describe("decisions per call", () => {
  test("two commits in one call are one gated decision (AC-19)", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const runner = fakeRunner();
    const r = await run(repo, "git commit -m a && git commit -m b", { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(runner.calls.map((c) => c.target), ["server"]);
    assert.equal(r.logLine.result, "allow");
  });

  for (const cmd of ["git commit --no-verify -m x", "git commit -n -m x", "git commit -anm x", "cd . && git commit --no-verify"]) {
    test(`bypass: ${cmd} -> exit 2 without checks (AC-24)`, async () => {
      const runner = fakeRunner();
      const boom = async () => {
        throw new Error("no git for a bypass");
      };
      const r = await runGate(payload(cmd), { runCheck: runner, git: boom });
      assert.equal(r.exitCode, 2);
      assert.match(r.stderr, /cannot be bypassed from the agent/);
      assert.equal(runner.calls.length, 0);
      assert.equal(r.logLine.reason, "bypass_flag");
      assert.equal(r.logLine.result, "block");
    });
  }

  test('git commit -m "-n" is not blocked for that reason (AC-24)', async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const runner = fakeRunner();
    const r = await run(repo, 'git commit -m "-n"', { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.equal(runner.calls.length, 1);
  });

  test("PowerShell payloads are classified as for Bash (AC-23)", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const runner = fakeRunner();
    const input = JSON.stringify({ tool_name: "PowerShell", tool_input: { command: "& git commit -m x" }, cwd: repo });
    assert.equal((await runGate(input, { runCheck: runner })).exitCode, 0);
    assert.equal(runner.calls.length, 1);
    const none = JSON.stringify({ tool_name: "PowerShell", tool_input: { command: "Write-Host 'git commit'" }, cwd: repo });
    assert.equal((await runGate(none, { runCheck: runner })).logLine, null);
  });
});

/* ------------------------------------------------- AC-25 touched paths, trees */

describe("touched paths (AC-25)", () => {
  const targetsOf = async (repo, command = "git commit -m x", cwd = repo) => {
    const runner = fakeRunner();
    const r = await run(cwd, command, { runCheck: runner });
    assert.equal(r.exitCode, 0);
    return runner.calls.map((c) => c.target);
  };

  test("staged files", async () => {
    const repo = makeRepo();
    put(repo, "mcp/s.ts");
    git(repo, "add", "mcp/s.ts");
    assert.deepEqual(await targetsOf(repo), ["mcp"]);
  });

  test("unstaged changes to tracked files", async () => {
    const repo = makeRepo({ files: { "client/t.ts": "a\n" } });
    put(repo, "client/t.ts", "b\n");
    assert.deepEqual(await targetsOf(repo), ["client"]);
  });

  test("untracked, non-ignored files; ignored ones do not count", async () => {
    const repo = makeRepo({ files: { ".gitignore": "server/ignored.ts\n" } });
    put(repo, "server/ignored.ts");
    put(repo, "specs/u.md");
    assert.deepEqual(await targetsOf(repo), ["specs"]);
  });

  test("a rename contributes both paths", async () => {
    const repo = makeRepo({ files: { "reviewer-core/old.ts": "x\n" } });
    mkdirSync(join(repo, "specs"), { recursive: true });
    git(repo, "mv", "reviewer-core/old.ts", "specs/new.md");
    assert.deepEqual(await targetsOf(repo), ["specs", "reviewer-core"]);
  });

  test("the union of all three sets", async () => {
    const repo = makeRepo({ files: { "client/t.ts": "a\n" } });
    put(repo, "mcp/s.ts");
    git(repo, "add", "mcp/s.ts");
    put(repo, "client/t.ts", "b\n");
    put(repo, ".claude/hooks/u.mjs");
    assert.deepEqual(await targetsOf(repo), ["hooks", "mcp", "client"]);
  });

  test("resolution order: stdin cwd, then cd, then -C", async () => {
    const a = makeRepo();
    const b = addWorktree(a, "b"); // trees named by cd / -C must be the project or its worktrees
    const c = addWorktree(a, "c");
    put(a, "server/x.ts");
    put(b, "client/x.ts");
    put(c, "mcp/x.ts");
    assert.deepEqual(await targetsOf(a, "git commit -m x", a), ["server"]);
    assert.deepEqual(await targetsOf(a, `cd ${fwd(b)} && git commit -m x`, a), ["client"]);
    assert.deepEqual(await targetsOf(a, `git -C ${fwd(c)} commit -m x`, a), ["mcp"]);
    assert.deepEqual(await targetsOf(a, `cd ${fwd(b)} && git -C ${fwd(c)} commit -m x`, a), ["mcp"]);
    assert.deepEqual(await targetsOf(a, `Set-Location '${fwd(b)}'; git commit -m x`, a), ["server"]); // Bash dialect: not a cd
    const runner = fakeRunner();
    await run(a, `cd ${fwd(b)} && git commit -m x`, { runCheck: runner });
    assert.ok(same(runner.calls[0].cwd, b), "checks run in the resolved work tree");
  });

  test("a sub-directory cwd resolves to the work-tree top", async () => {
    const repo = makeRepo();
    put(repo, "server/sub/x.ts");
    const runner = fakeRunner();
    await run(join(repo, "server", "sub"), "git commit -m x", { runCheck: runner });
    assert.deepEqual(runner.calls.map((c) => c.target), ["server"]);
    assert.ok(same(runner.calls[0].cwd, repo));
  });

  test("a relative cd resolves against the stdin cwd", async () => {
    const repo = makeRepo();
    put(repo, "client/x.ts");
    mkdirSync(join(repo, "server"), { recursive: true });
    assert.deepEqual(await targetsOf(repo, "cd server && git commit -m x", repo), ["client"]);
  });
});

/* ------------------------------------------------- trust boundary, every commit */

/** A real git that records every call, so a test can see where git ran and what it was asked. */
function recordingGit() {
  const calls = [];
  const fn = async (args, cwd) => {
    calls.push({ args, cwd });
    try {
      return execFileSync("git", args, { cwd, env: cleanEnv(), encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      throw new GateError("git_query_failed", String(e.stderr || e.message).trim().split("\n")[0]);
    }
  };
  fn.calls = calls;
  return fn;
}

/** A DevDigest-shaped repo whose scripts/verify.mjs leaves a sentinel file when it is run. */
function sentinelRepo(extra = {}) {
  return makeRepo({
    files: { "scripts/verify.mjs": `import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("../SENTINEL", import.meta.url), "ran");\n`, ...extra },
  });
}

describe("trust boundary: a tree chosen by the command text", () => {
  test("a repo outside the project -> out_of_scope, nothing of it is executed", async () => {
    const project = makeRepo();
    const outside = sentinelRepo();
    put(outside, "server/a.ts");
    const gitSpy = recordingGit();
    // the real check runner on purpose: a regression would run the outside verify.mjs
    const r = await run(project, `git -C ${fwd(outside)} commit -m x`, { git: gitSpy });
    assert.equal(r.exitCode, 0);
    assert.deepEqual([r.logLine.result, r.logLine.reason, r.logLine.targets], ["allow", "outside_project", []]);
    assert.equal(existsSync(join(outside, "SENTINEL")), false, "the outside verify.mjs must not run");
    for (const c of gitSpy.calls) {
      assert.ok(same(c.cwd, project), `git ran in ${c.cwd}`);
      assert.equal(c.args.some((a) => ["diff", "status", "ls-files"].includes(a)), false, `tree-dependent call ${c.args.join(" ")}`);
    }
    // control: the same repo as the project is gated and its verify.mjs does run
    const control = await run(outside, "git commit -m x");
    assert.equal(control.exitCode, 0);
    assert.equal(existsSync(join(outside, "SENTINEL")), true, "control: the sentinel script works");
  });

  test("cd into a repo outside the project is out of scope too", async () => {
    const project = makeRepo();
    const outside = sentinelRepo();
    put(outside, "server/a.ts");
    const runner = fakeRunner();
    const r = await run(project, `cd ${fwd(outside)} && git commit -m x`, { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.equal(r.logLine.reason, "outside_project");
    assert.equal(runner.calls.length, 0);
  });

  test("the payload cwd never becomes a git cwd when CLAUDE_PROJECT_DIR is known", async () => {
    const project = makeRepo();
    const outside = sentinelRepo();
    put(outside, "server/a.ts");
    const gitSpy = recordingGit();
    const runner = fakeRunner();
    // a commit made from an outside cwd (no cd, no -C)
    const r = await runGate(payload("git commit -m x", { cwd: outside }), { projectDir: project, git: gitSpy, runCheck: runner });
    assert.equal(r.logLine.reason, "outside_project");
    assert.equal(runner.calls.length, 0);
    assert.ok(gitSpy.calls.length > 0);
    for (const c of gitSpy.calls) assert.ok(same(c.cwd, project), `git ran in ${c.cwd}`);
  });

  test("a core.fsmonitor command in an outside repo never runs (git diff would run it)", async () => {
    const project = makeRepo();
    const outside = makeRepo();
    const hook = join(tmp(), "fsmonitor.mjs");
    writeFileSync(hook, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(join(outside, "FSM"))}, "ran");\nconsole.log("");\n`);
    git(outside, "config", "core.fsmonitor", `"${fwd(process.execPath)}" "${fwd(hook)}"`);
    put(outside, "README.md", "changed\n");
    execFileSync("git", ["diff", "--name-status"], { cwd: outside, env: cleanEnv(), stdio: "pipe" });
    assert.equal(existsSync(join(outside, "FSM")), true, "control: a plain git diff runs the fsmonitor command");
    rmSync(join(outside, "FSM"));

    const r = await run(project, `git -C ${fwd(outside)} commit -am x`, { runCheck: fakeRunner() });
    assert.equal(r.logLine.reason, "outside_project");
    assert.equal(existsSync(join(outside, "FSM")), false, "no tree-dependent git call in an outside repo");

    // inside the project the gate still does not let the tree's own fsmonitor run
    const r2 = await run(outside, "git commit -am x", { runCheck: fakeRunner() });
    assert.equal(r2.exitCode, 0);
    assert.equal(existsSync(join(outside, "FSM")), false, "fsmonitor is disabled for the gate's own diff");
  });

  test("a linked worktree of the project is gated, with its own cwd", async () => {
    const project = makeRepo();
    const wt = addWorktree(project);
    put(wt, "client/a.ts");
    for (const cmd of [`git -C ${fwd(wt)} commit -m x`, `cd ${fwd(wt)} && git commit -m x`]) {
      const runner = fakeRunner();
      const r = await run(project, cmd, { runCheck: runner });
      assert.equal(r.exitCode, 0, cmd);
      assert.deepEqual(runner.calls.map((c) => c.target), ["client"], cmd);
      assert.ok(same(runner.calls[0].cwd, wt), cmd);
    }
    const red1 = await run(project, `git -C ${fwd(wt)} commit -m x`, { runCheck: fakeRunner({ client: red() }) });
    assert.equal(red1.exitCode, 2);
  });

  test("the project given by CLAUDE_PROJECT_DIR may itself be a linked worktree, and its main tree is a sibling", async () => {
    const main = makeRepo();
    const wt = addWorktree(main);
    put(main, "server/a.ts");
    const runner = fakeRunner();
    const r = await run(wt, `git -C ${fwd(main)} commit -m x`, { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(runner.calls.map((c) => c.target), ["server"]);
  });

  test("a nested repo inside the project is not the project", async () => {
    const project = makeRepo();
    const nested = join(project, "vendor-repo");
    mkdirSync(nested, { recursive: true });
    git(nested, "init", "-q");
    put(nested, "scripts/verify.mjs", `import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("../SENTINEL", import.meta.url), "ran");\n`);
    put(nested, "server/a.ts");
    const r = await run(project, `git -C ${fwd(nested)} commit -m x`);
    assert.equal(r.exitCode, 0);
    assert.equal(r.logLine.reason, "outside_project");
    assert.equal(existsSync(join(nested, "SENTINEL")), false);
  });

  test("spawned gate: CLAUDE_PROJECT_DIR is the trust root, even with the gate's own cwd elsewhere", () => {
    const project = makeRepo();
    const outside = sentinelRepo();
    put(outside, "server/a.ts");
    const r = spawnSync(process.execPath, [GATE], {
      input: payload(`git -C ${fwd(outside)} commit -m x`, { cwd: outside }),
      encoding: "utf8",
      env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: project },
      cwd: outside, // the hook process itself starts in the untrusted repo
      timeout: 30_000,
    });
    assert.equal(r.status, 0);
    assert.equal(existsSync(join(outside, "SENTINEL")), false);
    const line = JSON.parse(readFileSync(join(project, ".devdigest", "cache", "commit-gate.jsonl"), "utf8").trim());
    assert.deepEqual([line.result, line.reason], ["allow", "outside_project"]);
  });
});

describe("uncertain trees: the tree the session started in is gated too", () => {
  // outside repo `o` is named by every form; the shell really commits in the session's directory.
  const cdForms = [
    ["Bash", "subshell", (o) => `(cd ${o}); git commit -am x`],
    ["Bash", "cd -", (o) => `cd ${o}; cd -; git commit -am x`],
    ["Bash", "pushd/popd", (o) => `pushd ${o}; popd; git commit -am x`],
    ["Bash", "group", (o) => `{ cd ${o}; }; git commit -am x`],
    ["Bash", "$( )", (o) => `echo $(cd ${o}); git commit -am x`],
    ["Bash", "backticks", (o) => `echo \`cd ${o}\`; git commit -am x`],
    ["Bash", "nested shell", (o) => `bash -c 'cd ${o}'; git commit -am x`],
    ["Bash", "bare cd", (o) => `cd ${o}; cd; git commit -am x`],
    ["PowerShell", "subshell", (o) => `(Set-Location '${o}'); git commit -am x`],
    ["PowerShell", "Push/Pop-Location", (o) => `Push-Location '${o}'; Pop-Location; git commit -am x`],
    ["PowerShell", "script block", (o) => `& { Set-Location '${o}' }; git commit -am x`],
    ["PowerShell", "$( )", (o) => `$(Set-Location '${o}'); git commit -am x`],
  ];
  for (const [tool, name, make] of cdForms) {
    test(`${tool} ${name}: the project is gated although the text names an outside repo`, async () => {
      const project = makeRepo();
      const outside = sentinelRepo();
      put(project, "server/a.ts");
      put(outside, "client/a.ts");
      const cmd = make(fwd(outside));
      const runner = fakeRunner();
      const r = await run(project, cmd, { runCheck: runner }, { tool_name: tool });
      assert.equal(r.exitCode, 0, cmd);
      assert.deepEqual(runner.calls.map((c) => [c.target, same(c.cwd, project)]), [["server", true]], cmd);
      const blocked = await run(project, cmd, { runCheck: fakeRunner({ server: red() }) }, { tool_name: tool });
      assert.equal(blocked.exitCode, 2, cmd);
      assert.equal(existsSync(join(outside, "SENTINEL")), false);
    });
  }

  test("an uncertain commit gates every tree of the project, even from a session that started outside it", async () => {
    const project = makeRepo();
    const outside = makeRepo();
    put(project, "server/a.ts");
    const runner = fakeRunner();
    const r = await runGate(payload(`(cd ${fwd(outside)}); git commit -am x`, { cwd: outside }), { projectDir: project, runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(runner.calls.map((c) => [c.target, same(c.cwd, project)]), [["server", true]]);
    // ...while a certain commit from an outside session stays out of scope
    const certain = fakeRunner();
    const r2 = await runGate(payload(`cd ${fwd(outside)} && git commit -am x`, { cwd: outside }), { projectDir: project, runCheck: certain });
    assert.equal(r2.logLine.reason, "outside_project");
    assert.equal(certain.calls.length, 0);
  });

  const redirectForms = [
    ["Bash", "--git-dir=/--work-tree=", (o, p) => `git -C ${o} --git-dir=${p}/.git --work-tree=${p} commit -am x`],
    ["Bash", "--git-dir <v> --work-tree <v>", (o, p) => `git -C ${o} --git-dir ${p}/.git --work-tree ${p} commit -am x`],
    ["Bash", "GIT_DIR= GIT_WORK_TREE= prefix", (o, p) => `GIT_DIR=${p}/.git GIT_WORK_TREE=${p} git -C ${o} commit -am x`],
    ["Bash", "env GIT_DIR=", (o, p) => `env GIT_DIR=${p}/.git git -C ${o} commit -am x`],
    ["Bash", "env -i GIT_WORK_TREE=", (o, p) => `env -i GIT_WORK_TREE=${p} git -C ${o} commit -am x`],
    ["Bash", "export GIT_DIR=", (o, p) => `export GIT_DIR=${p}/.git; git -C ${o} commit -am x`],
    ["Bash", "GIT_INDEX_FILE=", (o, p) => `GIT_INDEX_FILE=${p}/.git/index git -C ${o} commit -am x`],
    ["Bash", "GIT_COMMON_DIR=", (o, p) => `GIT_COMMON_DIR=${p}/.git git -C ${o} commit -am x`],
    ["Bash", "-c core.worktree=", (o, p) => `git -C ${o} -c core.worktree=${p} commit -am x`],
    ["PowerShell", "$env:GIT_DIR =", (o, p) => `$env:GIT_DIR = '${p}/.git'; git -C '${o}' commit -am x`],
  ];
  for (const [tool, name, make] of redirectForms) {
    test(`${tool} ${name}: the project is gated and no attacker path reaches git`, async () => {
      const project = makeRepo();
      const outside = sentinelRepo();
      put(project, "server/a.ts");
      put(outside, "client/a.ts");
      const cmd = make(fwd(outside), fwd(project));
      const gitSpy = recordingGit();
      const runner = fakeRunner();
      const r = await run(project, cmd, { runCheck: runner, git: gitSpy }, { tool_name: tool });
      assert.equal(r.exitCode, 0, cmd);
      assert.deepEqual(runner.calls.map((c) => [c.target, same(c.cwd, project)]), [["server", true]], cmd);
      for (const c of gitSpy.calls) {
        assert.ok(same(c.cwd, project), `git ran in ${c.cwd}`);
        for (const a of c.args) assert.equal(/--git-dir|--work-tree|\.git(\/|$)|core\.worktree/.test(fwd(a)), false, `attacker option reached git: ${a}`);
      }
      const blocked = await run(project, cmd, { runCheck: fakeRunner({ server: red() }) }, { tool_name: tool });
      assert.equal(blocked.exitCode, 2, cmd);
      assert.equal(existsSync(join(outside, "SENTINEL")), false);
    });
  }
});

describe("a start directory outside the project is never asked about", () => {
  test("no rev-parse for it, even when it does not exist", async () => {
    const project = makeRepo();
    const gitSpy = recordingGit();
    const runner = fakeRunner();
    const gone = join(tmp(), "does-not-exist");
    const r = await run(project, `git -C ${fwd(gone)} commit -m x`, { runCheck: runner, git: gitSpy });
    assert.equal(r.exitCode, 0);
    assert.equal(r.logLine.reason, "outside_project");
    assert.deepEqual(gitSpy.calls.map((c) => c.args.slice(0, 4).join(" ")), [`-C ${project} worktree list`]);
    assert.equal(runner.calls.length, 0);
  });

  test("the rev-parse that does run has fsmonitor off and the trusted cwd", async () => {
    const project = makeRepo();
    mkdirSync(join(project, "sub"), { recursive: true });
    const gitSpy = recordingGit();
    await run(project, "cd sub && git commit -m x", { runCheck: fakeRunner(), git: gitSpy });
    const rp = gitSpy.calls.filter((c) => c.args.includes("rev-parse"));
    assert.equal(rp.length, 1);
    assert.ok(rp[0].args.includes("core.fsmonitor=false"));
    assert.ok(same(rp[0].cwd, project));
  });
});

describe("trust root and log location agree", () => {
  test("spawned gate without CLAUDE_PROJECT_DIR: the hook's own location is the trust root and holds the log", () => {
    // a copy of the hook files in a temp "project": the gate must not fall back to the payload cwd
    const project = tmp("cg-hookroot-");
    mkdirSync(join(project, ".claude", "hooks"), { recursive: true });
    for (const f of [GATE, PARSER]) copyFileSync(f, join(project, ".claude", "hooks", f.split(/[\\/]/).pop()));
    const outside = sentinelRepo();
    put(outside, "server/a.ts");
    const env = cleanEnv();
    delete env.CLAUDE_PROJECT_DIR;
    const r = spawnSync(process.execPath, [join(project, ".claude", "hooks", "commit-test-gate.mjs")], {
      input: payload("git commit -m x", { cwd: outside }),
      encoding: "utf8",
      env,
      cwd: project,
      timeout: 30_000,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(join(outside, "SENTINEL")), false, "the payload cwd was not trusted");
    const line = JSON.parse(readFileSync(join(project, ".devdigest", "cache", "commit-gate.jsonl"), "utf8").trim());
    assert.deepEqual([line.result, line.reason], ["allow", "outside_project"]);
  });
});

describe("a failed or expanded cd, and every tree of the project", () => {
  const nativeJoin = (...p) => join(...p); // backslashes on Windows: the PowerShell forms use them on purpose

  test("cd to a directory that does not exist: the commit lands in the session tree, which is gated", async () => {
    const project = makeRepo();
    put(project, "server/a.ts");
    const gone = nativeJoin(tmp(), "no", "such", "dir");
    const cases = [
      ["Bash", `cd ${fwd(gone)}; git commit -m x`],
      ["Bash", `cd ${fwd(gone)} && git commit -m x`],
      ["Bash", `cd ../no-such-sibling-dir; git commit -m x`],
      ["PowerShell", `cd '${gone}'; git commit -m x`],
      ["PowerShell", `Set-Location -Path '${gone}'; git commit -m x`],
    ];
    for (const [tool, cmd] of cases) {
      const runner = fakeRunner();
      const r = await run(project, cmd, { runCheck: runner }, { tool_name: tool });
      assert.equal(r.exitCode, 0, cmd);
      assert.deepEqual(runner.calls.map((c) => [c.target, same(c.cwd, project)]), [["server", true]], cmd);
      const blocked = await run(project, cmd, { runCheck: fakeRunner({ server: red() }) }, { tool_name: tool });
      assert.equal(blocked.exitCode, 2, cmd);
    }
  });

  test("cd to an existing FILE fails the same way", async () => {
    const project = makeRepo();
    put(project, "server/a.ts");
    const file = join(tmp(), "a-file.txt");
    writeFileSync(file, "x");
    for (const [tool, cmd] of [["Bash", `cd ${fwd(file)}; git commit -m x`], ["PowerShell", `cd '${file}'; git commit -m x`]]) {
      const runner = fakeRunner();
      const r = await run(project, cmd, { runCheck: runner }, { tool_name: tool });
      assert.deepEqual(runner.calls.map((c) => c.target), ["server"], cmd);
      assert.equal(r.exitCode, 0);
    }
  });

  test("a later step of a cd chain that fails breaks it too", async () => {
    const project = makeRepo();
    put(project, "server/a.ts");
    const ok = tmp();
    const runner = fakeRunner();
    await run(project, `cd ${fwd(ok)} && cd no-such-subdir; git commit -m x`, { runCheck: runner });
    assert.deepEqual(runner.calls.map((c) => c.target), ["server"]);
  });

  test("a cd to an existing directory outside the project, and a -C to a missing one, stay out of scope", async () => {
    const project = makeRepo();
    put(project, "server/a.ts");
    const outside = makeRepo();
    const gone = nativeJoin(tmp(), "gone");
    for (const cmd of [`cd ${fwd(outside)} && git commit -m x`, `git -C ${fwd(gone)} commit -m x`, `cd ${fwd(outside)} && git -C ${fwd(gone)} commit -m x`]) {
      const runner = fakeRunner();
      const r = await run(project, cmd, { runCheck: runner });
      assert.equal(r.logLine.reason, "outside_project", cmd);
      assert.equal(runner.calls.length, 0, cmd);
    }
  });

  test("a cd or -C target the shell expands ($X, glob, ~user) is uncertain: the project is gated", async () => {
    const project = makeRepo();
    const outside = makeRepo();
    put(project, "server/a.ts");
    const o = fwd(outside);
    for (const cmd of [`cd ${o}$X; git commit -m x`, `cd ${o}*; git commit -m x`, `cd ${o}/?; git commit -m x`, `cd ~someone/x; git commit -m x`, `git -C ${o}* commit -m x`, `git -C ${o}$X commit -m x`]) {
      const runner = fakeRunner();
      const r = await run(project, cmd, { runCheck: runner });
      assert.equal(r.exitCode, 0, cmd);
      assert.deepEqual(runner.calls.map((c) => [c.target, same(c.cwd, project)]), [["server", true]], cmd);
    }
  });

  test("uncertain commits gate a SECOND linked worktree, not only the start tree", async () => {
    const main = makeRepo();
    const wt2 = addWorktree(main, "second");
    const outside = makeRepo();
    put(wt2, "client/a.ts"); // the only change in the whole project is in the second worktree
    const w = fwd(wt2);
    const cases = [
      `cd ${w}; cd ${fwd(outside)}; cd -; git commit -m x`,
      `git --git-dir=${w}/.git --work-tree=${w} commit -m x`,
      `GIT_DIR=${w}/.git GIT_WORK_TREE=${w} git commit -m x`,
      `git --work-tree ${w} commit -m x`,
      `(cd ${w}); git commit -m x`,
    ];
    for (const cmd of cases) {
      const runner = fakeRunner();
      const r = await run(main, cmd, { runCheck: runner });
      assert.equal(r.exitCode, 0, cmd);
      assert.deepEqual(runner.calls.map((c) => [c.target, same(c.cwd, wt2)]), [["client", true]], cmd);
      const blocked = await run(main, cmd, { runCheck: fakeRunner({ client: red() }) });
      assert.equal(blocked.exitCode, 2, cmd);
    }
  });

  test("a certain commit does not widen to the other worktrees", async () => {
    const main = makeRepo();
    const wt2 = addWorktree(main, "second");
    put(wt2, "client/a.ts");
    const runner = fakeRunner();
    const r = await run(main, "git commit -m x", { runCheck: runner });
    assert.equal(r.logLine.reason, "no_targets");
    assert.equal(runner.calls.length, 0);
  });

  test("a deleted (prunable) sibling worktree does not take an uncertain commit down", async () => {
    const main = makeRepo();
    const dead = addWorktree(main, "dead");
    rmSync(dead, { recursive: true, force: true, maxRetries: 3 });
    put(main, "server/a.ts");
    const runner = fakeRunner();
    const r = await run(main, "(cd .); git commit -m x", { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(runner.calls.map((c) => c.target), ["server"]);
  });

  test("--config-env core.worktree and GIT_CONFIG_* are uncertain: the other worktree is gated", async () => {
    const main = makeRepo();
    const wt2 = addWorktree(main, "second");
    put(wt2, "client/a.ts");
    for (const cmd of [
      "git --config-env=core.worktree=WT commit -m x",
      "git --config-env core.worktree=WT commit -m x",
      "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.worktree GIT_CONFIG_VALUE_0=/x git commit -m x",
      "GIT_CONFIG_PARAMETERS=\"'core.worktree'='/x'\" git commit -m x",
    ]) {
      const runner = fakeRunner();
      await run(main, cmd, { runCheck: runner });
      assert.deepEqual(runner.calls.map((c) => c.target), ["client"], cmd);
    }
  });
});

describe("every commit invocation counts", () => {
  test("a commit in an outside repo cannot hide a real one: -C outside; commit", async () => {
    const project = makeRepo();
    const outside = sentinelRepo();
    put(project, "server/a.ts");
    put(outside, "client/a.ts");
    const cmd = `git -C ${fwd(outside)} commit --allow-empty -m x; git commit -am real`;
    const runner = fakeRunner();
    const r = await run(project, cmd, { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(runner.calls.map((c) => [c.target, same(c.cwd, project)]), [["server", true]]);
    const blocked = await run(project, cmd, { runCheck: fakeRunner({ server: red() }) });
    assert.equal(blocked.exitCode, 2, "a red project check blocks the whole call");
    assert.equal(existsSync(join(outside, "SENTINEL")), false);
  });

  test("the order does not matter: commit; -C outside", async () => {
    const project = makeRepo();
    const outside = makeRepo();
    put(project, "server/a.ts");
    const r = await run(project, `git commit -am real && git -C ${fwd(outside)} commit -m x`, { runCheck: fakeRunner({ server: red() }) });
    assert.equal(r.exitCode, 2);
  });

  test("two in-project trees are both checked, each in its own directory", async () => {
    const project = makeRepo();
    const wt = addWorktree(project);
    put(project, "server/a.ts");
    put(wt, "client/a.ts");
    const runner = fakeRunner();
    const r = await run(project, `git -C ${fwd(wt)} commit -m a; git commit -m b`, { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(
      runner.calls.map((c) => [c.target, same(c.cwd, wt) ? "wt" : same(c.cwd, project) ? "project" : "?"]),
      [["client", "wt"], ["server", "project"]],
    );
    assert.deepEqual(r.logLine.targets, ["server", "client"]);
    const red2 = await run(project, `git -C ${fwd(wt)} commit -m a; git commit -m b`, { runCheck: fakeRunner({ client: red() }) });
    assert.equal(red2.exitCode, 2);
    assert.match(red2.stderr, /target "client" failed .*\(in /);
  });

  test("the same tree named several ways is checked once", async () => {
    const project = makeRepo();
    put(project, "server/a.ts");
    const runner = fakeRunner();
    const gitSpy = recordingGit();
    const r = await run(project, `git commit -m a && git -C . commit -m b && cd . && git commit -m c`, { runCheck: runner, git: gitSpy });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(runner.calls.map((c) => c.target), ["server"]);
    assert.equal(gitSpy.calls.filter((c) => c.args.includes("diff")).length, 2, "one --cached and one plain diff for the one tree");
  });

  test("allowed only when every commit is out of scope", async () => {
    const project = makeRepo();
    const a = makeRepo();
    const b = makeRepo();
    put(a, "server/a.ts");
    const runner = fakeRunner({ server: red() });
    const r = await run(project, `git -C ${fwd(a)} commit -m x; git -C ${fwd(b)} commit -m y`, { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.equal(r.logLine.reason, "outside_project");
    assert.equal(runner.calls.length, 0);
  });

  test("bash -c and $( ) invocations count as commits of their own", async () => {
    const project = makeRepo();
    const outside = makeRepo();
    put(project, "server/a.ts");
    const r = await run(project, `git -C ${fwd(outside)} commit -m x; bash -c 'git commit -m real'`, { runCheck: fakeRunner({ server: red() }) });
    assert.equal(r.exitCode, 2);
  });
});

/* ------------------------------------------ AC-27 / AC-28 / AC-29 / AC-30 / AC-31 */

describe("targets and checks", () => {
  test("empty target set -> allow, targets [], no_targets (AC-27)", async () => {
    const repo = makeRepo();
    put(repo, "docs/a.md");
    put(repo, "evals/b.ts");
    const runner = fakeRunner();
    const r = await run(repo, "git commit -m x", { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr, "");
    assert.equal(runner.calls.length, 0);
    assert.deepEqual([r.logLine.result, r.logLine.reason, r.logLine.targets], ["allow", "no_targets", []]);
    const amend = await run(makeRepo(), "git commit --amend --no-edit", { runCheck: runner });
    assert.equal(amend.logLine.reason, "no_targets");
  });

  test("fixed order and exact invocations (AC-28)", async () => {
    const repo = makeRepo();
    for (const p of ["client/a.ts", "server/a.ts", "mcp/a.ts", "reviewer-core/a.ts", "specs/a.md", ".claude/hooks/a.mjs", "docs/a.md"]) put(repo, p);
    const runner = fakeRunner();
    const r = await run(repo, "git commit -m x", { runCheck: runner });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(
      runner.calls.map((c) => [c.file, c.args]),
      [
        [process.execPath, ["--test", ".claude/hooks/*.test.mjs"]],
        [process.execPath, ["scripts/verify.mjs", "specs"]],
        [process.execPath, ["scripts/verify.mjs", "reviewer-core"]],
        [process.execPath, ["scripts/verify.mjs", "mcp"]],
        [process.execPath, ["scripts/verify.mjs", "server"]],
        [process.execPath, ["scripts/verify.mjs", "client"]],
      ],
    );
    for (const c of runner.calls) {
      assert.ok(same(c.cwd, repo));
      assert.equal(c.args.includes("--it"), false);
      assert.equal(c.args.some((a) => /a\.(ts|md|mjs)$/.test(a)), false, "no touched path on a command line");
    }
  });

  test("all green -> exit 0 with empty output (AC-29)", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const r = await run(repo, "git commit -m x", { runCheck: fakeRunner() });
    assert.equal(r.exitCode, 0);
    assert.equal(r.stderr, "");
    assert.equal(r.logLine.result, "allow");
    assert.deepEqual(r.logLine.targets, ["server"]);
    assert.equal(r.logLine.reason, undefined);
  });

  test("red check -> exit 2 with target+step, a <=40-line tail and the closing line (AC-30)", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const output = ["FAIL unit tests (3.2s) — pnpm vitest run", ...Array.from({ length: 100 }, (_, i) => `line ${i}`)].join("\n");
    const r = await run(repo, "git commit -m x", { runCheck: fakeRunner({ server: red(output) }) });
    assert.equal(r.exitCode, 2);
    const lines = r.stderr.trimEnd().split("\n");
    assert.match(lines[0], /target "server" failed at step "unit tests"/);
    assert.equal(lines.at(-1), CLOSING_LINE);
    assert.equal(CLOSING_LINE, "commit blocked by commit-test-gate: fix the failing checks, then commit again");
    assert.deepEqual(lines.slice(1, -1), Array.from({ length: 40 }, (_, i) => `line ${60 + i}`));
    assert.deepEqual(r.logLine.failing, { target: "server", step: "unit tests" });
    assert.equal(r.logLine.result, "block");
  });

  test("the hooks target reports step 'node --test'", async () => {
    const repo = makeRepo();
    put(repo, ".claude/hooks/a.mjs");
    const r = await run(repo, "git commit -m x", { runCheck: fakeRunner({ hooks: red("not ok 1") }) });
    assert.equal(r.exitCode, 2);
    assert.deepEqual(r.logLine.failing, { target: "hooks", step: "node --test" });
  });

  test("a red check stops the remaining targets (AC-31)", async () => {
    const repo = makeRepo();
    for (const p of ["specs/a.md", "server/a.ts", "client/a.ts"]) put(repo, p);
    const runner = fakeRunner({ specs: red() });
    const r = await run(repo, "git commit -m x", { runCheck: runner });
    assert.equal(r.exitCode, 2);
    assert.deepEqual(runner.calls.map((c) => c.target), ["specs"]);
  });
});

/* --------------------------------------------------------- AC-32 internal errors */

describe("internal errors fail closed (AC-32)", () => {
  const named = (r, reason) => {
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, new RegExp(`internal error \\(${reason}\\)`));
    assert.equal(r.logLine.reason, "internal_error");
    assert.equal(r.logLine.result, "block");
  };

  test("stdin that is not JSON", async () => {
    for (const bad of ["not json", "", "[]", "null", "42"]) {
      const r = await runGate(bad, { runCheck: fakeRunner() });
      named(r, "invalid_stdin");
      assert.equal(r.logLine.tool, null);
      assert.equal(r.logLine.command, "");
    }
  });

  test("spawned gate: empty and garbage stdin exit 2 (never 1) and log the block", () => {
    for (const input of ["", "{nope"]) {
      const project = tmp();
      const r = spawnGate(input, { projectDir: project });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /invalid_stdin/);
      const line = JSON.parse(readFileSync(join(project, ".devdigest", "cache", "commit-gate.jsonl"), "utf8").trim());
      assert.deepEqual([line.result, line.reason, line.tool, line.command], ["block", "internal_error", null, ""]);
    }
  });

  test("a missing tool_input.command", async () => {
    named(await runGate(JSON.stringify({ tool_name: "Bash", tool_input: {} })), "missing_command");
    named(await runGate(JSON.stringify({ tool_name: "Bash" })), "missing_command");
  });

  test("git not runnable", () => {
    const repo = makeRepo();
    const env = { ...cleanEnv() };
    for (const k of Object.keys(env)) if (/^path$/i.test(k)) delete env[k];
    env.PATH = "";
    env.CLAUDE_PROJECT_DIR = repo; // the audit log goes to a temp dir, never to the real checkout
    const r = spawnSync(process.execPath, [GATE], { input: payload("git commit -m x", { cwd: repo }), encoding: "utf8", env, cwd: repo, timeout: 30_000 });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /internal error \(git_unavailable\)/);
  });

  test("a failing git query (not a work tree)", async () => {
    const plain = tmp();
    named(await run(plain, "git commit -m x", { runCheck: fakeRunner() }), "git_query_failed");
    named(await run(join(plain, "does-not-exist"), "git commit -m x", { runCheck: fakeRunner() }), "git_query_failed");
  });

  test("a check that cannot be spawned", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const runCheck = (_file, _args, opts) => spawnCheck(join(repo, "no-such-binary"), [], opts);
    named(await run(repo, "git commit -m x", { runCheck }), "spawn_failed");
  });

  test("an unexpected throw is still exit 2, never an unhandled rejection", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const runCheck = async () => {
      throw new TypeError("kaboom");
    };
    named(await run(repo, "git commit -m x", { runCheck }), "unexpected");
    assert.ok(new GateError("x", "y") instanceof Error);
  });
});

/* ----------------------------------------------------------------- AC-33 deadline */

describe("deadline (AC-33)", () => {
  test("a sleeping check tree is killed and the gate exits 2", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const dir = tmp();
    const fake = join(dir, "sleeper.mjs");
    const pidFile = join(dir, "grandchild.pid");
    writeFileSync(
      fake,
      [
        `import { spawn } from "node:child_process";`,
        `import { writeFileSync } from "node:fs";`,
        `const g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });`,
        `writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));`,
        `setInterval(() => {}, 1000);`,
      ].join("\n"),
    );
    const runCheck = (_file, _args, opts) => spawnCheck(process.execPath, [fake], opts);
    const t0 = Date.now();
    const r = await run(repo, "git commit -m x", { runCheck, deadlineMs: 2000 });
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /deadline/);
    assert.equal(r.logLine.reason, "deadline");
    assert.ok(Date.now() - t0 < 15_000);
    assert.ok(existsSync(pidFile), "the fake check started its grandchild");
    const pid = Number(readFileSync(pidFile, "utf8"));
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 50 && alive(); i++) await new Promise((res) => setTimeout(res, 100));
    assert.equal(alive(), false, "no check process survives");
  });

  test("the deadline is shared across checks", async () => {
    const repo = makeRepo();
    put(repo, "mcp/a.ts");
    put(repo, "server/a.ts");
    put(repo, "client/a.ts");
    let clock = 0;
    const calls = [];
    const runCheck = async (_f, args) => {
      calls.push(args);
      clock += 600; // each check "takes" 600 ms
      return { code: 0, output: "", timedOut: false };
    };
    const r = await run(repo, "git commit -m x", { runCheck, deadlineMs: 1000, now: () => clock });
    assert.equal(r.exitCode, 2);
    assert.equal(r.logLine.reason, "deadline");
    assert.equal(calls.length, 2, "the third target never starts once the shared budget is spent");
  });
});

/* ----------------------------------------------------------- AC-34 out of scope */

test("a work tree without scripts/verify.mjs -> allow, out_of_scope (AC-34)", async () => {
  const repo = makeRepo({ verify: false });
  put(repo, "server/a.ts");
  const runner = fakeRunner();
  const r = await run(repo, "git commit -m x", { runCheck: runner });
  assert.equal(r.exitCode, 0);
  assert.equal(runner.calls.length, 0);
  assert.deepEqual([r.logLine.result, r.logLine.reason, r.logLine.targets], ["allow", "out_of_scope", []]);
});

/* ------------------------------------------------------------ AC-35 / AC-36 log */

describe("audit log (AC-35, AC-36, NFR-5)", () => {
  test("one valid line per decision, with the contract's fields", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const logPath = join(tmp(), "nested", "commit-gate.jsonl");
    await runGateAndLog(payload("git commit -m ok", { cwd: repo, agent_type: "implementer" }), { runCheck: fakeRunner(), logPath });
    await runGateAndLog(payload("git commit -m bad", { cwd: repo }), { runCheck: fakeRunner({ server: red() }), logPath });
    await runGateAndLog(payload("ls", { cwd: repo }), { runCheck: fakeRunner(), logPath });
    const lines = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 2, "a non-commit writes nothing");
    const [allow, blocked] = lines;
    for (const l of lines) {
      assert.match(l.ts, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
      assert.equal(l.tool, "Bash");
      assert.equal(typeof l.duration_ms, "number");
      assert.equal(l.session_id, "s1");
      assert.ok(Array.isArray(l.targets));
    }
    assert.deepEqual([allow.result, allow.agent_type, allow.command, allow.reason, allow.failing], ["allow", "implementer", "git commit -m ok", undefined, undefined]);
    assert.deepEqual([blocked.result, "agent_type" in blocked, blocked.failing], ["block", false, { target: "server", step: "typecheck" }]);
  });

  test("session_id is null when absent", async () => {
    const repo = makeRepo({ verify: false });
    const r = await runGate(JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit" }, cwd: repo }));
    assert.equal(r.logLine.session_id, null);
  });

  test("an unwritable log path keeps the decision (AC-36)", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const blocker = join(tmp(), "file-not-dir");
    writeFileSync(blocker, "x");
    const logPath = join(blocker, "sub", "commit-gate.jsonl");
    assert.equal(appendAuditLog(logPath, { a: 1 }), false);
    const green = await runGateAndLog(payload("git commit -m x", { cwd: repo }), { runCheck: fakeRunner(), logPath });
    assert.equal(green.exitCode, 0);
    const bad = await runGateAndLog(payload("git commit -m x", { cwd: repo }), { runCheck: fakeRunner({ server: red() }), logPath });
    assert.equal(bad.exitCode, 2);
  });

  test("spawned gate: unwritable CLAUDE_PROJECT_DIR log keeps exit 0 and 2 (AC-36)", () => {
    const repo = makeRepo();
    put(repo, "docs/a.md");
    const project = repo; // the gated tree is the project, so this is a real gated decision
    writeFileSync(join(project, ".devdigest"), "i am a file");
    const allow = spawnGate(payload("git commit -m x", { cwd: repo }), { projectDir: project });
    assert.equal(allow.status, 0);
    assert.equal(allow.stderr, "");
    const block = spawnGate(payload("git commit --no-verify", { cwd: repo }), { projectDir: project });
    assert.equal(block.status, 2);
    assert.match(block.stderr, /cannot be bypassed from the agent/);
  });

  test("spawned gate writes its line under CLAUDE_PROJECT_DIR (AC-35)", () => {
    const repo = makeRepo();
    put(repo, "docs/a.md");
    const project = repo;
    const r = spawnGate(payload("OPENROUTER_API_KEY=sk-or-x git commit -m y", { cwd: repo }), { projectDir: project });
    assert.equal(r.status, 0);
    const text = readFileSync(join(project, ".devdigest", "cache", "commit-gate.jsonl"), "utf8");
    assert.equal(text.trim().split("\n").length, 1);
    const line = JSON.parse(text);
    assert.equal(line.command, "OPENROUTER_API_KEY=*** git commit -m y");
    assert.equal(text.includes("sk-or-x"), false);
    assert.equal(line.reason, "no_targets");
  });

  test("the logged command is redacted, then cut to 500 chars (NFR-5)", async () => {
    const repo = makeRepo({ verify: false });
    const logPath = join(tmp(), "log.jsonl");
    await runGateAndLog(payload("OPENROUTER_API_KEY=sk-or-x git commit -m y", { cwd: repo }), { logPath });
    await runGateAndLog(payload(`git commit -m ${"z".repeat(2000)}`, { cwd: repo }), { logPath });
    const [a, b] = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(a.command, "OPENROUTER_API_KEY=*** git commit -m y");
    assert.equal(b.command.length, 500);
  });
});

/* --------------------------------------------------------------- NFR-2/3/4 */

describe("hardening", () => {
  test("the command text is never executed (NFR-3)", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const cwdBefore = process.cwd();
    const cmd = `git commit -m x $(node -e "require('fs').writeFileSync('PWNED','')")`;
    const r = await run(repo, cmd, { runCheck: fakeRunner() });
    assert.equal(r.exitCode, 0);
    const spawned = spawnGate(payload(cmd, { cwd: repo }), { projectDir: repo });
    assert.equal(spawned.status, 0);
    for (const dir of [repo, cwdBefore, process.cwd(), fileURLToPath(new URL(".", import.meta.url))]) {
      assert.equal(existsSync(join(dir, "PWNED")), false, `PWNED in ${dir}`);
    }
  });

  test("no env var, flag or token turns the gate off (NFR-4)", async () => {
    const repo = makeRepo();
    put(repo, "server/a.ts");
    const saved = { a: process.env.SKIP_COMMIT_GATE, b: process.env.COMMIT_GATE };
    process.env.SKIP_COMMIT_GATE = "1";
    process.env.COMMIT_GATE = "off";
    try {
      for (const cmd of ["SKIP_COMMIT_GATE=1 COMMIT_GATE=off git commit -m x", "git commit -m x"]) {
        const r = await run(repo, cmd, { runCheck: fakeRunner({ server: red() }) });
        assert.equal(r.exitCode, 2, cmd);
      }
    } finally {
      for (const [k, v] of [["SKIP_COMMIT_GATE", saved.a], ["COMMIT_GATE", saved.b]]) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  test("only node: modules and the sibling parser are imported (NFR-2)", () => {
    for (const file of [GATE, PARSER, fileURLToPath(import.meta.url), fileURLToPath(new URL("./commit-gate-parse.test.mjs", import.meta.url))]) {
      const src = readFileSync(file, "utf8");
      const specs = [...src.matchAll(/(?:^|\s)import\s[^"'`;]*?from\s*["']([^"']+)["']/g), ...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
      for (const s of specs) assert.match(s, /^(node:|\.\/commit-)/, `${file}: ${s}`);
    }
    const gate = readFileSync(GATE, "utf8");
    assert.equal(/shell:\s*true/.test(gate), false);
    assert.equal(/process\.env\.(?!CLAUDE_PROJECT_DIR)/.test(gate.replace(/\.\.\.process\.env/g, "")), false);
  });
});

/* ------------------------------------------------------------- audit-log hygiene */

test("the logged line of a gated commit holds no secret in any assignment form (NFR-5)", async () => {
  const repo = makeRepo({ verify: false });
  const logPath = join(tmp(), "log.jsonl");
  const secret = "sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE";
  for (const cmd of [`$env:OPENROUTER_API_KEY = "${secret}"; git commit -m x`, `export KEY=${secret} && git commit -m x`, `git -c http.extraheader=${secret} commit -m x`]) {
    await runGateAndLog(payload(cmd, { cwd: repo, tool_name: "PowerShell" }), { logPath, projectDir: repo });
  }
  const text = readFileSync(logPath, "utf8");
  assert.equal(text.trim().split("\n").length, 3);
  assert.equal(text.includes("FAKEFAKE"), false);
});

// Keep last: every test above must have kept the real checkout's audit log out of it.
test("guard: no test in this file wrote to the real .devdigest/cache/commit-gate.jsonl", () => {
  assert.equal(realLogSize(), REAL_LOG_BEFORE, `${REAL_LOG} changed while the suite ran`);
});
