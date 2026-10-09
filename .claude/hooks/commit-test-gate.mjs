#!/usr/bin/env node
/**
 * PreToolUse hook: commit test gate (SPEC-06 AC-17..AC-36).
 *
 * Fires for the Bash and PowerShell tools. When the command contains a `git commit`
 * invocation, it runs the checks of the packages the work tree touches and blocks the
 * commit (exit 2) when one is red. Fail-closed: any internal error or deadline overrun
 * is exit 2; exit 1 never happens. A command with no commit exits 0 before any I/O.
 *
 * The command text is parsed (./commit-gate-parse.mjs), never executed. Touched paths only
 * pick a target by prefix; they never reach a command line. The only environment variable
 * read is CLAUDE_PROJECT_DIR: it places the audit log and is the trust root. Every git call
 * runs with cwd = that directory and selects the tree with `-C`; nothing is run in a tree the
 * command text chose unless it is the project or one of its worktrees.
 *
 * Bypass: commit from your own terminal, or start Claude with
 * `--settings '{"disableAllHooks": true}'`. See docs/harness/commit-test-gate.md.
 */
import { execFile, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const TARGET_ORDER = ["hooks", "specs", "reviewer-core", "mcp", "server", "client"];
export const DEADLINE_MS = 540_000;
export const CLOSING_LINE = "commit blocked by commit-test-gate: fix the failing checks, then commit again";
const PREFIXES = [
  ["server/", "server"],
  ["client/", "client"],
  ["reviewer-core/", "reviewer-core"],
  ["mcp/", "mcp"],
  ["specs/", "specs"],
  [".claude/hooks/", "hooks"],
];
const TAIL_LINES = 40;
const LOG_COMMAND_MAX = 500;
const LINE_CAP = 1000;

/** An internal error with a stable, named reason (AC-32). */
export class GateError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

/* ------------------------------------------------------------------ helpers */

/** Path prefix to target (AC-26). Returns the targets in the fixed order. */
export function mapTargets(paths) {
  const hit = new Set();
  for (const p of paths) {
    const norm = String(p).replaceAll("\\", "/").replace(/^\.\//, "");
    for (const [prefix, target] of PREFIXES) if (norm.startsWith(prefix)) hit.add(target);
  }
  return TARGET_ORDER.filter((t) => hit.has(t));
}

/** Parse `git diff --name-status -z -M` output. Renames contribute both paths (AC-25). */
export function parseNameStatus(out) {
  const tok = out.split("\0");
  const paths = [];
  for (let i = 0; i < tok.length; i++) {
    const status = tok[i];
    if (!status) continue;
    const two = status[0] === "R" || status[0] === "C";
    if (tok[i + 1]) paths.push(tok[i + 1]);
    if (two && tok[i + 2]) paths.push(tok[i + 2]);
    i += two ? 2 : 1;
  }
  return paths;
}

const NUL_LIST = (out) => out.split("\0").filter(Boolean);

/* Shapes of well-known secrets, masked wherever they appear (before the 500-char cut). */
const KEY_SHAPES = [
  /(?<![A-Za-z0-9])sk-(?:or-v1|ant|proj)-[A-Za-z0-9_-]+/g,
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g,
  /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{16,}/g,
  /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{16,}/g,
  /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])xox[bap]-[A-Za-z0-9-]{6,}/g,
];
const BEARER = /\b(Bearer)([ \t]+)[A-Za-z0-9._~+/=-]+/gi;
// `Basic <base64>`: the token must look like base64 (a digit, `+`, `/` or `=` in it), so that
// "basic usage" in a commit message survives.
const BASIC = /\b(Basic)([ \t]+)(?=[A-Za-z0-9+/]*[0-9+/=])[A-Za-z0-9+/]{6,}={0,2}/gi;
const URL_USERINFO = /(:\/\/)[^\s/:@'"]+:[^\s/@'"]+@/g;
// `git -c key=value`: the value of any config override may be a credential (http.extraheader,
// also URL-scoped keys such as http.https://github.com/.extraheader). The whole override may be quoted.
const GIT_C_QUOTED = /(\s-c[ \t]+)(["'])([^\s="']*\.[^\s="']*)=((?:(?!\2).)*)\2/g;
const GIT_C_OVERRIDE = /(\s-c[ \t]+[^\s="']*\.[^\s="']*=)("(?:[^"\\]|\\.)*"|'[^']*'|\S*)/g;

const VALUE = String.raw`"(?:[^"\\]|\\.)*"|'[^']*'|(?:\\.|[^\s;&|()])*`;
// NAME=value, $NAME=value, $env:NAME=value, and the cmd form "NAME=value"
const ASSIGN = new RegExp(String.raw`(["']?)((?:\$(?:env:)?)?[A-Za-z_][A-Za-z0-9_]*)=(${VALUE})`, "y");
// PowerShell: $env:NAME = "value" (spaces around `=`; quoted values only, so `$x = git commit` survives)
const PS_ASSIGN = /(\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)("(?:[^"\\]|\\.)*"|'[^']*')/y;
const DECLARE = /(?:export|declare|typeset|local|readonly|set)(?=[ \t])(?:[ \t]+-{1,2}[A-Za-z]+)*[ \t]+/y;
// `env [opts] VAR=value cmd` and `sudo [opts] VAR=value cmd`: assignments may follow the wrapper.
const WRAPPER = /(?:env|sudo)(?=[ \t])/y;
const WRAP_OPT = /-{1,2}[A-Za-z][\w-]*(?:=\S*)?/y;
const WRAP_VALUE_OPTS = new Set([
  "-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t", "-S",
  "--user", "--group", "--host", "--prompt", "--chdir", "--unset", "--split-string", "--role", "--type", "--close-from",
]);
const WORD = /\S+/y;
const GAP = /[ \t]+/y;

/** Mask secrets in a command line, then cut to 500 chars (NFR-5). */
export function redactCommand(cmd) {
  let out = "";
  let i = 0;
  let atStart = true;
  const take = (re) => {
    re.lastIndex = i;
    const m = re.exec(cmd);
    if (m) i = re.lastIndex;
    return m;
  };
  const gap = () => {
    const g = take(GAP);
    if (g) out += g[0];
    return g !== null;
  };
  while (i < cmd.length) {
    if (atStart) {
      const ws = /^\s*/.exec(cmd.slice(i))[0];
      out += ws;
      i += ws.length;
      // prefix items, in any order: declaring keyword, env / sudo with options, assignments
      for (;;) {
        let m = take(DECLARE);
        if (m) {
          out += m[0];
          continue;
        }
        m = take(WRAPPER);
        if (m) {
          out += m[0];
          gap();
          for (let o = take(WRAP_OPT); o; o = take(WRAP_OPT)) {
            out += o[0];
            gap();
            if (WRAP_VALUE_OPTS.has(o[0]) && (m = take(WORD))) {
              out += m[0];
              gap();
            }
          }
          continue;
        }
        m = take(ASSIGN);
        if (m) {
          out += `${m[1]}${m[2]}=***${m[1] && m[3].endsWith(m[1]) ? m[1] : ""}`;
          gap();
          continue;
        }
        m = take(PS_ASSIGN);
        if (m) {
          out += `${m[1]}${m[2]}***`;
          gap();
          continue;
        }
        break;
      }
      atStart = false;
      continue;
    }
    const ch = cmd[i];
    out += ch;
    i++;
    if (";&|(\n`".includes(ch)) atStart = true;
  }
  out = out
    .replace(GIT_C_QUOTED, (_m, pre, q, key) => `${pre}${q}${key}=***${q}`)
    .replace(GIT_C_OVERRIDE, "$1***")
    .replace(URL_USERINFO, "$1***@")
    .replace(BEARER, "$1$2***")
    .replace(BASIC, "$1$2***");
  for (const re of KEY_SHAPES) out = out.replace(re, "***");
  return out.slice(0, LOG_COMMAND_MAX);
}

function toNativePath(p) {
  // Git Bash writes /d/Work/x for D:\Work\x
  if (process.platform === "win32") {
    const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
    if (m) return `${m[1].toUpperCase()}:${m[2] ?? "/"}`;
  }
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(1));
  return p;
}

/**
 * Resolve the directory a commit invocation names: stdin cwd, then `cd` segments, then `-C`
 * (AC-25). It is only ever passed to git as a `-C` argument; nothing runs with it as cwd.
 */
export function resolveStartDir(cwd, inv) {
  let dir = resolve(cwd);
  for (const step of [...inv.cdDirs, ...inv.gitC]) dir = resolve(dir, toNativePath(step));
  return dir;
}

/** Comparison key for a work-tree path: real path, case-folded where the file system is. */
function treeKey(p) {
  let r;
  try {
    r = realpathSync.native(p);
  } catch {
    r = resolve(p);
  }
  return process.platform === "win32" || process.platform === "darwin" ? r.toLowerCase() : r;
}

/**
 * The trees the gate may look into and run checks in: the project directory and every
 * worktree of its repository. Asked of git with the trusted cwd, never with a path from the
 * command text.
 */
async function trustedTrees(git, projectDir) {
  const keys = new Map([[treeKey(projectDir), projectDir]]); // key -> path
  try {
    const out = await git(["-C", projectDir, "worktree", "list", "--porcelain"], projectDir);
    for (const line of out.split(/\r?\n/)) if (line.startsWith("worktree ")) keys.set(treeKey(line.slice("worktree ".length)), resolve(line.slice("worktree ".length)));
  } catch (err) {
    if (err instanceof GateError && err.reason === "git_unavailable") throw err;
    // the project directory is not a repository: only the directory itself is trusted
  }
  return keys;
}

/** Is `dir` (a path, not yet a work-tree top) the project, one of its worktrees, or inside one? */
function insideTrusted(trusted, dir) {
  const k = treeKey(dir);
  for (const t of trusted.keys()) {
    if (k === t || k.startsWith(t.endsWith(sep) ? t : t + sep)) return true;
  }
  return false;
}

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * A `cd` to something that is not a directory fails in the shell, which then stays where it
 * was: the commit lands in the session's tree, not in the one the text names.
 */
function cdChainBroken(base, cdDirs) {
  let dir = resolve(base);
  for (const step of cdDirs) {
    dir = resolve(dir, toNativePath(step));
    if (!isDir(dir)) return true;
  }
  return false;
}

// A tree under inspection must not get to run its own fsmonitor hook.
const NO_FSMONITOR = ["-c", "core.fsmonitor=false"];

function defaultGit(args, cwd) {
  return new Promise((res, rej) => {
    execFile("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (!err) return res(stdout);
      if (err.code === "ENOENT" && !existsSync(cwd)) return rej(new GateError("git_query_failed", `directory does not exist: ${cwd}`));
      if (err.code === "ENOENT") return rej(new GateError("git_unavailable", "git is not runnable (ENOENT)"));
      const detail = String(stderr || err.message).trim().split("\n")[0];
      rej(new GateError("git_query_failed", `git ${args.join(" ")} failed: ${detail}`));
    });
  });
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

function tailOf(output) {
  const lines = stripAnsi(output).replace(/\r/g, "").split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines
    .slice(-TAIL_LINES)
    .map((l) => (l.length > LINE_CAP ? `${l.slice(0, LINE_CAP)}…` : l))
    .join("\n");
}

function failingStep(target, output) {
  if (target === "hooks") return "node --test";
  const m = /^FAIL (.+?) \(\d/m.exec(stripAnsi(output));
  return m ? m[1] : "verify";
}

function argvFor(target) {
  return target === "hooks" ? ["--test", ".claude/hooks/*.test.mjs"] : ["scripts/verify.mjs", target];
}

/* -------------------------------------------------------------- check runner */

function killTree(child) {
  return new Promise((done) => {
    try {
      if (process.platform === "win32") {
        execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => done());
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
        done();
      }
    } catch {
      done();
    }
  });
}

/**
 * Run one check as `file args…` (no shell) and collect its output. On timeout the whole
 * process tree is killed (AC-33). Resolves `{ code, output, timedOut }`; rejects with a
 * GateError("spawn_failed") when the process cannot be started (AC-32).
 */
export function spawnCheck(file, args, { cwd, timeoutMs }) {
  return new Promise((res, rej) => {
    let child;
    // A nested `node --test` must run as a runner, not as a worker of the caller's run.
    const { NODE_TEST_CONTEXT: _ctx, ...childEnv } = process.env;
    try {
      child = spawn(file, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
        env: { ...childEnv, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
      });
    } catch (e) {
      return rej(new GateError("spawn_failed", `cannot spawn ${file}: ${e.message}`));
    }
    let output = "";
    const MAX = 4 * 1024 * 1024;
    const onData = (d) => {
      output += d.toString("utf8");
      if (output.length > MAX) output = output.slice(-MAX);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    let settled = false;
    let timedOut = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res({ output, ...v });
    };
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rej(new GateError("spawn_failed", `cannot spawn ${file}: ${e.message}`));
    });
    child.on("close", (code) => settle({ code: code ?? 1, timedOut }));
    const timer = setTimeout(async () => {
      timedOut = true;
      await killTree(child);
      child.stdout.destroy();
      child.stderr.destroy();
      settle({ code: 1, timedOut: true });
    }, Math.max(1, timeoutMs));
  });
}

/* ---------------------------------------------------------------------- core */

/**
 * @param {string} input  raw stdin text
 * @param {object} [deps] { git(args, cwd), runCheck(file, args, {cwd, timeoutMs}), deadlineMs, now(), projectDir }
 * @returns {Promise<{exitCode: number, stderr: string, logLine: object | null}>}
 */
export async function runGate(input, deps = {}) {
  const git = deps.git ?? defaultGit;
  const runCheck = deps.runCheck ?? spawnCheck;
  const deadlineMs = deps.deadlineMs ?? DEADLINE_MS;
  const now = deps.now ?? Date.now;
  const t0 = now();

  let tool = null;
  let command = "";
  let payload = {};

  const logLine = (result, extra = {}) => ({
    ts: new Date().toISOString(),
    session_id: typeof payload.session_id === "string" ? payload.session_id : null,
    ...(typeof payload.agent_type === "string" ? { agent_type: payload.agent_type } : {}),
    tool,
    command: redactCommand(command),
    targets: extra.targets ?? [],
    result,
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.failing ? { failing: extra.failing } : {}),
    duration_ms: now() - t0,
  });
  const block = (stderr, extra) => ({ exitCode: 2, stderr: `${stderr}\n`, logLine: logLine("block", extra) });
  const internal = (err) => {
    const reason = err instanceof GateError ? err.reason : "unexpected";
    return block(`commit blocked by commit-test-gate: internal error (${reason}): ${err?.message ?? err}`, { reason: "internal_error" });
  };

  try {
    try {
      payload = JSON.parse(input);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new Error("not an object");
    } catch {
      payload = {};
      throw new GateError("invalid_stdin", "stdin is not a JSON object");
    }
    tool = typeof payload.tool_name === "string" ? payload.tool_name : null;
    const cmd = payload.tool_input?.command;
    if (typeof cmd !== "string") throw new GateError("missing_command", "tool_input.command is missing");
    command = cmd;

    const { findCommits, bypassFlag } = await import("./commit-gate-parse.mjs");
    const commits = findCommits(command, tool);
    if (commits.length === 0) return { exitCode: 0, stderr: "", logLine: null }; // AC-18: no I/O

    const flag = commits.map((c) => bypassFlag(c.commitArgs)).find(Boolean);
    if (flag) {
      return block(
        `commit blocked by commit-test-gate: ${flag} is not allowed. The commit test gate cannot be bypassed from the agent; ` +
          "run the checks and commit without it, or ask the user to commit from their own terminal.",
        { reason: "bypass_flag" },
      );
    }

    // Trust root: every git call runs with this as cwd; the command text only ever feeds `-C`.
    const sessionCwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : null;
    const projectDir = resolve(deps.projectDir ?? (process.env.CLAUDE_PROJECT_DIR || sessionCwd || process.cwd()));
    const startBase = sessionCwd ?? projectDir; // where the shell started: relative cd / -C resolve from here

    // Every commit invocation names a tree; the work trees are the in-project ones among them.
    // A commit whose tree cannot be derived from the text (cd -, popd, a cd inside a subshell, a
    // cd that fails, an expanded cd target, --git-dir, GIT_DIR, ...) is uncertain: it gates the
    // session's own tree and EVERY tree of the project (a tree without changes has no targets).
    const trusted = await trustedTrees(git, projectDir);
    const tops = new Map(); // key -> top, deduped, first-seen order
    const seen = new Set();
    for (const c of commits) {
      // the session's own directory must exist (else: internal error); a directory the text named
      // and that does not exist is simply not a tree (cd fails -> uncertain, git -C fails -> nothing)
      const named = c.cdDirs.length + c.gitC.length > 0;
      const starts = [{ dir: resolveStartDir(startBase, c), strict: !named }];
      if (c.uncertain || cdChainBroken(startBase, c.cdDirs)) {
        starts.push({ dir: resolve(startBase), strict: true });
        for (const path of trusted.values()) if (isDir(path)) starts.push({ dir: resolve(path), strict: false });
      }
      for (const { dir: startDir, strict } of starts) {
        if (seen.has(startDir)) continue;
        seen.add(startDir);
        // not even path-wise inside the project or one of its worktrees: git is not asked about it
        if (!insideTrusted(trusted, startDir)) continue;
        if (!strict && !isDir(startDir)) continue;
        let top;
        try {
          top = resolve((await git([...NO_FSMONITOR, "-C", startDir, "rev-parse", "--show-toplevel"], projectDir)).trim());
        } catch (err) {
          // a broken sibling worktree added only for completeness cannot take a commit down
          if (strict || !(err instanceof GateError) || err.reason !== "git_query_failed") throw err;
          continue;
        }
        const key = treeKey(top);
        if (trusted.has(key) && !tops.has(key)) tops.set(key, top);
      }
    }
    if (tops.size === 0) {
      return { exitCode: 0, stderr: "", logLine: logLine("allow", { reason: "outside_project" }) };
    }

    const trees = [...tops.values()].filter((top) => existsSync(join(top, "scripts", "verify.mjs")));
    if (trees.length === 0) {
      return { exitCode: 0, stderr: "", logLine: logLine("allow", { reason: "out_of_scope" }) };
    }

    const plan = [];
    for (const top of trees) {
      const paths = [
        ...parseNameStatus(await git([...NO_FSMONITOR, "-C", top, "diff", "--cached", "--name-status", "-z", "-M"], projectDir)),
        ...parseNameStatus(await git([...NO_FSMONITOR, "-C", top, "diff", "--name-status", "-z", "-M"], projectDir)),
        ...NUL_LIST(await git([...NO_FSMONITOR, "-C", top, "ls-files", "--others", "--exclude-standard", "-z"], projectDir)),
      ];
      const treeTargets = mapTargets(paths);
      if (treeTargets.length) plan.push({ top, treeTargets });
    }
    const targets = TARGET_ORDER.filter((t) => plan.some((p) => p.treeTargets.includes(t)));
    if (targets.length === 0) {
      return { exitCode: 0, stderr: "", logLine: logLine("allow", { reason: "no_targets" }) };
    }

    const deadlineAt = t0 + deadlineMs;
    for (const { top, treeTargets } of plan) {
      for (const target of treeTargets) {
        const remaining = deadlineAt - now();
        const overrun = () =>
          block(
            `commit blocked by commit-test-gate: the ${Math.round(deadlineMs / 1000)}s deadline was exceeded while running target "${target}". ` +
              "Run that target's checks yourself and commit again.",
            { targets, reason: "deadline", failing: { target, step: target === "hooks" ? "node --test" : "verify" } },
          );
        if (remaining <= 0) return overrun();
        const r = await runCheck(process.execPath, argvFor(target), { cwd: top, timeoutMs: remaining });
        if (r.timedOut) return overrun();
        if (r.code !== 0) {
          const step = failingStep(target, r.output);
          const where = plan.length > 1 ? ` (in ${top})` : "";
          return block(`commit-test-gate: target "${target}" failed at step "${step}"${where}\n${tailOf(r.output)}\n${CLOSING_LINE}`, {
            targets,
            failing: { target, step },
          });
        }
      }
    }
    return { exitCode: 0, stderr: "", logLine: logLine("allow", { targets }) };
  } catch (err) {
    return internal(err);
  }
}

/** Append one JSON line to the audit log. A failure never changes the decision (AC-36). */
export function appendAuditLog(logPath, line) {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(line)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** runGate + audit log. `deps.logPath` places the log. */
export async function runGateAndLog(input, deps = {}) {
  const res = await runGate(input, deps);
  if (res.logLine && deps.logPath) appendAuditLog(deps.logPath, res.logLine);
  return res;
}

/* ---------------------------------------------------------------------- main */

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function exitWith(code, stderr) {
  const finish = () => process.exit(code);
  if (stderr) process.stderr.write(stderr, finish);
  else finish();
}

async function main() {
  let input = "";
  try {
    input = await readStdin();
  } catch {
    /* treated as empty stdin -> invalid_stdin */
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const logPath = join(projectDir, ".devdigest", "cache", "commit-gate.jsonl");
  const res = await runGateAndLog(input, { logPath, projectDir }); // trust root and log place agree
  exitWith(res.exitCode, res.stderr);
}

function isEntry() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)).toLowerCase() === realpathSync(resolve(process.argv[1])).toLowerCase();
  } catch {
    return false;
  }
}

if (isEntry()) {
  process.on("uncaughtException", (e) => exitWith(2, `commit blocked by commit-test-gate: internal error (unexpected): ${e?.message ?? e}\n`));
  process.on("unhandledRejection", (e) => exitWith(2, `commit blocked by commit-test-gate: internal error (unexpected): ${e?.message ?? e}\n`));
  main().catch((e) => exitWith(2, `commit blocked by commit-test-gate: internal error (unexpected): ${e?.message ?? e}\n`));
}
