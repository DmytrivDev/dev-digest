#!/usr/bin/env node
/**
 * pr-self-review — phase 5: merge findings, derive the mechanical findings, compute
 * the verdict, write the report.
 *
 * Reads, all under .devdigest/cache/pr-self-review/:
 *   plan.json          from collect-diff.mjs
 *   findings/*.json    one per reviewer subagent, written by the orchestrator
 *   checks.json        deterministic command results, written by the orchestrator
 *
 * Writes:
 *   verdict.json       { verdict, score, counts, head_sha, dirty_hash, generated_at }
 *   <branch>__<utc>.md and latest.md
 *
 * The verdict mirrors gateTriggered(findings,'critical') from
 * reviewer-core/src/output/to-review.ts: BLOCKED iff at least one CRITICAL survives.
 * That is the product's own shipped default (ci_fail_on: 'critical'), not a stricter
 * bar invented here.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const CATEGORIES = ['bug', 'security', 'perf', 'style', 'test'];
/** Mirrors SEV_RANK in reviewer-core/src/output/to-review.ts. */
const SEV_RANK = { SUGGESTION: 1, WARNING: 2, CRITICAL: 3 };
/** FAIL_ON_MIN_RANK.critical — the only gate policy this skill uses. */
const GATE_MIN_RANK = 3;
/** Confidence below this turns a CRITICAL into a WARNING. A hunch must not block. */
const CONFIDENCE_FLOOR = 0.7;

const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? fallback : v;
}

let REPO_ROOT = process.cwd();
try {
  REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString('utf8')
    .trim();
} catch {
  /* fall back to cwd */
}

const DIR = flag('--dir', join(REPO_ROOT, '.devdigest', 'cache', 'pr-self-review'));

function die(msg, hint) {
  process.stdout.write(`${JSON.stringify({ error: msg, hint: hint ?? null }, null, 2)}\n`);
  process.exit(2);
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

const plan = readJson(join(DIR, 'plan.json'), null);
if (!plan) die('plan.json not found — run collect-diff.mjs first', `expected at ${join(DIR, 'plan.json')}`);

const checksFile = readJson(join(DIR, 'checks.json'), { checks: [] });
const checks = Array.isArray(checksFile.checks) ? checksFile.checks : [];

// ---------------------------------------------------------------- findings

const incomplete = [];
const dropped = [];
const raw = [];

const routedSkills = new Map(plan.routes.filter((r) => !r.deferred).map((r) => [r.skill, r]));
const findingsDir = join(DIR, 'findings');

if (existsSync(findingsDir)) {
  for (const name of readdirSync(findingsDir)) {
    if (!name.endsWith('.json')) continue;
    const body = readJson(join(findingsDir, name), null);
    if (!body || !Array.isArray(body.findings)) {
      incomplete.push(`${name}: unparseable or missing a findings array`);
      continue;
    }
    for (const f of body.findings) raw.push({ ...f, skill: body.skill ?? name.replace(/\.json$/, '') });
  }
}

// A routed skill that produced no file at all did not run. That is INCOMPLETE, not
// a clean bill of health — the distinction the whole gate rests on.
for (const skill of routedSkills.keys()) {
  const expected = join(findingsDir, `${skill}.json`);
  if (!existsSync(expected)) incomplete.push(`${skill}: no findings file — reviewer did not report`);
}

const fileIndex = new Map(plan.files.map((f) => [f.path, f]));

function intersectsHunk(file, start, end) {
  const rec = fileIndex.get(file);
  if (!rec) return false;
  if (rec.status === 'untracked') return true; // whole file is new
  if (!rec.hunks || rec.hunks.length === 0) return false;
  return rec.hunks.some((h) => {
    const hStart = h.new_start;
    const hEnd = h.new_start + Math.max(h.new_lines, 1) - 1;
    return start <= hEnd && end >= hStart;
  });
}

const kept = [];
for (const f of raw) {
  const route = routedSkills.get(f.skill);
  const drop = (reason) => dropped.push({ skill: f.skill, title: f.title ?? '(untitled)', reason });

  if (!SEVERITIES.includes(f.severity)) {
    drop(`severity "${f.severity}" is not one of ${SEVERITIES.join('/')}`);
    continue;
  }
  if (!CATEGORIES.includes(f.category)) {
    drop(`category "${f.category}" is not one of ${CATEGORIES.join('/')}`);
    continue;
  }
  if (route && !route.files.includes(f.file)) {
    drop(`cites ${f.file}, which was not assigned to this reviewer`);
    continue;
  }
  const start = Number(f.start_line);
  const end = Number(f.end_line ?? f.start_line);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    drop('missing or non-numeric line range');
    continue;
  }
  if (!intersectsHunk(f.file, start, end)) {
    drop(`lines ${start}-${end} intersect no changed region of ${f.file}`);
    continue;
  }

  const confidence = typeof f.confidence === 'number' ? f.confidence : 1;
  let severity = f.severity;
  let note = null;
  if (severity === 'CRITICAL' && confidence < CONFIDENCE_FLOOR) {
    severity = 'WARNING';
    note = `downgraded from CRITICAL — confidence ${confidence} is below the ${CONFIDENCE_FLOOR} floor`;
  }

  kept.push({
    ...f,
    severity,
    start_line: start,
    end_line: end,
    confidence,
    downgrade_note: note,
    skills: [f.skill],
  });
}

// Dedupe: same file + overlapping range + same category. Highest severity wins, then
// confidence, then routing priority. Nothing vanishes silently — the survivor records
// who else raised it.
const merged = [];
for (const f of kept) {
  const twin = merged.find(
    (m) =>
      m.file === f.file &&
      m.category === f.category &&
      f.start_line <= m.end_line &&
      f.end_line >= m.start_line,
  );
  if (!twin) {
    merged.push(f);
    continue;
  }
  if (!twin.skills.includes(f.skill)) twin.skills.push(f.skill);
  const better =
    SEV_RANK[f.severity] > SEV_RANK[twin.severity] ||
    (SEV_RANK[f.severity] === SEV_RANK[twin.severity] && f.confidence > twin.confidence);
  if (better) Object.assign(twin, { ...f, skills: twin.skills });
}

// ---------------------------------------------------------------- mechanical

const mech = plan.mechanical ?? {};
const mechanical = [];
let n = 0;
const add = (severity, category, title, rationale, file, line) =>
  mechanical.push({
    id: `check-${(n += 1)}`,
    severity,
    category,
    title,
    file: file ?? '(repository)',
    start_line: line ?? 0,
    end_line: line ?? 0,
    rationale,
    suggestion: null,
    confidence: 1,
    skills: ['deterministic'],
    downgrade_note: null,
  });

if (mech.on_main) {
  add(
    'CRITICAL',
    'bug',
    'You are on `main`',
    'docs/git-workflow.md requires one `feat/<slug>` feature branch per homework, cut from your fork\'s `main`. Commit this work to a branch before opening a PR.',
  );
}

for (const m of mech.migrations ?? []) {
  if (m.suspect === 'modified-existing') {
    add(
      'CRITICAL',
      'bug',
      'An existing migration was edited',
      'Migrations are immutable once applied — drizzle\'s journal is keyed by file hash, so editing one leaves already-migrated databases silently out of step. Add a NEW migration with `pnpm db:generate` instead.',
      m.path,
    );
  } else if (m.suspect === 'nonstandard-name') {
    add(
      'CRITICAL',
      'bug',
      'Hand-written migration SQL',
      'Migration names are generated: `00NN_<slug>.sql` from `pnpm db:generate`. A name outside that shape means the SQL was written by hand, which CLAUDE.md lists as do-not-touch.',
      m.path,
    );
  }
}

for (const l of mech.lockfiles ?? []) {
  if (l.manager_ok === false) {
    add(
      'CRITICAL',
      'bug',
      'Lockfile from the wrong package manager',
      `\`${l.path}\` does not match the manager for \`${l.package}\`. server/, client/ and mcp/ use pnpm; reviewer-core/ and e2e/ use npm. Mixing them produces a lockfile nobody else can install from.`,
      l.path,
    );
  } else if (l.package_json_changed === false) {
    add(
      'CRITICAL',
      'bug',
      'Lockfile changed with no package.json change',
      `\`${l.path}\` moved but its sibling package.json did not. That is usually an accidental re-resolve from running the wrong manager, or a hand edit — both of which CLAUDE.md forbids.`,
      l.path,
    );
  }
}

for (const p of mech.new_server_tests ?? []) {
  add(
    'CRITICAL',
    'test',
    'New server test is missing the `.it.test.ts` suffix',
    'CI splits the server suite on this suffix (`--exclude \'**/*.it.test.ts\'` vs `vitest run .it.test`). A DB-backed test named `*.test.ts` runs in the unit job without Postgres and fails there. If this test needs no database, ignore this finding.',
    p,
  );
}

for (const s of mech.skills_changed ?? []) {
  if (!s.in_routing) {
    add(
      'WARNING',
      'style',
      `New skill \`${s.slug}\` has no routing entry`,
      'A skill absent from `.claude/skills/pr-self-review/routing.json` is never dispatched, so its rules are silently unenforced. Add it as `routed: true` with globs, or as `routed: false` with a reason — omission is indistinguishable from an oversight.',
      s.path,
    );
  }
}

const vs = mech.vendor_shared_touched ?? { server: [], client: [] };
const vendorTouched = (vs.server?.length ?? 0) + (vs.client?.length ?? 0) > 0;
const syncChecked = checks.some((c) => /vendor-shared-sync/.test(c.id ?? '') && c.status === 'pass');
if (vendorTouched && !syncChecked) {
  add(
    'WARNING',
    'bug',
    'vendor/shared touched without running the lock-step test',
    'The two copies must stay byte-identical. Run `cd server && pnpm exec vitest run test/vendor-shared-sync.test.ts` — do not eyeball it.',
  );
}

// Failing blocking checks become CRITICAL findings; advisory ones stay in the table.
for (const c of checks) {
  if (c.status !== 'fail') continue;
  if (c.blocking) {
    add('CRITICAL', c.category ?? 'bug', `Check failed: ${c.label ?? c.id}`, c.detail ?? 'See the check output.');
  }
}
for (const c of checks) {
  if (c.status === 'error') incomplete.push(`${c.label ?? c.id}: could not run — ${c.detail ?? 'unknown error'}`);
}

const all = [...mechanical, ...merged].sort(
  (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.file.localeCompare(b.file),
);

// ---------------------------------------------------------------- verdict

const counts = {
  CRITICAL: all.filter((f) => f.severity === 'CRITICAL').length,
  WARNING: all.filter((f) => f.severity === 'WARNING').length,
  SUGGESTION: all.filter((f) => f.severity === 'SUGGESTION').length,
};
const blockers = all.filter((f) => SEV_RANK[f.severity] >= GATE_MIN_RANK).length;
/** reviewer-core/src/review/reduce.ts: 0 findings ⇒ 100, else 100 − 35C − 12W − 3S. */
const score = Math.max(
  0,
  Math.min(100, 100 - 35 * counts.CRITICAL - 12 * counts.WARNING - 3 * counts.SUGGESTION),
);

const verdict = blockers > 0 ? 'BLOCKED' : incomplete.length > 0 ? 'INCOMPLETE' : 'PASS';

// ---------------------------------------------------------------- report

const stamp = new Date().toISOString();
const sev = { CRITICAL: '🔴', WARNING: '🟡', SUGGESTION: '🔵' };

function findingBlock(f, i) {
  const loc =
    f.start_line > 0 ? `\`${f.file}:${f.start_line}${f.end_line !== f.start_line ? `-${f.end_line}` : ''}\`` : `\`${f.file}\``;
  const by = f.skills.join(', ');
  const lines = [
    `### ${i}. ${sev[f.severity]} ${f.title}`,
    `${loc} · ${f.category} · via ${by}${typeof f.confidence === 'number' ? ` · confidence ${f.confidence}` : ''}`,
    '',
    f.rationale ?? '',
  ];
  if (f.suggestion) lines.push('', `**Fix:** ${f.suggestion}`);
  if (f.downgrade_note) lines.push('', `_${f.downgrade_note}_`);
  return lines.join('\n');
}

const banner =
  verdict === 'BLOCKED'
    ? `**VERDICT: BLOCKED** — ${blockers} blocker${blockers === 1 ? '' : 's'}. Do not open or merge this PR.`
    : verdict === 'INCOMPLETE'
      ? '**VERDICT: INCOMPLETE** — part of the review did not run. This is infrastructure, not your code, but the gate cannot pass a review it did not perform.'
      : '**VERDICT: PASS** — no blockers.';

const lines = [
  `# PR self-review — ${plan.head.branch} → ${plan.base.ref}`,
  '',
  banner,
  '',
  `score ${score}/100 · ${counts.CRITICAL} critical · ${counts.WARNING} warning · ${counts.SUGGESTION} suggestion`,
  `base \`${String(plan.base.merge_base).slice(0, 7)}\` · head \`${String(plan.head.sha).slice(0, 7)}\` · dirty \`${plan.head.dirty_hash}\``,
  `${plan.counts.files} files · ${plan.counts.reviewable} reviewable · ${plan.counts.routes} reviewers · generated ${stamp}`,
  '',
];

for (const w of plan.warnings ?? []) lines.push(`> ⚠️ ${w}`, '');

if (incomplete.length > 0) {
  lines.push('## Did not run', '');
  for (const i of incomplete) lines.push(`- ${i}`);
  lines.push('');
}

for (const level of SEVERITIES) {
  const group = all.filter((f) => f.severity === level);
  if (group.length === 0) continue;
  const heading = { CRITICAL: 'Blockers (CRITICAL)', WARNING: 'Warnings', SUGGESTION: 'Suggestions' }[level];
  lines.push(`## ${heading}`, '');
  group.forEach((f, i) => lines.push(findingBlock(f, i + 1), ''));
}

if (all.length === 0) lines.push('## Findings', '', '_None._', '');

lines.push('## Deterministic checks', '');
if (checks.length === 0) {
  lines.push('_No check results were recorded._', '');
} else {
  lines.push('| Check | Result | Blocking |', '|---|---|---|');
  for (const c of checks) {
    lines.push(`| ${c.label ?? c.id} | ${c.status}${c.detail ? ` — ${c.detail}` : ''} | ${c.blocking ? 'yes' : 'no'} |`);
  }
  lines.push('');
}

lines.push('## Coverage', '');
lines.push('| Reviewer | Files |', '|---|---|');
for (const r of plan.routes) {
  lines.push(`| ${r.skill}${r.deferred ? ' _(deferred — not reviewed)_' : ''} | ${r.files.length} |`);
}
if ((plan.unrouted ?? []).length > 0) {
  lines.push(`| _no domain reviewer_ | ${plan.unrouted.length} |`);
}
lines.push('');

if (dropped.length > 0) {
  lines.push('## Dropped findings', '');
  lines.push('| From | Title | Reason |', '|---|---|---|');
  for (const d of dropped) lines.push(`| ${d.skill} | ${d.title} | ${d.reason} |`);
  lines.push('');
}

lines.push(
  '## Pre-PR checklist (docs/git-workflow.md)',
  '',
  `- [ ] **PR base is \`main\` of MY FORK**, not upstream. Getting this wrong is not recoverable by editing the PR afterwards. Current base: \`${plan.base.ref}\`.`,
  '- [ ] Working in a feature branch cut from an up-to-date fork `main`.',
  '- [ ] The diff contains only this homework.',
  '- [ ] After review, merge the PR into my `main` and cut the next branch from the updated `main`.',
  '',
);

const report = `${lines.join('\n')}\n`;
const slug = String(plan.head.branch).replace(/[^a-zA-Z0-9._-]+/g, '-');
const fileStamp = stamp.replace(/[:.]/g, '-');

try {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${slug}__${fileStamp}.md`), report, 'utf8');
  writeFileSync(join(DIR, 'latest.md'), report, 'utf8');
  writeFileSync(
    join(DIR, 'verdict.json'),
    `${JSON.stringify(
      {
        verdict,
        score,
        counts,
        blockers,
        incomplete,
        head_sha: plan.head.sha,
        dirty_hash: plan.head.dirty_hash,
        base: plan.base.ref,
        branch: plan.head.branch,
        generated_at: stamp,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
} catch (e) {
  die('could not write the report', String(e));
}

process.stdout.write(report);
process.exit(verdict === 'PASS' ? 0 : 1);
