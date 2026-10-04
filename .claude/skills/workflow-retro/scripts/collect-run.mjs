#!/usr/bin/env node
// Collects the hard numbers of a multi-agent run from Claude Code transcripts, so the
// retro is written from evidence instead of from the orchestrator's memory.
//
// Reads (never writes) the session transcripts under ~/.claude/projects/<project-slug>/:
//   <session>.jsonl                          main conversation
//   <session>/subagents/agent-<id>.jsonl     every subagent, at any depth (flat folder)
//   <session>/subagents/agent-<id>.meta.json agentType, parentAgentId, spawnDepth, foreground/background
//
// Writes into --out (default: <os tmpdir>/workflow-retro/<session>/):
//   retro-data.json   everything below, machine-readable
//   retro-data.md     the same as tables — what the skill reads first
//   briefs/<agent>.md     the prompt each agent was given (first user message)
//   handbacks/<agent>.md  every report each agent returned (SubagentHandback calls)
//
// Usage:
//   node .claude/skills/workflow-retro/scripts/collect-run.mjs
//     [--session <id>]        default: $CLAUDE_CODE_SESSION_ID
//     [--project-dir <path>]  default: ~/.claude/projects/<cwd slug>
//     [--since <ISO time>]    only records at/after this time (a workflow inside a long session)
//     [--until <ISO time>]
//     [--out <dir>]

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';

// ---------- args ----------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i];
}

const session = args.session ?? process.env.CLAUDE_CODE_SESSION_ID;
if (!session) fail('no session id: pass --session <id> (or run inside Claude Code, which sets CLAUDE_CODE_SESSION_ID)');

const cwd = process.cwd();
const projectDir = args['project-dir'] ?? join(homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
const mainFile = join(projectDir, `${session}.jsonl`);
if (!existsSync(mainFile)) fail(`transcript not found: ${mainFile}`);
const subDir = join(projectDir, session, 'subagents');
const since = args.since ? Date.parse(args.since) : -Infinity;
const until = args.until ? Date.parse(args.until) : Infinity;
const outDir = args.out ?? join(tmpdir(), 'workflow-retro', session);
const repoRoot = norm(cwd);

// ---------- load ----------
const agents = new Map(); // id -> record
agents.set('main', analyse('main', mainFile, { agentType: 'main (orchestrator)', spawnDepth: 0 }));
if (existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((f) => f.endsWith('.jsonl'))) {
    const id = basename(f, '.jsonl').replace(/^agent-/, '');
    const metaPath = join(subDir, `agent-${id}.meta.json`);
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
    const rec = analyse(id, join(subDir, f), meta);
    if (rec.apiCalls > 0 || rec.records > 0) agents.set(id, rec);
  }
}

// parent links: meta.parentAgentId, else the agent whose Agent tool_use id matches meta.toolUseId
const byToolUse = new Map();
for (const a of agents.values()) for (const d of a.dispatches) byToolUse.set(d.toolUseId, { parent: a.id, dispatch: d });
for (const a of agents.values()) {
  if (a.id === 'main') continue;
  const link = byToolUse.get(a.meta.toolUseId);
  a.parent = a.meta.parentAgentId ?? link?.parent ?? 'main';
  a.background = a.meta.requestShape ? a.meta.requestShape === 'background' : !!link?.dispatch.background;
}

// resumes: SendMessage whose `to` names an agent id
for (const a of agents.values())
  for (const s of a.sends) {
    const target = [...agents.values()].find((x) => s.to && (s.to === x.id || s.to.startsWith(x.id) || x.id.startsWith(s.to)));
    if (target) target.resumes.push({ at: s.at, by: a.id, message: s.message });
  }

// Background children whose result never reached the agent that asked for it. A completion
// notice that lands in a DIFFERENT transcript (e.g. queued to main while a depth-1 subagent was
// the parent) is the observed failure: the work was done and paid for, then lost.
const findings = [];
for (const a of agents.values()) {
  if (a.id === 'main' || !a.background) continue;
  const parent = agents.get(a.parent);
  if (!parent) continue;
  const delivered = parent.deliveries.some((d) => d.text.includes(a.id));
  const nextHandback = parent.handbacks.find((h) => h.at >= a.start);
  if (!delivered) {
    const elsewhere = [...agents.values()].find((x) => x !== parent && x.deliveries.some((d) => d.text.includes(a.id)));
    findings.push({
      kind: 'result-not-delivered',
      agent: a.id,
      text: `${label(a)} (background) finished at ${iso(a.end)}, but its completion notice never appears in its parent ${label(parent)}'s transcript${elsewhere ? ` — it was queued to ${label(elsewhere)} instead` : ''}. Its result was not used; tokens spent: ${fmt(a.tokens.total)}.`,
    });
  } else if (nextHandback && a.end > nextHandback.at) {
    findings.push({
      kind: 'late-background-result',
      agent: a.id,
      text: `${label(a)} (background) finished ${secs(a.end - nextHandback.at)} AFTER its parent ${label(parent)} handed back — check whether the result was used. Tokens spent: ${fmt(a.tokens.total)}.`,
    });
  }
}
for (const a of agents.values()) {
  for (const e of a.enforcements)
    findings.push({ kind: 'handback-enforced', agent: a.id, text: `${label(a)}: the harness forced a handback at ${e.at} ("report has not been delivered") — the agent ended its turn without reporting (often: it stopped to wait for background children).` });
  if (a.id !== 'main' && a.handbacks.length === 0)
    findings.push({ kind: 'no-handback', agent: a.id, text: `${label(a)} never called SubagentHandback — no report reached its caller.` });
  if (a.toolErrors.length >= 3)
    findings.push({ kind: 'tool-errors', agent: a.id, text: `${label(a)}: ${a.toolErrors.length} tool errors.` });
}

// duplicated reads across agents
const readers = new Map(); // path -> Set(agent)
for (const a of agents.values()) for (const p of Object.keys(a.reads)) (readers.get(p) ?? readers.set(p, new Set()).get(p)).add(a.id);
const sharedReads = [...readers.entries()]
  .filter(([, s]) => s.size > 1)
  .map(([path, s]) => ({ path, agents: [...s].map((id) => label(agents.get(id))), total: [...s].reduce((n, id) => n + agents.get(id).reads[path], 0) }))
  .sort((x, y) => y.agents.length - x.agents.length || y.total - x.total);
const rereads = [];
for (const a of agents.values())
  for (const [path, n] of Object.entries(a.reads)) if (n >= 3) rereads.push({ agent: label(a), path, times: n });
rereads.sort((x, y) => y.times - x.times);

// ---------- totals ----------
const all = [...agents.values()];
const totals = sumTokens(all.map((a) => a.tokens));
const timeline = all
  .filter((a) => a.start !== Infinity)
  .sort((x, y) => x.start - y.start)
  .map((a) => ({ agent: label(a), id: a.id, parent: a.parent ? label(agents.get(a.parent)) : '—', depth: a.meta.spawnDepth ?? 0, mode: a.id === 'main' ? '—' : a.background ? 'background' : 'foreground', start: iso(a.start), end: iso(a.end), wall: secs(a.end - a.start), resumes: a.resumes.length }));

const data = {
  session, projectDir, window: { since: args.since ?? null, until: args.until ?? null },
  totals: { agents: all.length - 1, ...totals, wall: timeline.length ? secs(Math.max(...all.map((a) => a.end)) - Math.min(...all.map((a) => a.start))) : '0s' },
  timeline,
  agents: all.map((a) => ({
    id: a.id, label: label(a), type: a.meta.agentType, description: a.meta.description ?? null, models: [...a.models],
    apiCalls: a.apiCalls, tokens: a.tokens, peakContext: a.peakContext, cacheReadShare: share(a.tokens.cacheRead, a.tokens.input + a.tokens.cacheCreate + a.tokens.cacheRead),
    tools: a.tools, toolErrors: a.toolErrors, biggestToolResults: a.toolResults.sort((x, y) => y.chars - x.chars).slice(0, 5),
    briefChars: a.brief.length, handbacks: a.handbacks.map((h) => ({ at: h.at, chars: h.text.length })), resumes: a.resumes.map(({ message, ...r }) => ({ ...r, chars: message.length })),
    dispatches: a.dispatches.map(({ toolUseId, ...d }) => d), askUser: a.askUser,
  })),
  sharedReads: sharedReads.slice(0, 40), rereads: rereads.slice(0, 20), findings,
};

// ---------- write ----------
mkdirSync(join(outDir, 'briefs'), { recursive: true });
mkdirSync(join(outDir, 'handbacks'), { recursive: true });
writeFileSync(join(outDir, 'retro-data.json'), JSON.stringify(data, null, 2));
writeFileSync(join(outDir, 'retro-data.md'), renderMd(data));
for (const a of all) {
  if (a.id === 'main') continue;
  const name = slug(label(a));
  const resumes = a.resumes.map((r, i) => `\n## Resume #${i + 1} at ${r.at} (from ${label(agents.get(r.by))})\n\n${r.message}\n`).join('');
  writeFileSync(join(outDir, 'briefs', `${name}.md`), `# Brief — ${label(a)}\n\n${a.brief}\n${resumes}`);
  writeFileSync(join(outDir, 'handbacks', `${name}.md`), `# Handbacks — ${label(a)}\n\n${a.handbacks.map((h, i) => `## #${i + 1} at ${iso(h.at)}\n\n${h.text}`).join('\n\n') || '_none_'}\n`);
}
console.log(`workflow-retro: ${all.length - 1} subagents, ${fmt(totals.total)} tokens, ${findings.length} findings`);
console.log(`wrote ${outDir}${process.platform === 'win32' ? '\\' : '/'}retro-data.md (+ .json, briefs/, handbacks/)`);

// ================= helpers =================

function analyse(id, file, meta) {
  const rec = {
    id, meta, file, records: 0, start: Infinity, end: -Infinity, models: new Set(), apiCalls: 0,
    tokens: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, total: 0 }, peakContext: 0,
    tools: {}, toolErrors: [], toolResults: [], reads: {}, dispatches: [], sends: [], handbacks: [], enforcements: [],
    resumes: [], askUser: 0, brief: '', deliveries: [],
  };
  const lastUsage = new Map(); // message.id -> usage (streamed blocks repeat usage; the last one is final)
  const toolNames = new Map(); // tool_use id -> name
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const t = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(t) && (t < since || t > until)) continue;
    rec.records++;
    if (!Number.isNaN(t)) { rec.start = Math.min(rec.start, t); rec.end = Math.max(rec.end, t); }
    // completion notices / hand-backs of children arriving in THIS transcript (any record type)
    // (tool results are excluded: an agent grepping transcripts would otherwise "deliver" to itself)
    const isToolResult = Array.isArray(o.message?.content) && o.message.content.some((c) => c.type === 'tool_result');
    if (/<task-notification>|Subagent hand-back|<agent-message /.test(line) && o.type !== 'assistant' && !isToolResult)
      rec.deliveries.push({ at: o.timestamp, type: o.type, text: line.slice(0, 2000) });

    if (o.type === 'assistant' && o.message) {
      const m = o.message;
      if (m.model && m.model !== '<synthetic>') rec.models.add(m.model);
      if (m.usage && m.id) lastUsage.set(m.id, m.usage);
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c.type !== 'tool_use') continue;
        toolNames.set(c.id, c.name);
        rec.tools[c.name] = (rec.tools[c.name] ?? 0) + 1;
        const inp = c.input ?? {};
        if (c.name === 'Read' && inp.file_path) bump(rec.reads, rel(inp.file_path));
        if (c.name === 'Bash' && typeof inp.command === 'string' && /\b(cat|sed|head|tail|less|wc)\b/.test(inp.command))
          for (const p of inp.command.match(/[\w.:\\/\[\]-]+\.(md|mdx|ts|tsx|js|mjs|cjs|jsx|json|sql|ya?ml|html)\b/g) ?? []) bump(rec.reads, rel(p));
        if (c.name === 'Agent' || c.name === 'Task')
          rec.dispatches.push({ toolUseId: c.id, at: o.timestamp, type: inp.subagent_type ?? 'general-purpose', description: inp.description ?? '', background: inp.run_in_background !== false, briefChars: (inp.prompt ?? '').length });
        if (c.name === 'SendMessage') rec.sends.push({ at: o.timestamp, to: inp.to, message: String(inp.message ?? "") });
        if (c.name === 'SubagentHandback') rec.handbacks.push({ at: Date.parse(o.timestamp), text: String(inp.message ?? '') });
        if (c.name === 'AskUserQuestion') rec.askUser++;
      }
    }

    if (o.type === 'user' && o.message) {
      const content = o.message.content;
      if (typeof content === 'string') {
        if (!rec.brief && id !== 'main' && !content.startsWith('<system-reminder>')) rec.brief = content;
        if (content.includes('[handback-send-enforce]')) rec.enforcements.push({ at: o.timestamp });
        continue;
      }
      for (const c of Array.isArray(content) ? content : []) {
        if (c.type === 'text' && !rec.brief && id !== 'main' && !c.text.startsWith('<system-reminder>')) rec.brief = c.text;
        if (c.type === 'text' && c.text.includes('[handback-send-enforce]')) rec.enforcements.push({ at: o.timestamp });
        if (c.type !== 'tool_result') continue;
        const text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join('');
        const tool = toolNames.get(c.tool_use_id) ?? '?';
        rec.toolResults.push({ tool, chars: text.length, at: o.timestamp });
        if (c.is_error) rec.toolErrors.push({ tool, at: o.timestamp, text: text.slice(0, 200) });
      }
    }
  }
  rec.handbacks.sort((x, y) => x.at - y.at);
  rec.apiCalls = lastUsage.size;
  for (const u of lastUsage.values()) {
    const input = u.input_tokens ?? 0, cc = u.cache_creation_input_tokens ?? 0, cr = u.cache_read_input_tokens ?? 0, out = u.output_tokens ?? 0;
    rec.tokens.input += input; rec.tokens.cacheCreate += cc; rec.tokens.cacheRead += cr; rec.tokens.output += out;
    rec.peakContext = Math.max(rec.peakContext, input + cc + cr);
  }
  rec.tokens.total = rec.tokens.input + rec.tokens.cacheCreate + rec.tokens.cacheRead + rec.tokens.output;
  return rec;
}

function renderMd(d) {
  const L = [];
  L.push(`# Workflow run data — session \`${d.session}\``, '');
  if (d.window.since || d.window.until) L.push(`Window: ${d.window.since ?? '…'} → ${d.window.until ?? '…'}`, '');
  const t = d.totals;
  L.push('## Totals', '', '| Subagents | API calls | Input | Cache write | Cache read | Output | Total tokens | Wall time |', '|---|---|---|---|---|---|---|---|');
  L.push(`| ${t.agents} | ${t.apiCalls} | ${fmt(t.input)} | ${fmt(t.cacheCreate)} | ${fmt(t.cacheRead)} | ${fmt(t.output)} | ${fmt(t.total)} | ${t.wall} |`, '');
  L.push('_Total = input + cache write + cache read + output. Cache reads are billed far cheaper than fresh input; compare agents by "fresh" (input + cache write + output) when judging cost._', '');
  L.push('## Launch order', '', '| # | Agent | Parent | Depth | Mode | Start | End | Wall | Resumes |', '|---|---|---|---|---|---|---|---|---|');
  d.timeline.forEach((r, i) => L.push(`| ${i + 1} | ${r.agent} | ${r.parent} | ${r.depth} | ${r.mode} | ${r.start} | ${r.end} | ${r.wall} | ${r.resumes} |`));
  L.push('', '## Per agent', '', '| Agent | Model | API calls | Fresh tokens | Cache read | Output | Peak context | Cache-read share | Tool calls | Tool errors | Brief chars | Handbacks |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const a of d.agents) {
    const fresh = a.tokens.input + a.tokens.cacheCreate + a.tokens.output;
    const calls = Object.values(a.tools).reduce((n, x) => n + x, 0);
    L.push(`| ${a.label} | ${a.models.join(', ') || '—'} | ${a.apiCalls} | ${fmt(fresh)} | ${fmt(a.tokens.cacheRead)} | ${fmt(a.tokens.output)} | ${fmt(a.peakContext)} | ${a.cacheReadShare} | ${calls} | ${a.toolErrors.length} | ${a.id === 'main' ? '—' : fmt(a.briefChars)} | ${a.id === 'main' ? '—' : a.handbacks.length} |`);
  }
  L.push('', '## Tool mix', '');
  for (const a of d.agents) L.push(`- **${a.label}**: ${Object.entries(a.tools).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}×${v}`).join(', ') || '—'}`);
  L.push('', '## Dispatches', '');
  for (const a of d.agents) for (const x of a.dispatches) L.push(`- ${a.label} → \`${x.type}\` "${x.description}" — ${x.background ? 'background' : 'foreground'}, brief ${fmt(x.briefChars)} chars, at ${x.at}`);
  L.push('', '## Automatic findings', '');
  L.push(...(d.findings.length ? d.findings.map((f) => `- **${f.kind}** — ${f.text}`) : ['_none_']));
  L.push('', '## Files read by more than one agent', '', '_Candidates for duplicated work: could the caller have quoted the relevant lines into the brief instead?_', '');
  L.push(...(d.sharedReads.length ? d.sharedReads.map((r) => `- \`${r.path}\` — ${r.agents.join(', ')} (${r.total} reads)`) : ['_none_']));
  L.push('', '## Files re-read ≥3 times by one agent', '');
  L.push(...(d.rereads.length ? d.rereads.map((r) => `- ${r.agent}: \`${r.path}\` ×${r.times}`) : ['_none_']));
  L.push('', '## Largest tool results (context cost)', '');
  for (const a of d.agents) if (a.biggestToolResults.length) L.push(`- **${a.label}**: ${a.biggestToolResults.map((r) => `${r.tool} ${fmt(r.chars)} chars`).join(' · ')}`);
  L.push('', '## Tool errors', '');
  const errs = d.agents.flatMap((a) => a.toolErrors.map((e) => `- ${a.label} · ${e.tool} · ${e.at}: ${e.text.replace(/\s+/g, ' ')}`));
  L.push(...(errs.length ? errs : ['_none_']), '');
  return L.join('\n');
}

function label(a) {
  if (!a) return '?';
  if (a.id === 'main') return 'main';
  return `${a.meta.agentType ?? 'agent'}#${a.id.slice(0, 6)}`;
}
function sumTokens(list) {
  const t = { apiCalls: 0, input: 0, cacheCreate: 0, cacheRead: 0, output: 0, total: 0 };
  for (const x of list) for (const k of ['input', 'cacheCreate', 'cacheRead', 'output', 'total']) t[k] += x[k];
  t.apiCalls = [...agents.values()].reduce((n, a) => n + a.apiCalls, 0);
  return t;
}
function bump(o, k) { o[k] = (o[k] ?? 0) + 1; }
function norm(p) { return p.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, d) => d.toLowerCase() + ':'); }
function rel(p) { const n = norm(p); return n.toLowerCase().startsWith(repoRoot.toLowerCase() + '/') ? n.slice(repoRoot.length + 1) : n; }
function share(part, whole) { return whole ? `${Math.round((100 * part) / whole)}%` : '—'; }
function fmt(n) { return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n); }
function secs(ms) { if (!Number.isFinite(ms)) return '—'; const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`; }
function iso(ms) { return Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 19) : '—'; }
function slug(s) { return s.replace(/[^a-zA-Z0-9#-]/g, '-').replace('#', '-'); }
function fail(msg) { console.error(`workflow-retro: ${msg}`); process.exit(1); }
