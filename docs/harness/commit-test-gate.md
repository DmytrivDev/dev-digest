# Commit test gate

A `PreToolUse` hook that runs the checks of the touched packages before Claude's Bash or
PowerShell tool executes a `git commit`, and blocks the commit when one is red. Spec:
`specs/SPEC-06-harness-quality-gates.md` (part B). Code: `.claude/hooks/commit-test-gate.mjs`
(entry and gate core) and `.claude/hooks/commit-gate-parse.mjs` (pure command classifier).
Registered in `.claude/settings.json`.

## 1. Why a hook, not an eval

A rule such as "never commit with red tests" must hold on every call. A hook is deterministic:
the harness runs it, it reads the same input and gives the same verdict. An eval is
probabilistic: a model answers, a judge grades, and a case passes at a threshold (this repo
uses 0.6 to 0.8 per case), so it can pass while a practice fails. Evals are the right tool for
"does the skill still steer the model well"; they are the wrong tool for "is this commit allowed".

## 2. Modelled on

Two templates from the `upstream/Lesson-06-lab-finish` branch:

- the `PreToolUse` prompt hook on `Bash(git push*)` in `.claude/settings.json`;
- the setup snippet in `.claude/skills/pr-self-review/SKILL.md` (lines 25-40).

Read them with `MSYS_NO_PATHCONV=1 git show upstream/Lesson-06-lab-finish:<path>`.

Three differences:

| Template | This gate |
|---|---|
| a `prompt` hook: the model is asked to follow a skill and may skip it | a `command` hook: a script decides, the model cannot talk its way past it |
| fail-open: if the prompt is ignored or errors, the push proceeds | fail-closed: any internal error or deadline overrun is exit 2 |
| `git push` | `git commit` |

## 3. Detection rules

The gate parses `tool_input.command`; it never executes any part of it (NFR-3).

- **AC-18** No `git commit` invocation: exit 0, no output, no git query, no check, no log line.
- **AC-19** `git commit` (any options, `--amend` and `--dry-run` included) in any segment of a
  compound command (`&&`, `||`, `;`, `|`, `&`, newline) is one gated decision for the whole
  tool call. With several commits in one call, **every** one is resolved to its work tree and
  the call is gated on the union of the in-project trees (see "Trust boundary" below).
- **AC-20** Also inside `( )`, `$( )`, backticks, and the script string of `bash -c`,
  `sh -c`, `pwsh -c` / `-Command`, `powershell -Command` and `cmd /c`.
- **AC-21** Still recognised behind leading `VAR=value` assignments, the wrappers `env`,
  `command`, `builtin`, `exec`, `time`, `nohup`, `sudo` and the PowerShell `&`, the git global
  options `-C <path>`, `-c <k=v>`, `--git-dir=…`, `--work-tree=…`, `--no-pager`, and the spellings
  `git.exe` or a path ending in `git` / `git.exe`.
- **Wrappers and evaluators** (commit-gate-parse.mjs, `stripPrefix` and `walk`):
  - `timeout` (options, then its duration), `nice`, `stdbuf`, `doas`, `ionice` and `xargs` are
    stripped together with their value options (`timeout -s KILL 5`, `nice -n 5`, `stdbuf -o L`,
    `doas -u root`, `ionice -c 3`, `xargs -n 1 -I{}`); `env` strips its `VAR=value` arguments
    and `-u` / `-C` / `-S` value options.
  - The string argument of `eval`, `iex` and `Invoke-Expression` is parsed as a script, in both
    tools (`eval "git commit"`, `iex "git commit"`).
  - `pwsh` / `powershell` with `-EncodedCommand`, `-enc`, `-ec`, `-e` (any prefix, `-` or `/`)
    cannot be read, so the call is **treated as a commit** and gated.
  - A command head that is only known at run time (`${GIT:-git} commit`, `$g commit`,
    `& $g commit` after `$g='git'`, `$(which git) commit`) is treated as a commit **when the same
    segment also contains the word `commit`**; `${GIT:-git} status` is not.
- **AC-22** Not a commit: the text `git commit` inside a single-quoted string, inside a
  double-quoted string outside a substitution, in a heredoc or PowerShell here-string body, in a
  `#` comment, or as an argument of another command (`echo git commit`, `grep -r "git commit" .`,
  `git log --grep "git commit"`).
- **AC-23** The same rules for the PowerShell tool, with PowerShell quoting (`'…'`, `"…"`,
  `@'…'@`, `@"…"@`, the backtick escape) and the separators `;`, `&&`, `||`, `|` and newline.
- **AC-24** `--no-verify`, `-n`, or `-n` inside a clustered short group such as `-anm`: exit 2
  without running any check, with a reason saying the gate cannot be bypassed from the agent.
  Option values (`-m <msg>`, `-F <file>`) and anything after `--` are not scanned, so
  `git commit -m "-n"` is not blocked for that reason.

The work tree a commit names is resolved in this order: the hook's `cwd`, then every `cd <dir>`
earlier in the same command, then `-C <path>` (AC-25). This only *names* a tree; see below for
which trees the gate looks into.

### Trust boundary

The command text is untrusted and the gate runs before the permission prompt, so a path taken
from it must never become the place where code runs.

- **Trust root.** `CLAUDE_PROJECT_DIR`; only when that variable is missing, the payload `cwd`. When
  the hook starts without the variable, its own location (two levels above the script) is used, and
  that same directory is the trust root and the place of the audit log, so the two always agree.
- **Every git call runs with that directory as its cwd** and selects the tree with `git -C <tree>`.
  The directory a command names (`cd X`, `git -C X`) is only ever an argument. `git` is looked up
  by the OS with the trusted cwd (no absolute path is resolved; a `git` placed in the project
  directory itself is therefore trusted like the project).
- **In-project test.** A named tree is only inspected or checked when its real path equals the
  real path of the project directory or of one of the worktrees listed by
  `git -C <project> worktree list --porcelain`. This is checked before any `diff` / `ls-files`
  (which honour `core.fsmonitor` and would run a command from the tree's own config) and before
  any check is spawned. The gate's own `diff` / `ls-files` calls also pass
  `-c core.fsmonitor=false`, and so does the `rev-parse` that finds a tree's top. A start directory
  that is not even path-wise inside the project or one of its worktrees (real paths compared) is
  not asked about at all: no `rev-parse` runs there, and a directory that does not exist is simply
  out of scope.
- **Anything else is out of scope.** If no named tree is in the project, the commit is allowed,
  logged with reason `outside_project`, and nothing in that tree is executed. A nested repository
  inside the project is not the project.
- **Every commit counts.** Each `git commit` invocation in the call is resolved on its own. The
  call is gated on the union of the in-project trees, deduplicated (the same tree named three ways
  is checked once; two worktrees are checked one after the other, each in its own directory) and is
  allowed only when every commit is out of scope. `git -C <elsewhere> commit --allow-empty -m x;
  git commit -am real` therefore runs the checks of the second commit.
- **Uncertain trees.** The text sometimes cannot say where a commit lands. Such a call is marked
  *uncertain* and the gate gates, in addition to whatever the text names, the tree the session
  started in (the payload `cwd`, else the project directory) **and every tree of the project**: the
  project directory plus all worktrees from `git worktree list`. A tree with no changes has no
  targets, so the cost stays bounded; a deleted (prunable) sibling worktree is skipped. Uncertain
  means any of:
  - `cd -`, a bare `cd`, `popd` / `Pop-Location`;
  - a `cd` / `pushd` / `Set-Location` inside `( )`, `$( )`, backticks, `{ }` or a nested shell
    (`bash -c`, `eval`, ...), because its effect may not reach the commit;
  - a `cd` target that is **not an existing directory** (the path is missing or is a file): the
    `cd` fails and the shell stays in the session's tree. Checked with the file system, for every
    step of a `cd` chain, in both tools. A missing directory given only to `git -C` is different:
    git itself fails there, so it stays `outside_project`;
  - a `cd` or `git -C` target the shell would expand: an unquoted `$`, a backtick, `*`, `?`, `[`,
    `{`, or a `~user` prefix (`cd ../dev-digest$X`, `cd ../dev-dig*`);
  - `--git-dir` or `--work-tree` (the `=` form or a separate value), `-c core.worktree=…`,
    `-c core.bare=…`, and `--config-env` (both forms) whose key is `core.worktree` or `core.bare`;
  - any word mentioning `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`,
    `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n` or `GIT_CONFIG_VALUE_n` (a
    prefix, `env`, `export`, `$env:`), wherever it is in the command;
  - a commit that is hidden or cannot be parsed (`${GIT:-git} commit`, `-EncodedCommand`, a parse
    failure).

  So `(cd ../scratch); git commit -am x`, `cd /no/such/dir; git commit`, and `git --git-dir=<wt2>/.git
  --work-tree=<wt2> commit` (a second linked worktree) all run the checks of the trees that really
  have changes. The attacker-controlled `--git-dir` / `--work-tree` values are never passed to git.
  The cost is conservative gating, for example a commit message that merely mentions `GIT_DIR`
  also gates every tree.

### Non-goals (EC-10)

Commits made by other means are not detected:

- `git merge`, `rebase`, `cherry-pick`, `revert`, `am`, `commit-tree`, `stash`;
- git aliases;
- a script file the agent runs;
- `bash <<EOF … EOF`.

Two further limits of the parser, both inside the spirit of the rules above: the body of an
unquoted heredoc is skipped as text even though a shell would expand `$( )` in it, and shell
constructs outside the listed forms (shell functions, `env -S`, `find -exec`, `setsid`, `parallel`,
a command head built from a variable with no `commit` word in the segment) are not followed.

Accepted limits that are **not** handled (a determined agent can hide a commit in them):

- `Start-Process git -ArgumentList …`;
- `& ([scriptblock]::Create(…))`;
- a git alias that expands to a commit (`git -c alias.c=commit c`);
- PowerShell string concatenation that builds an environment variable name
  (`$env:('GIT_'+'DIR') = …`, `[Environment]::SetEnvironmentVariable('GIT_' + 'DIR', …)`): the name is
  not a word the gate can see.

## 4. What runs

The touched paths are the union of staged files, unstaged changes to tracked files and
untracked, non-ignored files in the target work tree; a rename contributes both paths. They
select targets by prefix only. Paths never reach a command line.

| Path prefix | Target | What is run (cwd = work-tree top) |
|---|---|---|
| `.claude/hooks/` | `hooks` | `node --test ".claude/hooks/*.test.mjs"` |
| `specs/` | `specs` | `node scripts/verify.mjs specs` |
| `reviewer-core/` | `reviewer-core` | `node scripts/verify.mjs reviewer-core` |
| `mcp/` | `mcp` | `node scripts/verify.mjs mcp` |
| `server/` | `server` | `node scripts/verify.mjs server` |
| `client/` | `client` | `node scripts/verify.mjs client` |
| any other path | no target | the commit is allowed, logged with `targets: []` and reason `no_targets` |

- **Order:** always `hooks`, `specs`, `reviewer-core`, `mcp`, `server`, `client`, one target at a
  time. The first red target stops the run (AC-31); the rest never start.
- **No `--it`:** the DB-backed lane needs Docker and is never run by the gate.
- **No file arguments:** each package runs its full unit suite.
- **Deadline:** 540 s for all checks of one commit together, under the 600 s hook timeout in
  `settings.json`. On expiry the gate kills the running check's process tree (`taskkill /T /F`
  on Windows, a process-group `SIGKILL` elsewhere), exits 2 and logs reason `deadline`.
- **A work tree with no top-level `scripts/verify.mjs`** is not a DevDigest checkout: the commit
  is allowed and logged with reason `out_of_scope`. (A tree outside the project is a different
  case: reason `outside_project`, see "Trust boundary".)
- **Red check:** exit 2, stderr holds the failing target and step, the last 40 lines of that
  check's output, and the closing line
  `commit blocked by commit-test-gate: fix the failing checks, then commit again`.
- **Green:** exit 0 with no output.
- **Internal errors** (stdin that is not JSON, a missing `tool_input.command`, git not runnable,
  a failing git query, a check that cannot be spawned, anything unexpected) are exit 2 with a
  named reason on stderr. Exit 1 never happens.

Expected runtime, measured on the development machine on 2026-10-08 (indicative: the working
tree was noisy and other agents were running):

| Target | Time |
|---|---|
| `specs` | about 1 s |
| `hooks` (183 tests, spawns git and node; re-measured 2026-10-09: 83 s) | about 85 s |
| `server` (typecheck, 1036 unit tests, arch:check) | about 26 s |

A commit touching `hooks`, `specs` and `server` therefore waits roughly 2 minutes.

> **Note on the `hooks` command.** The spec and the plan name it `node --test .claude/hooks/`.
> On Node 22.12 that does not work: a directory argument is run as a module and fails with
> `Cannot find module '…/.claude/hooks'`, before any test file is looked at. The gate passes the
> glob `.claude/hooks/*.test.mjs` instead, which Node expands itself; it runs the two `*.test.mjs`
> suites and nothing else in the folder.

## 5. The audit log

Every decision on a gated commit appends one JSON line to
`.devdigest/cache/commit-gate.jsonl` under `CLAUDE_PROJECT_DIR` (the directory is gitignored).
Non-commit commands write nothing. A failed append never changes the decision.

| Field | Type | Notes |
|---|---|---|
| `ts` | string | ISO-8601 UTC |
| `session_id` | string or null | from the hook input |
| `agent_type` | string | only inside a subagent |
| `tool` | `Bash`, `PowerShell` or null | null only when stdin was not JSON |
| `command` | string | redacted (see below), then cut to at most 500 characters |
| `targets` | string[] | the targets selected (union over the gated trees), in the fixed order |
| `result` | `allow` or `block` | |
| `reason` | string | `no_targets`, `out_of_scope`, `outside_project`, `bypass_flag`, `internal_error` or `deadline`; absent for a plain check outcome |
| `failing` | `{target, step}` | present when a check failed (or the deadline hit while it ran) |
| `duration_ms` | number | |

### Redaction of `command`

The audit log must never hold a credential. Masking runs on the whole command first and the cut
to 500 characters comes last, so a secret at the boundary does not leak a prefix. Replaced by
`***`:

- the value of every assignment at the start of a command (after `;`, `&&`, `|`, `(`, a newline):
  `VAR=value`, `$VAR=value`, `$env:VAR=value`, the PowerShell spaced form `$env:VAR = "value"`
  (quoted values; `$out = git commit` is left readable), and the declaring forms `export`,
  `declare`, `typeset`, `local`, `readonly` and cmd `set` (also `set "VAR=value"`), with their
  flags and any number of assignments, and the assignments behind `env` and `sudo` with their
  options (`env -i OPENAI_API_KEY=… git commit`, `sudo -u me TOKEN=… git commit`);
- the value of every `-c section.key=value` option (`git -c http.extraheader=…`), also when the
  whole override is quoted (`-c "http.extraheader=AUTHORIZATION: basic …"`) and for URL-scoped keys
  (`-c http.https://github.com/.extraheader=…`);
- URL credentials (`https://user:pass@host` becomes `https://***@host`) and `Bearer <token>`;
- `Basic <base64>` (a token with a digit, `+`, `/` or `=`, so "basic usage" survives);
- any token of a well-known key shape, wherever it appears: `sk-or-v1-…`, `sk-ant-…`,
  `sk-proj-…`, `sk-` followed by 16 or more key characters, `ghp_` / `gho_` / `ghu_` / `ghs_` /
  `ghr_…`, `github_pat_…`, `AKIA` plus 16 characters, `xoxb-` / `xoxa-` / `xoxp-…`.

A secret in a shape not listed (a bare password in an argument, say) is not recognised.

## 6. Bypass policy

There is no escape hatch for the agent: no environment variable, flag or command-text token
changes the decision (NFR-4), and `--no-verify` / `-n` is blocked outright.

A human can still commit:

- from their own terminal, outside Claude Code; or
- by starting Claude with `--settings '{"disableAllHooks": true}'`.

## 7. Claude Code's own fail-open limits (EC-11)

The gate fails closed only once it is running. Claude Code treats these as non-blocking, and the
gate cannot change that:

- `node` is not on `PATH`;
- the hook process dies before its handler runs (for example a syntax error in the file);
- the 600 s hook timeout is reached (the 540 s internal deadline exists to stay below it).

Also not handled:

- **EC-12:** a load flake in a server unit test blocks a valid commit (`server/INSIGHTS.md:36`).
  Re-run that test alone, then commit again.
- **EC-13:** two parallel subagents committing at once compete for CPU. There is no lock and no
  retry.
- **EC-18:** an unrelated untracked file under `client/` adds the `client` target. This is
  accepted as conservative.

## 8. NFR-1 measurement

Median of 10 runs of a non-commit payload piped into the gate, timed from process start to exit
(`node` `spawnSync`, `hrtime`), on the development machine (Windows 11, Node 22.12):

```
echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"."}' | node .claude/hooks/commit-test-gate.mjs
```

| Runs (ms) | Median |
|---|---|
| 91 92 85 72 74 81 101 89 85 72 | 85 ms (target: under 1000 ms) |

Re-measured on 2026-10-09 after the trust-boundary, every-commit, redaction and wrapper changes
(`CLAUDE_PROJECT_DIR` set to an empty temp directory).

The path does no I/O beyond reading stdin and loading the parser: no git, no file system, no log.

The test suite never writes to the real audit log: every spawned-gate test sets
`CLAUDE_PROJECT_DIR` to a temp directory, and a last test in `commit-test-gate.test.mjs` fails
when the size of the real `.devdigest/cache/commit-gate.jsonl` changed during the run.

## Caught cases

Entries are appended here as they happen, each matching a `"result":"block"` line of the audit
log.

### Case 1 — a subagent's commit into a scratch repo (real, observed, 2026-10-08)

Not staged by anyone: while the security fix round for this gate was in progress, the
`implementer` subagent (audit-log `agent_type: "implementer"`) set up throw-away git repos in
`%TEMP%` to test `core.fsmonitor` behaviour, and tried to commit in them through its Bash tool.
The live gate — already wired in `.claude/settings.json` — fired on its tool calls, which proves
the hook reaches subagents' Bash calls and that the exec form
(`"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/commit-test-gate.mjs"]`) works.

Audit log (`.devdigest/cache/commit-gate.jsonl`, values redacted by the gate itself):

| ts (UTC) | result | reason | command (truncated) |
|---|---|---|---|
| 2026-10-08T21:02:58.700Z | block | internal_error | `cd "$TEMP" && rm -rf fsm && mkdir fsm && cd fsm && git init -q && … git -c user.email…` |
| 2026-10-08T21:03:03.923Z | block | internal_error | `D=***; rm -rf $D; mkdir -p $D; git -C $D init -q; … git -C $D -c user.email=*** …` |
| 2026-10-08T21:03:07.655Z | block | internal_error | `mkdir -p /c/Users/ADMIN/AppData/Local/Temp/fsmx && cd … && git init -q && …` |
| 2026-10-08T21:03:12.329Z | block | internal_error | `cd /c/Users/ADMIN/AppData/Local/Temp/fsmx && rm -rf ./* ./.git && git init -q && …` |
| 2026-10-08T21:03:16.952Z | allow | outside_project | `cd /c/Users/ADMIN/AppData/Local/Temp/fsmx && git -c user.email=*** -c user.name=*** commit -qm i …` |

- **What the agent tried:** `git commit` inside a repo the command itself created (`$TEMP/…`, a
  shell variable the gate does not expand, or a directory that did not exist yet when the gate ran).
- **What stopped it:** the gate could not resolve that work tree (`git rev-parse` failed), and by
  design an unresolvable tree is an internal error → **exit 2, fail closed** (AC-32). The agent saw
  the stderr reason and changed its approach.
- **What changed afterwards:** this is exactly the case the security review's trust-boundary
  finding asked for. After the fix, a commit whose tree resolves OUTSIDE `CLAUDE_PROJECT_DIR`
  is allowed as `outside_project` with nothing executed in it — the last row, five seconds later,
  is the same agent's commit in the now-existing scratch repo going through cleanly. It is a
  catch of the fail-closed rule, not of red tests; Case 2 shows the red-tests path.

### Case 2 — red tests block a commit (controlled demonstration, 2026-10-08)

**Controlled demonstration, labelled as such (plan item WI1).** The orchestrator session added a
deliberately failing test, `.claude/hooks/zz-demo-red.test.mjs` (`assert.equal(1 + 1, 3)`), and
then asked its own Bash tool to commit. Nothing was staged, so even an allowed call could not
have created a commit.

Command the agent ran:

```bash
git diff --cached --quiet && echo "nothing staged" && git commit -m "WI1 demo: this commit must be blocked by the commit test gate"
```

Audit-log line:

```json
{"ts":"2026-10-08T21:13:11.381Z","session_id":"35cb8aaa-3ffa-4012-beaa-ee63b774d240","tool":"Bash","command":"git diff --cached --quiet && echo \"nothing staged\" && git commit -m \"WI1 demo: this commit must be blocked by the commit test gate\"","targets":["hooks","specs","server","client"],"result":"block","failing":{"target":"hooks","step":"node --test"},"duration_ms":51221}
```

What Claude saw as the denial reason (stderr of exit 2, excerpt):

```text
commit-test-gate: target "hooks" failed at step "node --test"
…
not ok 46 - demo: a deliberately failing check the commit gate must catch
  error: Expected values to be strictly equal:  2 !== 3
  location: '…\.claude\hooks\zz-demo-red.test.mjs:6:1'
…
# tests 131
# pass 130
# fail 1
commit blocked by commit-test-gate: fix the failing checks, then commit again
```

- The gate found the commit in a compound `&&` command, computed four touched targets, ran them
  in the fixed order and stopped at the first red one (`hooks`), without running `specs`,
  `server` or `client` (AC-28, AC-31).
- **Fix:** the demo file was deleted; `node --test ".claude/hooks/*.test.mjs"` is back to
  130/130 at the time (183/183 after the later security fix rounds), and the homework's final commit went through the same gate.
