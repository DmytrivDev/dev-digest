import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bypassFlag, findCommits } from "./commit-gate-parse.mjs";

const isCommit = (cmd, tool = "Bash") => findCommits(cmd, tool).length > 0;

function table(name, rows, tool, expected) {
  test(name, () => {
    for (const cmd of rows) {
      assert.equal(isCommit(cmd, tool), expected, `${tool}: ${JSON.stringify(cmd)}`);
    }
  });
}

/* AC-18 */
table("not a commit: plain commands (AC-18)", ["ls", "git status", "git log", "pnpm test", "", "   ", "git", "git commit-tree abc"], "Bash", false);

/* AC-19 */
table(
  "commit in any segment (AC-19)",
  [
    "git commit -m a",
    "git add . && git commit -m a",
    "false || git commit -m a",
    "echo x; git commit -m a",
    "echo x | git commit -F -",
    "git commit -m a &",
    "echo x\ngit commit -m a",
    "git commit --amend",
    "git commit --dry-run",
  ],
  "Bash",
  true,
);

test("two commits in one call are both reported, in order (AC-19)", () => {
  const r = findCommits("git commit -m a && git commit -m b", "Bash");
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].commitArgs, ["-m", "a"]);
  assert.deepEqual(r[1].commitArgs, ["-m", "b"]);
});

/* AC-20 */
table(
  "nesting forms are commits (AC-20)",
  [
    "(git commit -m a)",
    "( cd x && git commit -m a )",
    "echo $(git commit -m a)",
    'echo "$(git commit -m a)"',
    "echo `git commit -m a`",
    'echo "`git commit -m a`"',
    "x=$(git commit -m a)",
    "bash -c 'git commit -m a'",
    'sh -c "git commit -m a"',
    "bash -lc 'git add . && git commit -m a'",
    "pwsh -c 'git commit -m a'",
    'pwsh -Command "git commit -m a"',
    'powershell -Command "git commit -m a"',
    "powershell.exe -NoProfile -Command git commit -m a",
    'cmd /c "git commit -m a"',
    "cmd.exe /c git commit -m a",
    "bash -c \"sh -c 'git commit -m a'\"",
    "diff <(git commit -m a) x",
  ],
  "Bash",
  true,
);

/* AC-21 */
table(
  "prefix forms are commits (AC-21)",
  [
    "FOO=1 git commit -m a",
    "A=1 B='x y' git commit -m a",
    "env git commit -m a",
    "env -i FOO=1 git commit -m a",
    "env -u FOO git commit",
    "command git commit",
    "builtin git commit",
    "exec git commit",
    "time git commit",
    "nohup git commit",
    "sudo git commit",
    "sudo -u me -E git commit",
    "sudo env FOO=1 git commit",
    "git -C ../x commit",
    "git -c user.name=a commit",
    "git --git-dir=.git --work-tree=. commit",
    "git --no-pager commit",
    "git --git-dir .git commit",
    "git.exe commit -m a",
    "/usr/bin/git commit -m a",
    '"C:/Program Files/Git/bin/git.exe" commit -m a',
    "./node_modules/.bin/git commit",
    "GIT.EXE commit",
    "\\git commit -m a",
    "! git commit",
    "if true; then git commit -m a; fi",
    "{ git commit -m a; }",
    "git commit -m a 2>&1",
    ">/dev/null git commit -m a",
  ],
  "Bash",
  true,
);

/* AC-22 */
table(
  "text only is not a commit (AC-22)",
  [
    "echo 'git commit'",
    'echo "git commit"',
    "echo git commit",
    'grep -r "git commit" .',
    "git log --grep 'git commit'",
    'git log --grep "git commit"',
    "# git commit",
    "ls # git commit -m a",
    "cat <<'EOF'\ngit commit -m a\nEOF",
    'cat <<"EOF"\ngit commit -m a\nEOF',
    "cat <<EOF\ngit commit -m a\nEOF",
    "cat <<-EOF\n\tgit commit -m a\n\tEOF",
    "gh pr create --body \"$(cat <<'EOF'\nrun git commit later\nEOF\n)\"",
    "echo 'it'\\''s git commit'",
    "printf %s git commit",
    "command -v git commit",
    "git status && echo 'git commit' | cat",
  ],
  "Bash",
  false,
);

test("a heredoc body is skipped but a later real commit is found (AC-22)", () => {
  assert.equal(isCommit("cat <<'EOF'\ngit commit\nEOF\ngit commit -m a"), true);
  assert.equal(isCommit("cat <<EOF > out.txt\nhello\nEOF\ngit status"), false);
});

/* AC-23 */
table(
  "PowerShell: commits (AC-23)",
  [
    "git commit -m a",
    "& git commit -m x",
    "& 'C:\\Program Files\\Git\\bin\\git.exe' commit -m x",
    "git add .; git commit -m a",
    "git add . && git commit -m a",
    "git add . || git commit -m a",
    "echo x | git commit -F -",
    "git commit -m a\ngit status",
    "$(git commit -m a)",
    '"$(git commit -m a)"',
    "(git commit -m a)",
    "& { git commit -m a }",
    "if ($true) { git commit -m a }",
    "$out = git commit -m a",
    "git -C ../x commit",
    "git.exe commit -m a",
    "bash -c 'git commit -m a'",
    "pwsh -Command \"git commit -m 'a b'\"",
    "cmd /c git commit -m a",
    "Set-Location x; git commit -m a",
  ],
  "PowerShell",
  true,
);

table(
  "PowerShell: not commits (AC-23)",
  [
    "ls",
    "git status",
    "git log",
    "echo git commit",
    "Write-Host 'git commit'",
    'Write-Host "git commit"',
    "Write-Host `git commit",
    "# git commit",
    "git log --grep 'git commit'",
    "<# git commit #> git status",
    "@'\ngit commit -m x\n'@",
    '@"\ngit commit -m x\n"@',
    "Set-Content -Path x.txt -Value @'\ngit commit\n'@",
    "Write-Host 'it''s git commit'",
    "git status # git commit",
  ],
  "PowerShell",
  false,
);

test("a here-string is skipped but a later real commit is found (AC-23)", () => {
  assert.equal(isCommit("$m = @'\ngit commit\n'@\ngit commit -m $m", "PowerShell"), true);
});

/* wrappers that hid a literal `git commit` */
table(
  "wrapper forms are commits (timeout, nice, stdbuf, doas, ionice, env, xargs)",
  [
    "timeout 600 git commit -m x",
    "timeout -s KILL 5 git commit -m x",
    "timeout --signal=KILL -k 3 5 git commit -m x",
    "timeout --foreground 5 git commit",
    "nice git commit -m x",
    "nice -n 5 git commit -m x",
    "nice -n5 git commit",
    "nice -5 git commit",
    "stdbuf -oL git commit -m x",
    "stdbuf -o L -e0 git commit",
    "stdbuf --output=L git commit",
    "doas git commit -m x",
    "doas -u root git commit",
    "ionice git commit",
    "ionice -c 3 git commit",
    "env FOO=1 BAR=2 git commit",
    "env -u FOO -- git commit",
    "sudo timeout 5 nice -n 1 git commit",
    "xargs git commit -m x",
    "echo x | xargs -n 1 git commit",
    "echo x | xargs -I{} git commit -m {}",
    "echo x | xargs -0 -r -P 2 git commit",
    "timeout 5 bash -c 'git commit -m x'",
    "echo x | xargs sh -c 'git commit -m x'",
  ],
  "Bash",
  true,
);

table(
  "eval and Invoke-Expression recurse into their string",
  [
    'eval "git commit -m x"',
    "eval 'git add . && git commit -m x'",
    "eval git commit -m x",
    'eval "eval \'git commit\'"',
    'bash -c "eval \'git commit -m x\'"',
    'iex "git commit"',
    'Invoke-Expression "git commit -m x"',
    "iex 'git commit'",
    'Invoke-Expression -Command "git commit"',
    '$x = iex "git commit"',
  ],
  "PowerShell",
  true,
);

test("eval and iex also work from the other dialect's tool", () => {
  assert.equal(isCommit('iex "git commit"', "Bash"), true);
  assert.equal(isCommit('eval "git commit"', "PowerShell"), true);
});

table(
  "pwsh / powershell -EncodedCommand fails closed",
  [
    "pwsh -EncodedCommand ZwBpAHQAIABjAG8AbQBtAGkAdAA=",
    "pwsh -enc ZwBpAHQA",
    "pwsh -e ZwBpAHQA",
    "pwsh -ec ZwBpAHQA",
    "powershell.exe -NoProfile -EncodedCommand ZwBpAHQA",
    "powershell -encodedcommand ZwBpAHQA",
    "pwsh -NoLogo -NonInteractive -e ZwBpAHQA",
    "pwsh /e ZwBpAHQA",
  ],
  "PowerShell",
  true,
);
table("pwsh -EncodedCommand is gated from the Bash tool too", ["pwsh -EncodedCommand ZwBpAHQA", "powershell -enc ZwBpAHQA"], "Bash", true);

table(
  "an unresolved command head next to the word commit is gated",
  [
    "${GIT:-git} commit -m x",
    "$GIT commit -m x",
    '"$GIT" commit -m x',
    "$(which git) commit",
    "`which git` commit",
    "g=git; $g commit",
    "${g} commit --amend",
  ],
  "Bash",
  true,
);
table(
  "PowerShell: an unresolved command head next to the word commit is gated",
  ["$g='git'; & $g commit", '$g = "git"; & $g commit -m x', "& $g commit", "$g commit", "& ${g} commit", "& (Get-Command git) commit", "$env:GIT commit"],
  "PowerShell",
  true,
);

test("a dynamic head still reports the commit's own arguments, so --no-verify is caught", () => {
  assert.equal(bypassFlag(findCommits("${GIT:-git} commit --no-verify -m x", "Bash")[0].commitArgs), "--no-verify");
  assert.equal(bypassFlag(findCommits("$g='git'; & $g commit -n", "PowerShell")[0].commitArgs), "-n");
  assert.equal(bypassFlag(findCommits("${GIT:-git} commit -m x", "Bash")[0].commitArgs), null);
});

test("cd collected before a hidden commit still applies", () => {
  const [c] = findCommits("cd a && timeout 5 git commit", "Bash");
  assert.deepEqual(c.cdDirs, ["a"]);
  const [e] = findCommits('cd a && eval "cd b && git -C c commit"', "Bash");
  assert.deepEqual([e.cdDirs, e.gitC], [["a", "b"], ["c"]]);
});

/* the same words that are not commits */
table(
  "wrappers and evaluators around other commands stay ungated",
  [
    "timeout 5 ls",
    "timeout -s KILL 5 pnpm test",
    "nice -n 5 pnpm test",
    "nice ls",
    "stdbuf -oL ls",
    "doas ls",
    "ionice -c 3 ls",
    "xargs echo",
    "xargs echo commit",
    "echo x | xargs -n 1 ls",
    "echo eval",
    "echo iex",
    "eval ls",
    "eval 'echo git commit'",
    "git log | xargs echo",
    "timeout 5 git status",
    "nice git log",
    "echo $HOME commit",
    "${GIT:-git} status",
    "$HOME/bin/tool run",
    "echo ${X} commit",
    "pwsh -ExecutionPolicy Bypass -Command ls",
    "pwsh -NoProfile -Command ls",
    "pwsh -File x.ps1",
    "echo pwsh -e abc",
  ],
  "Bash",
  false,
);
table(
  "PowerShell: evaluators and dynamic heads that are not commits",
  [
    "iex 'ls'",
    "Invoke-Expression 'Get-ChildItem'",
    "Write-Host iex",
    "& $g status",
    "& $g",
    "$g='git'; & $g status",
    "$g = 'git'",
    "pwsh -ExecutionPolicy Bypass -Command ls",
    "pwsh -NoProfile -Command Get-ChildItem",
    "Write-Host pwsh -e abc",
    "timeout 5 ls",
    "nice -n 5 pnpm test",
    "echo eval",
  ],
  "PowerShell",
  false,
);

/* commits whose tree cannot be told from the text are flagged `uncertain` */
const flagged = (cmd, tool = "Bash") => findCommits(cmd, tool).map((c) => c.uncertain);

test("uncertain: cd that may not leak, cd -, popd, bare cd", () => {
  for (const cmd of [
    "(cd ../scratch); git commit -am x",
    "cd ../scratch; cd -; git commit -am x",
    "pushd ../scratch; popd; git commit -am x",
    "{ cd ../scratch; }; git commit -am x",
    "echo $(cd ../scratch); git commit -am x",
    "echo `cd ../scratch`; git commit -am x",
    "bash -c 'cd ../scratch'; git commit -am x",
    "eval 'cd ../scratch'; git commit -am x",
    "cd ../scratch; cd; git commit -am x",
    "cd ../a && (cd ../b && git commit -m x)",
  ]) {
    assert.deepEqual(flagged(cmd).map(Boolean), [true], cmd);
  }
  for (const cmd of [
    "(Set-Location ../scratch); git commit -am x",
    "Push-Location ../scratch; Pop-Location; git commit -am x",
    "& { Set-Location ../scratch }; git commit -am x",
    "$(Set-Location ../scratch); git commit -am x",
    "if ($true) { cd ../scratch }; git commit -am x",
    "sl ../scratch; popd; git commit -am x",
  ]) {
    assert.deepEqual(flagged(cmd, "PowerShell").map(Boolean), [true], cmd);
  }
});

test("uncertain: --git-dir, --work-tree, core.worktree, GIT_DIR and friends", () => {
  for (const cmd of [
    "git -C ../s --git-dir=/p/.git --work-tree=/p commit -am x",
    "git -C ../s --git-dir /p/.git --work-tree /p commit -am x",
    "git --work-tree=/p commit -am x",
    "git -c core.worktree=/p commit -am x",
    "GIT_DIR=/p/.git GIT_WORK_TREE=/p git -C ../s commit -am x",
    "env GIT_DIR=/p/.git git commit",
    "env -i GIT_INDEX_FILE=/p/.git/index git commit",
    "sudo GIT_COMMON_DIR=/p/.git git commit",
    "export GIT_DIR=/p/.git; git commit",
    "git commit -m x && export GIT_WORK_TREE=/p",
    "bash -c 'GIT_DIR=/p/.git git commit'",
    "GIT_D''IR=/p/.git git commit",
  ]) {
    assert.deepEqual(flagged(cmd).map(Boolean), [true], cmd);
  }
  assert.deepEqual(flagged("$env:GIT_DIR = 'C:/p/.git'; git commit", "PowerShell").map(Boolean), [true]);
  assert.deepEqual(flagged("$env:GIT_WORK_TREE='C:/p'; & git -C ../s commit", "PowerShell").map(Boolean), [true]);
});

test("uncertain: a hidden or unparseable commit is uncertain too", () => {
  for (const cmd of ["${GIT:-git} commit -m x", "pwsh -enc ZwBpAHQA", "$g commit -m x"]) {
    assert.ok(findCommits(cmd, "Bash").every((c) => c.uncertain), cmd);
  }
  assert.ok(findCommits("$(".repeat(200) + "git commit -m x" + ")".repeat(200), "Bash").every((c) => c.uncertain));
});

test("not uncertain: a plain cd / -C chain, a cd before a nested shell, a commit message with $( )", () => {
  for (const cmd of [
    "git commit -m x",
    "cd sub && git commit -m x",
    "cd a; cd b; git -C c commit -m x",
    "git -C ../x commit",
    "git -c user.name=a commit -m x",
    "cd a && bash -c 'git commit -m x'",
    'cd a && git commit -m "$(date)"',
    "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"",
    "pnpm test && git commit -m x",
  ]) {
    assert.deepEqual(flagged(cmd).map(Boolean), [false], cmd);
  }
  assert.deepEqual(flagged("Set-Location a; git commit -m x", "PowerShell").map(Boolean), [false]);
});

test("uncertain: a cd or -C target the shell expands ($X, glob, ~user, backtick, braces)", () => {
  for (const cmd of [
    "cd ../dev-digest$X; git commit -am x",
    "cd ../dev-dig*; git commit -am x",
    "cd ../dev-dig?st; git commit -am x",
    "cd ../[dp]ev-digest; git commit -am x",
    "cd ~someone/proj; git commit -am x",
    "cd ../{a,b}; git commit -am x",
    "cd ${X}; git commit -am x",
    "cd $(pwd)/..; git commit -am x",
    "git -C ../dev-dig* commit -am x",
    "git -C ../dev-digest$X commit -am x",
    "pushd ../dev-dig*; git commit -am x",
  ]) {
    assert.deepEqual(flagged(cmd).map(Boolean), [true], cmd);
  }
  assert.deepEqual(flagged("cd ../dev-dig*; git commit -am x", "PowerShell").map(Boolean), [true]);
  assert.deepEqual(flagged("Set-Location $env:TEMP; git commit -am x", "PowerShell").map(Boolean), [true]);
});

test("not uncertain: plain, ~ and ~/ cd targets", () => {
  for (const cmd of ["cd ../dev-digest; git commit -m x", "cd ~; git commit -m x", "cd ~/proj; git commit -m x", "git -C ../x-y_z.1 commit -m x", "cd 'my dir'; git commit -m x"]) {
    assert.deepEqual(flagged(cmd).map(Boolean), [false], cmd);
  }
});

test("uncertain: --config-env core.worktree / core.bare, GIT_CONFIG_*", () => {
  for (const cmd of [
    "git --config-env=core.worktree=WT commit -m x",
    "git --config-env core.worktree=WT commit -m x",
    "git --config-env=core.bare=B commit -m x",
    "git -C ../s --config-env core.worktree=WT commit -m x",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.worktree GIT_CONFIG_VALUE_0=/x git commit -m x",
    "GIT_CONFIG_PARAMETERS=\"'core.worktree'='/x'\" git commit -m x",
    "env GIT_CONFIG_COUNT=1 git commit -m x",
    "export GIT_CONFIG_KEY_0=core.worktree; git commit -m x",
  ]) {
    assert.deepEqual(flagged(cmd).map(Boolean), [true], cmd);
  }
  assert.deepEqual(flagged("$env:GIT_CONFIG_COUNT = '1'; git commit -m x", "PowerShell").map(Boolean), [true]);
  // an unrelated --config-env key is not a redirect
  assert.deepEqual(flagged("git --config-env=http.extraheader=H commit -m x").map(Boolean), [false]);
  assert.deepEqual(flagged("GIT_CONFIGURED=1 git commit -m x").map(Boolean), [false]);
});

/* cd / -C collection */
test("cdDirs and gitC are collected in order (AC-25 input)", () => {
  const [c] = findCommits("cd a && cd b; git -C c -C d commit -m x", "Bash");
  assert.deepEqual(c.cdDirs, ["a", "b"]);
  assert.deepEqual(c.gitC, ["c", "d"]);
  const [p] = findCommits("Set-Location -Path 'a b'; cd c; git commit", "PowerShell");
  assert.deepEqual(p.cdDirs, ["a b", "c"]);
  const [n] = findCommits("cd a && bash -c 'cd b && git commit'", "Bash");
  assert.deepEqual(n.cdDirs, ["a", "b"]);
});

/* AC-24 */
test("bypass flags (AC-24)", () => {
  const hit = (cmd) => bypassFlag(findCommits(cmd)[0].commitArgs);
  assert.equal(hit("git commit --no-verify"), "--no-verify");
  assert.equal(hit("git commit -m x --no-verify"), "--no-verify");
  assert.equal(hit("git commit -n"), "-n");
  assert.equal(hit("git commit -anm x"), "-n");
  assert.equal(hit("git commit -an"), "-n");
  assert.equal(hit("git commit --no-ver"), "--no-verify");
  assert.equal(hit('bash -c "git commit --no-verify -m x"'), "--no-verify");
});

test("not bypass flags (AC-24, EC-7)", () => {
  const hit = (cmd) => bypassFlag(findCommits(cmd)[0].commitArgs);
  assert.equal(hit('git commit -m "-n"'), null);
  assert.equal(hit("git commit -m '--no-verify'"), null);
  assert.equal(hit("git commit -- -n"), null);
  assert.equal(hit("git commit -- --no-verify"), null);
  assert.equal(hit("git commit -F -n"), null);
  assert.equal(hit("git commit -mn"), null);
  assert.equal(hit("git commit -am x"), null);
  assert.equal(hit("git commit -uno"), null);
  assert.equal(hit("git commit --author -n"), null);
  assert.equal(hit("git commit --no-edit"), null);
  assert.equal(hit("git commit --amend --no-edit"), null);
  assert.equal(hit('git commit -m "a" -m "b"'), null);
});

/* robustness */
test("odd input never throws and non-commits stay non-commits", () => {
  for (const tool of ["Bash", "PowerShell"]) {
    for (const cmd of [undefined, null, 42, "'", '"', "`", "$(", "$((", "(((", ")))", "<<", "<<EOF", "@'", "<#", "\\", "&&&&", "||", "$'", "${", "echo $(echo $(echo $(", "git commit -m '"]) {
      assert.doesNotThrow(() => findCommits(cmd, tool));
    }
  }
  assert.equal(isCommit("echo 'unterminated git commit"), false);
  assert.equal(isCommit("git commit -m 'unterminated"), true);
});

test("extremely deep nesting falls back instead of throwing", () => {
  const deep = "$(".repeat(200) + "git commit -m x" + ")".repeat(200);
  assert.doesNotThrow(() => findCommits(deep, "Bash"));
  assert.equal(isCommit(deep), true);
  assert.equal(isCommit("$(".repeat(200) + "ls"), false);
});

test("fuzz: 600 random strings never throw (AC-18)", () => {
  const alphabet = ["git", "commit", " ", " ", "'", '"', "`", "$(", ")", "(", "&&", "||", ";", "|", "&", "\n", "<<", "EOF", "#", "@'", "'@", "-n", "-m", "--no-verify", "\\", "bash -c ", "cmd /c ", "pwsh -c ", "{", "}", "$", "=", "<#", "#>", "cd ", "-C "];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 600; n++) {
    let s = "";
    const len = 1 + Math.floor(rnd() * 30);
    for (let k = 0; k < len; k++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    for (const tool of ["Bash", "PowerShell"]) {
      const r = findCommits(s, tool);
      assert.ok(Array.isArray(r), s);
      for (const c of r) bypassFlag(c.commitArgs);
    }
  }
});

test("a long command is classified in linear-ish time", () => {
  const big = "echo hello world; ".repeat(20000) + "git commit -m x";
  const t0 = Date.now();
  assert.equal(isCommit(big), true);
  assert.ok(Date.now() - t0 < 3000);
});

/* NFR-2 / NFR-3 */
test("the parser has no imports and no I/O (NFR-2, NFR-3)", () => {
  const src = readFileSync(new URL("./commit-gate-parse.mjs", import.meta.url), "utf8");
  assert.equal(/^\s*import\s/m.test(src), false);
  assert.equal(/\bimport\(/.test(src), false);
  assert.equal(/\b(require|process|eval|Function)\s*\(/.test(src), false);
  assert.equal(/\bchild_process\b|\bnode:/.test(src.replace(/^\/\*\*[\s\S]*?\*\//, "")), false);
});
