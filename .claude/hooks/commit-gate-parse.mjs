/**
 * Pure command classifier for the commit test gate (SPEC-06 AC-18..AC-24, NFR-3).
 *
 * No imports, no I/O. The command text is untrusted: it is tokenised, never evaluated.
 * Nothing in here throws — on a parse failure it falls back to a coarse regex so that the
 * gate errs on the side of gating.
 *
 *   findCommits(command, tool) -> [{ commitArgs, cdDirs, gitC, uncertain }]   ([] = not a commit)
 *     uncertain: the tree the commit lands in cannot be derived from cd / -C alone
 *   bypassFlag(commitArgs)     -> "--no-verify" | "-n" | null
 */

const MAX_DEPTH = 12;

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
const GIT_RE = /(?:^|[\\/])git(?:\.exe)?$/i;
const BASH_SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const PS_SHELLS = new Set(["pwsh", "powershell"]);
const CD_BASH = new Set(["cd", "pushd", "chdir"]);
const CD_PS = new Set(["cd", "chdir", "sl", "set-location", "pushd", "push-location"]);
const POP = new Set(["popd", "pop-location"]);
const KEYWORDS = new Set(["!", "{", "if", "then", "else", "elif", "do", "while", "until"]);

/* ---------------------------------------------------------------- tokenizer */

/**
 * A word is `{ v, raw, q }`: decoded value, source text, and whether any quoting, escaping or
 * substitution took part (an unquoted `>` is a redirection; a quoted one is an argument).
 */
function scan(st, stop) {
  const { s, dialect } = st;
  const bash = dialect === "bash";
  const ps = dialect === "powershell";
  const cmd = dialect === "cmd";
  if (st.depth > MAX_DEPTH) throw new Error("nesting too deep");

  let words = [];
  let cur = null;
  const pending = []; // heredocs waiting for their body (bash only)

  const startWord = () => {
    if (!cur) cur = { v: "", start: st.i, raw: "", q: false };
    return cur;
  };
  const endWord = () => {
    if (cur) {
      cur.raw = s.slice(cur.start, st.i);
      // a bare `{` / `}` opens / closes a group (bash); PowerShell braces are counted where they are read
      if (bash && !cur.q && cur.v === "{") st.flags.brace++;
      else if (bash && !cur.q && cur.v === "}") st.flags.brace = Math.max(0, st.flags.brace - 1);
      words.push(cur);
      cur = null;
    }
  };
  const endCmd = () => {
    endWord();
    // `nest` > 0: the command sits inside ( ), $( ), backticks or { } — its effect on the
    // working directory may not reach the rest of the command line.
    if (words.length) {
      words.nest = st.nest + (st.flags.brace > 0 ? 1 : 0);
      st.out.push(words);
    }
    words = [];
  };

  const sub = (text) => {
    scan({ s: text, i: 0, dialect, depth: st.depth + 1, out: st.out, nest: st.nest + 1, flags: st.flags }, null);
  };

  // `$(`, `@(`, `(`: scan up to the matching `)`, then continue after it.
  const runNested = (skip) => {
    const child = { s, i: st.i + skip, dialect, depth: st.depth + 1, out: st.out, nest: st.nest + 1, flags: st.flags };
    scan(child, ")");
    st.i = child.i;
  };

  const skipArith = (from) => {
    const end = s.indexOf("))", from);
    st.i = end < 0 ? s.length : end + 2;
  };

  const readBacktick = () => {
    let j = st.i + 1;
    let text = "";
    while (j < s.length && s[j] !== "`") {
      if (s[j] === "\\" && j + 1 < s.length && "`$\\".includes(s[j + 1])) {
        text += s[j + 1];
        j += 2;
      } else {
        text += s[j];
        j++;
      }
    }
    st.i = Math.min(j + 1, s.length);
    sub(text);
  };

  const readDq = (w) => {
    w.q = true;
    st.i++; // opening quote
    while (st.i < s.length) {
      const c = s[st.i];
      if (c === '"') {
        if (ps && s[st.i + 1] === '"') {
          w.v += '"';
          st.i += 2;
          continue;
        }
        st.i++;
        return;
      }
      if (bash && c === "\\") {
        const n = s[st.i + 1];
        if (n === "\n") st.i += 2;
        else if (n !== undefined && '$`"\\'.includes(n)) {
          w.v += n;
          st.i += 2;
        } else {
          w.v += c;
          st.i++;
        }
        continue;
      }
      if (ps && c === "`") {
        if (st.i + 1 < s.length) w.v += s[st.i + 1];
        st.i += 2;
        continue;
      }
      if (c === "$" && s[st.i + 1] === "(") {
        if (s[st.i + 2] === "(" && !ps) skipArith(st.i + 3);
        else runNested(2);
        continue;
      }
      if (c === "$" && s[st.i + 1] === "{") {
        const end = s.indexOf("}", st.i + 2);
        st.i = end < 0 ? s.length : end + 1;
        continue;
      }
      if (bash && c === "`") {
        readBacktick();
        continue;
      }
      w.v += c;
      st.i++;
    }
  };

  const skipHeredocBodies = () => {
    for (const h of pending.splice(0)) {
      while (st.i < s.length) {
        const nl = s.indexOf("\n", st.i);
        let line = s.slice(st.i, nl < 0 ? s.length : nl).replace(/\r$/, "");
        st.i = nl < 0 ? s.length : nl + 1;
        if (h.strip) line = line.replace(/^\t+/, "");
        if (line === h.delim) break;
      }
    }
  };

  const readHeredocDelim = () => {
    // st.i is just after `<<`
    let strip = false;
    if (s[st.i] === "-") {
      st.i++;
      strip = true;
    }
    while (s[st.i] === " " || s[st.i] === "\t") st.i++;
    let delim = "";
    while (st.i < s.length && !/[\s;&|()<>]/.test(s[st.i])) {
      const c = s[st.i];
      if (c === "'" || c === '"') {
        const end = s.indexOf(c, st.i + 1);
        delim += s.slice(st.i + 1, end < 0 ? s.length : end);
        st.i = end < 0 ? s.length : end + 1;
      } else if (c === "\\") {
        delim += s[st.i + 1] ?? "";
        st.i += 2;
      } else {
        delim += c;
        st.i++;
      }
    }
    if (delim) pending.push({ delim, strip });
  };

  while (st.i < s.length) {
    const c = s[st.i];

    if (c === "\n") {
      endCmd();
      st.i++;
      if (pending.length) skipHeredocBodies();
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      endWord();
      st.i++;
      continue;
    }

    // comments
    if (c === "#" && !cur && !cmd) {
      const nl = s.indexOf("\n", st.i);
      st.i = nl < 0 ? s.length : nl;
      continue;
    }
    if (ps && c === "<" && s[st.i + 1] === "#" && !cur) {
      const end = s.indexOf("#>", st.i + 2);
      st.i = end < 0 ? s.length : end + 2;
      continue;
    }

    // escapes
    if ((bash && c === "\\") || (cmd && c === "^") || (ps && c === "`")) {
      const n = s[st.i + 1];
      if (n === "\n" || (n === "\r" && s[st.i + 2] === "\n")) {
        st.i += n === "\r" ? 3 : 2;
        continue;
      }
      const w = startWord();
      w.q = true;
      if (n !== undefined) w.v += n;
      st.i += 2;
      continue;
    }

    // quotes
    if (c === "'" && !cmd) {
      const w = startWord();
      w.q = true;
      st.i++;
      if (ps) {
        for (;;) {
          const end = s.indexOf("'", st.i);
          if (end < 0) {
            w.v += s.slice(st.i);
            st.i = s.length;
            break;
          }
          w.v += s.slice(st.i, end);
          if (s[end + 1] === "'") {
            w.v += "'";
            st.i = end + 2;
          } else {
            st.i = end + 1;
            break;
          }
        }
      } else {
        const end = s.indexOf("'", st.i);
        w.v += s.slice(st.i, end < 0 ? s.length : end);
        st.i = end < 0 ? s.length : end + 1;
      }
      continue;
    }
    if (c === '"') {
      readDq(startWord());
      continue;
    }
    if (bash && c === "`") {
      startWord().q = true;
      readBacktick();
      continue;
    }

    // PowerShell here-strings and @( )
    if (ps && c === "@") {
      const m = /^@(['"])[ \t]*\r?\n/.exec(s.slice(st.i, st.i + 64));
      if (m) {
        const w = startWord();
        w.q = true;
        const close = `\n${m[1]}@`;
        const end = s.indexOf(close, st.i + m[0].length - 1);
        st.i = end < 0 ? s.length : end + close.length;
        continue;
      }
      if (s[st.i + 1] === "(") {
        startWord().q = true;
        runNested(2);
        continue;
      }
    }

    // $ forms
    if (c === "$") {
      const n = s[st.i + 1];
      if (n === "(") {
        startWord().q = true;
        if (s[st.i + 2] === "(" && !ps) skipArith(st.i + 3);
        else runNested(2);
        continue;
      }
      if (n === "{") {
        const w = startWord();
        w.q = true;
        const end = s.indexOf("}", st.i + 2);
        st.i = end < 0 ? s.length : end + 1;
        continue;
      }
      if (n === "'" && bash) {
        const w = startWord();
        w.q = true;
        st.i += 2;
        while (st.i < s.length && s[st.i] !== "'") {
          if (s[st.i] === "\\") {
            w.v += s[st.i + 1] ?? "";
            st.i += 2;
          } else {
            w.v += s[st.i];
            st.i++;
          }
        }
        st.i++;
        continue;
      }
    }

    // grouping
    if (c === "(") {
      const atStart = !cur && words.length === 0;
      if (atStart && s[st.i + 1] === "(" && !ps) {
        skipArith(st.i + 2);
        continue;
      }
      if (!atStart) startWord().q = true;
      runNested(1);
      if (atStart) endCmd();
      continue;
    }
    if (c === ")") {
      endCmd();
      st.i++;
      if (stop === ")") return;
      continue;
    }
    if (ps && (c === "{" || c === "}")) {
      endCmd();
      st.flags.brace = c === "{" ? st.flags.brace + 1 : Math.max(0, st.flags.brace - 1);
      st.i++;
      continue;
    }

    // separators
    if (c === ";") {
      endCmd();
      st.i++;
      continue;
    }
    if (c === "&") {
      if (ps) {
        if (s[st.i + 1] === "&") {
          endCmd();
          st.i += 2;
        } else {
          // call operator: a word of its own
          endWord();
          const w = startWord();
          w.v = "&";
          st.i++;
          endWord();
        }
        continue;
      }
      const prev = s[st.i - 1];
      if (prev === "<" || prev === ">" || s[st.i + 1] === ">") {
        startWord().v += c;
        st.i++;
        continue;
      }
      endCmd();
      st.i += s[st.i + 1] === "&" ? 2 : 1;
      continue;
    }
    if (c === "|") {
      if (s[st.i - 1] === ">" && cur) {
        cur.v += c;
        st.i++;
        continue;
      }
      endCmd();
      st.i += s[st.i + 1] === "|" || (!ps && s[st.i + 1] === "&") ? 2 : 1;
      continue;
    }

    // heredoc (bash)
    if (bash && c === "<" && s[st.i + 1] === "<") {
      if (s[st.i + 2] === "<") {
        startWord().v += "<<<";
        st.i += 3;
        continue;
      }
      endWord();
      st.i += 2;
      readHeredocDelim();
      continue;
    }

    startWord().v += c;
    st.i++;
  }
  endCmd();
}

function tokenize(command, dialect, depth) {
  const st = { s: command, i: 0, dialect, depth, out: [], nest: 0, flags: { brace: 0 } };
  scan(st, null);
  return st.out;
}

/* ----------------------------------------------------------- classification */

function baseName(v) {
  const b = v.split(/[\\/]/).pop().toLowerCase();
  return b.replace(/\.(exe|cmd|bat)$/, "");
}

function dropRedirects(words) {
  const out = [];
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (!w.q) {
      const m = /^(\d*|&)([<>][<>&|]*)(.*)$/.exec(w.v);
      if (m) {
        if (m[3] === "") k++;
        continue;
      }
    }
    out.push(w);
  }
  return out;
}

const ENV_VALUE_OPTS = new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]);
const SUDO_VALUE_OPTS = new Set([
  "-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t",
  "--user", "--group", "--host", "--prompt", "--close-from", "--chdir", "--role", "--type",
]);

// Value-taking options of the other wrappers (a value glued to its option needs no entry).
const TIMEOUT_VALUE_OPTS = new Set(["-s", "--signal", "-k", "--kill-after"]);
const NICE_VALUE_OPTS = new Set(["-n", "--adjustment"]);
const STDBUF_VALUE_OPTS = new Set(["-i", "-o", "-e", "--input", "--output", "--error"]);
const DOAS_VALUE_OPTS = new Set(["-u", "-C"]);
const IONICE_VALUE_OPTS = new Set(["-c", "-n", "-p", "-P", "-u", "--class", "--classdata", "--pid", "--pgid", "--uid"]);
const XARGS_VALUE_OPTS = new Set([
  "-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s",
  "--arg-file", "--delimiter", "--eof", "--replace", "--max-lines", "--max-args", "--max-procs", "--max-chars",
]);

/** Skip a wrapper's options (and, for `timeout`, its duration). Returns the next index. */
function skipOptions(words, i, valueOpts, positional = 0) {
  while (words[i]) {
    const o = words[i].v;
    if (o === "--") {
      i++;
      break;
    }
    if (!o.startsWith("-") || o === "-") break;
    i += valueOpts.has(o) ? 2 : 1;
  }
  return Math.min(i + positional, words.length);
}

/** Strip redirections, keywords, `VAR=value` words and wrappers. Returns the remaining words. */
function stripPrefix(input, dialect) {
  const words = dropRedirects(input);
  let i = 0;
  for (;;) {
    const w = words[i];
    if (!w) break;
    const v = w.v;
    if (dialect !== "powershell" && !w.q && KEYWORDS.has(v)) {
      i++;
      continue;
    }
    if (dialect === "powershell" && v.startsWith("$") && words[i + 1]?.v === "=") {
      i += 2; // $x = git commit …
      continue;
    }
    if (dialect !== "powershell" && NAME_RE.test(v)) {
      i++;
      continue;
    }
    if (dialect === "powershell" && v === "&") {
      i++;
      continue;
    }
    const name = baseName(v);
    if (name === "env") {
      i++;
      while (words[i]) {
        const o = words[i].v;
        if (o === "--") {
          i++;
          break;
        }
        if (NAME_RE.test(o)) i++;
        else if (o.startsWith("-")) i += ENV_VALUE_OPTS.has(o) ? 2 : 1;
        else break;
      }
      continue;
    }
    if (name === "command") {
      i++;
      while (words[i]?.v.startsWith("-")) {
        if (words[i].v === "-v" || words[i].v === "-V") return [];
        i++;
      }
      continue;
    }
    if (name === "builtin" || name === "nohup") {
      i++;
      continue;
    }
    if (name === "time") {
      i++;
      while (words[i]?.v === "-p") i++;
      continue;
    }
    if (name === "exec") {
      i++;
      while (words[i]?.v.startsWith("-")) i += words[i].v === "-a" ? 2 : 1;
      continue;
    }
    if (name === "timeout") {
      i = skipOptions(words, i + 1, TIMEOUT_VALUE_OPTS, 1); // the duration follows the options
      continue;
    }
    if (name === "nice") {
      i = skipOptions(words, i + 1, NICE_VALUE_OPTS);
      continue;
    }
    if (name === "stdbuf") {
      i = skipOptions(words, i + 1, STDBUF_VALUE_OPTS);
      continue;
    }
    if (name === "ionice") {
      i = skipOptions(words, i + 1, IONICE_VALUE_OPTS);
      continue;
    }
    if (name === "xargs") {
      i = skipOptions(words, i + 1, XARGS_VALUE_OPTS);
      continue;
    }
    if (name === "doas") {
      i = skipOptions(words, i + 1, DOAS_VALUE_OPTS);
      continue;
    }
    if (name === "sudo") {
      i++;
      while (words[i]) {
        const o = words[i].v;
        if (o === "--") {
          i++;
          break;
        }
        if (NAME_RE.test(o)) i++;
        else if (o.startsWith("-")) i += SUDO_VALUE_OPTS.has(o) ? 2 : 1;
        else break;
      }
      continue;
    }
    break;
  }
  return words.slice(i);
}

function isGitWord(w) {
  return GIT_RE.test(w.v) || GIT_RE.test(w.raw.replace(/["']/g, ""));
}

const GIT_VALUE_LONG = new Set(["--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--attr-source"]);

// Options that point git at another repository or work tree than `-C` does: the tree a
// commit really lands in can no longer be told from the command line.
const CORE_WORKTREE_KEY = /^core\.(?:worktree|bare)=/i;
const GIT_REDIRECT_OPT =/^--(?:git-dir|work-tree)(?:=|$)/;
// `GIT_DIR=…`, `$env:GIT_WORK_TREE`, `env GIT_INDEX_FILE=…`, `export GIT_COMMON_DIR=…`, in any word.
// `GIT_CONFIG_PARAMETERS` / `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n` can carry core.worktree.
const GIT_REDIRECT_ENV =
  /(?:^|[^A-Za-z0-9_])GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_(?:KEY|VALUE)_[A-Za-z0-9_]*)(?![A-Za-z0-9_])/i;
// A path word the shell will expand (`$X`, a glob, `~user`, a backtick, brace expansion): the real
// directory is not the literal text.
const DYNAMIC_PATH = /[$`*?[{]|^~[^/\\]/;

function gitSubcommand(args) {
  const gitC = [];
  let uncertain = false;
  let i = 0;
  while (i < args.length) {
    const a = args[i].v;
    if (a === "-C") {
      if (args[i + 1]) {
        gitC.push(args[i + 1].v);
        if (DYNAMIC_PATH.test(args[i + 1].v) || DYNAMIC_PATH.test(args[i + 1].raw)) uncertain = true;
      }
      i += 2;
    } else if (a === "-c") {
      if (CORE_WORKTREE_KEY.test(args[i + 1]?.v ?? "")) uncertain = true;
      i += 2;
    } else if (GIT_VALUE_LONG.has(a)) {
      if (GIT_REDIRECT_OPT.test(a)) uncertain = true;
      if (a === "--config-env" && CORE_WORKTREE_KEY.test(args[i + 1]?.v ?? "")) uncertain = true;
      i += 2;
    } else if (a.startsWith("-")) {
      if (GIT_REDIRECT_OPT.test(a)) uncertain = true;
      if (a.startsWith("--config-env=") && CORE_WORKTREE_KEY.test(a.slice("--config-env=".length))) uncertain = true;
      i++;
    } else break;
  }
  return { sub: args[i]?.v, rest: args.slice(i + 1), gitC, uncertain };
}

function cdTarget(args, dialect) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i].v;
    if (a === "--") return args[i + 1]?.v ?? null;
    if (dialect === "powershell" && /^-(literal)?path$|^-pspath$/i.test(a)) return args[i + 1]?.v ?? null;
    if (a.startsWith("-") && a !== "-") continue;
    if (dialect === "cmd" && /^\/d$/i.test(a)) continue;
    return a === "-" ? null : a;
  }
  return null;
}

/** `$var`, `${…}` or `$(…)` anywhere in the head word (an empty value means a substitution ate it). */
function isDynamicHead(w) {
  return w.v === "" || /\$[{(A-Za-z_]/.test(w.raw) || /\$[A-Za-z_]/.test(w.v);
}

/** `-e`, `-ec`, `-en`, `-enc`, … `-EncodedCommand`, also with a `/` prefix. */
function isEncodedFlag(v) {
  const m = /^[-/]([A-Za-z]+)$/.exec(v);
  if (m === null) return false;
  const f = m[1].toLowerCase();
  return f === "ec" || "encodedcommand".startsWith(f);
}

/**
 * `ctx.uncertain` is set when the working directory or the repository a commit lands in cannot
 * be known from the text: `cd -`, a bare `cd`, `popd` / `Pop-Location`, a `cd` inside ( ), $( ),
 * backticks, { } or a nested shell, a `cd` / `-C` target the shell would expand (`$X`, glob,
 * `~user`), `--git-dir` / `--work-tree` / `core.worktree` (also via `-c` or `--config-env`), or any
 * word mentioning GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / GIT_COMMON_DIR / GIT_CONFIG_*. The
 * gate then gates every tree of the project (the gate also checks, with the file system, that a
 * `cd` target exists).
 */
function walk(command, dialect, cds, depth, commits, ctx) {
  if (depth > MAX_DEPTH) throw new Error("nesting too deep");
  for (const raw of tokenize(command, dialect, depth)) {
    if (raw.some((w) => GIT_REDIRECT_ENV.test(w.v))) ctx.uncertain = true;
    const words = stripPrefix(raw, dialect);
    if (!words.length) continue;
    const [head, ...args] = words;
    const name = baseName(head.v);

    if (isGitWord(head)) {
      const { sub, rest, gitC, uncertain } = gitSubcommand(args);
      if (sub === "commit") {
        commits.push({ commitArgs: rest.map((w) => w.v), cdDirs: [...cds], gitC, uncertain });
      }
      continue;
    }

    // A command head that is only known at run time (`${GIT:-git} commit`, `& $g commit`,
    // `$(which git) commit`): when the segment also says `commit`, gate it.
    if (isDynamicHead(head)) {
      const k = args.findIndex((a) => /\bcommit\b/i.test(a.v) || /\bcommit\b/i.test(a.raw));
      if (k >= 0) {
        const exact = args.findIndex((a) => a.v === "commit");
        commits.push({ commitArgs: exact >= 0 ? args.slice(exact + 1).map((w) => w.v) : [], cdDirs: [...cds], gitC: [], uncertain: true });
      }
      continue;
    }

    // `eval "git commit"`, `iex "git commit"`, `Invoke-Expression "git commit"`: the text is a script.
    if (name === "eval" || name === "iex" || name === "invoke-expression") {
      const script = args
        .filter((a) => !/^-command$/i.test(a.v))
        .map((a) => a.v)
        .join(" ");
      if (script) walk(script, dialect, [...cds], depth + 1, commits, ctx);
      continue;
    }

    if ((dialect === "powershell" ? CD_PS : CD_BASH).has(name) || (dialect === "cmd" && (name === "cd" || name === "chdir"))) {
      const t = cdTarget(args, dialect);
      if (t) {
        cds.push(t);
        // the decoded value loses a substitution (cd $(pwd)/.. is "/.."), so the source text counts too
        if (DYNAMIC_PATH.test(t) || args.some((a) => a.v === t && DYNAMIC_PATH.test(a.raw))) ctx.uncertain = true; // cd ../x$Y, cd ../x*, cd ~user
      } else ctx.uncertain = true; // `cd -`, a bare `cd`: somewhere the text does not say
      if (raw.nest > 0 || depth > 0) ctx.uncertain = true; // a scope that may not leak back
      continue;
    }
    if (POP.has(name)) {
      ctx.uncertain = true;
      continue;
    }

    if (BASH_SHELLS.has(name)) {
      const idx = args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a.v));
      const script = idx >= 0 ? args[idx + 1]?.v : undefined;
      if (script) walk(script, "bash", [...cds], depth + 1, commits, ctx);
      continue;
    }
    if (PS_SHELLS.has(name)) {
      // -EncodedCommand (any prefix, down to -e) hides the script in base64: fail closed.
      if (args.some((a) => isEncodedFlag(a.v))) {
        commits.push({ commitArgs: [], cdDirs: [...cds], gitC: [], uncertain: true });
        continue;
      }
      const idx = args.findIndex((a) => /^[-/]c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(a.v));
      if (idx >= 0) {
        const script = args.slice(idx + 1).map((a) => a.v).join(" ");
        if (script) walk(script, "powershell", [...cds], depth + 1, commits, ctx);
      }
      continue;
    }
    if (name === "cmd") {
      const idx = args.findIndex((a) => /^\/{1,2}[ck]$/i.test(a.v));
      if (idx >= 0) {
        const script = args.slice(idx + 1).map((a) => a.v).join(" ");
        if (script) walk(script, "cmd", [...cds], depth + 1, commits, ctx);
      }
    }
  }
}

/**
 * @param {string} command  tool_input.command
 * @param {string} tool     "Bash" | "PowerShell"
 * @returns {{commitArgs: string[], cdDirs: string[], gitC: string[], uncertain: boolean}[]}
 */
export function findCommits(command, tool) {
  try {
    const commits = [];
    const ctx = { uncertain: false };
    walk(String(command ?? ""), tool === "PowerShell" ? "powershell" : "bash", [], 0, commits, ctx);
    if (ctx.uncertain) for (const c of commits) c.uncertain = true;
    return commits;
  } catch {
    // Could not parse: gate when the text even looks like a commit, otherwise let it pass.
    try {
      return /(?:^|[^\w.-])git(?:\.exe)?\s[^;&|\n]*\bcommit\b/i.test(String(command))
        ? [{ commitArgs: [], cdDirs: [], gitC: [], uncertain: true }]
        : [];
    } catch {
      return [];
    }
  }
}

/* ------------------------------------------------------------------ bypass */

// Short options that take a value; the value is the rest of the cluster, or the next word
// when the letter is last. `u` and `S` take an optional *attached* value only.
const VALUE_SHORT = new Set(["m", "F", "c", "C", "t"]);
const ATTACHED_SHORT = new Set(["u", "S"]);
const VALUE_LONG = new Set([
  "--message", "--file", "--reuse-message", "--reedit-message", "--author", "--date",
  "--template", "--fixup", "--squash", "--cleanup", "--trailer", "--pathspec-from-file",
]);

/** @param {string[]} commitArgs @returns {"--no-verify" | "-n" | null} */
export function bypassFlag(commitArgs) {
  try {
    for (let i = 0; i < commitArgs.length; i++) {
      const a = String(commitArgs[i]);
      if (a === "--") break;
      if (a.startsWith("--")) {
        const name = a.split("=")[0];
        // git accepts any unambiguous prefix: --no-v, --no-ver, … are --no-verify
        if (name.length >= 6 && "--no-verify".startsWith(name)) return "--no-verify";
        if (!a.includes("=") && VALUE_LONG.has(a)) i++;
        continue;
      }
      if (a.length > 1 && a.startsWith("-")) {
        for (let k = 1; k < a.length; k++) {
          const ch = a[k];
          if (ch === "n") return "-n";
          if (VALUE_SHORT.has(ch)) {
            if (k === a.length - 1) i++;
            break;
          }
          if (ATTACHED_SHORT.has(ch)) break;
        }
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}
