/**
 * Ring 1 — pure mappers, no I/O (D5, D8). Translate API DTOs into the tool
 * result shapes. May `import type` from `@devdigest/shared` (D8's ring-1
 * deviation: type-only, erased by esbuild, so ring 1 carries no runtime dep).
 */
import type { Agent, ConventionCandidate } from '@devdigest/shared';
import {
  MAX_AGENTS,
  MAX_CONVENTIONS,
  MAX_FINDINGS,
  MESSAGE_CLIP,
  PURPOSE_CLIP,
  RULE_CLIP,
  SUMMARY_CLIP,
  TITLE_CLIP,
  UNTRUSTED_PREFIX,
} from './limits.js';
import type {
  AgentListOutput,
  ConventionsResult,
  FindingItem,
  FindingsResult,
  RunResultReviewFinding,
  RunStatusOutput,
  VerdictOutput,
} from './results.js';

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * `RunSummary.status` is `z.string().nullable()` on the wire (the DB column
 * predates a status enum) but the executor only ever writes one of these four
 * values. An unrecognized/null status is mapped to `"running"` — the safe
 * "keep polling" reading — rather than thrown, since this is display mapping,
 * not a trust boundary.
 */
export function toRunStatus(status: string | null): RunStatusOutput {
  return status === 'done' || status === 'running' || status === 'failed' || status === 'cancelled'
    ? status
    : 'running';
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** First paragraph of `rationale` (up to a blank line), whitespace-collapsed and clipped (D5). */
function toMessage(rationale: string): string {
  const firstParagraph = rationale.split(/\n\s*\n/)[0] ?? rationale;
  return clip(collapseWhitespace(firstParagraph), MESSAGE_CLIP);
}

function toLocation(file: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${file}:${startLine}` : `${file}:${startLine}-${endLine}`;
}

// ---- list_agents --------------------------------------------------------

export function toAgentList(agents: Agent[]): AgentListOutput {
  const capped = agents.slice(0, MAX_AGENTS);
  return {
    agents: capped.map((a) => ({
      id: a.id,
      name: a.name,
      purpose: clip(collapseWhitespace(a.description), PURPOSE_CLIP),
      enabled: a.enabled,
      model: a.model,
    })),
  };
}

export function agentListToText(result: AgentListOutput): string {
  if (result.agents.length === 0) return 'No agents configured yet.';
  const lines = result.agents.map((a) => `- ${a.name} (${a.id}${a.enabled ? '' : ', disabled'}) — ${a.purpose}`);
  return [`${result.agents.length} agent(s):`, ...lines].join('\n');
}

// ---- run_agent_on_pr / get_findings ---------------------------------------

export interface ToFindingsResultInput {
  status: RunStatusOutput;
  runId: string;
  agentName: string;
  prLabel: string;
  verdict: VerdictOutput | null;
  score: number | null;
  summary: string | null;
  findings: RunResultReviewFinding[];
  url: string;
  hint?: string;
  note?: string;
  error?: string;
}

/** Sort CRITICAL first, then WARNING, then SUGGESTION; ties broken by confidence desc. */
function sortFindings(findings: RunResultReviewFinding[]): RunResultReviewFinding[] {
  return [...findings].sort((a, b) => {
    const rankDiff = (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99);
    if (rankDiff !== 0) return rankDiff;
    return b.confidence - a.confidence;
  });
}

export function toFindingsResult(input: ToFindingsResultInput): FindingsResult {
  const live = input.findings.filter((f) => f.dismissed_at === null);
  const sorted = sortFindings(live);
  const total = sorted.length;
  const capped = sorted.slice(0, MAX_FINDINGS);
  const truncated = total > MAX_FINDINGS;

  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of live) {
    if (f.severity === 'CRITICAL') counts.critical += 1;
    else if (f.severity === 'WARNING') counts.warning += 1;
    else if (f.severity === 'SUGGESTION') counts.suggestion += 1;
  }

  const findings: FindingItem[] = capped.map((f) => ({
    severity: f.severity,
    location: toLocation(f.file, f.start_line, f.end_line),
    title: clip(collapseWhitespace(f.title), TITLE_CLIP),
    message: toMessage(f.rationale),
  }));

  const result: FindingsResult = {
    status: input.status,
    run_id: input.runId,
    agent: input.agentName,
    pr: input.prLabel,
    verdict: input.verdict,
    score: input.score,
    summary: input.summary !== null ? clip(collapseWhitespace(input.summary), SUMMARY_CLIP) : null,
    counts,
    total,
    truncated,
    findings,
    trust: 'untrusted',
    url: input.url,
  };
  if (input.hint !== undefined) result.hint = input.hint;
  if (input.note !== undefined) result.note = input.note;
  if (input.error !== undefined) result.error = input.error;
  return result;
}

export function findingsResultToText(result: FindingsResult): string {
  const lines: string[] = [];
  // summary is model output too, not only findings — mark either as untrusted.
  if (result.findings.length > 0 || result.summary) lines.push(UNTRUSTED_PREFIX);
  lines.push(`${result.pr} · ${result.agent} · status: ${result.status}`);
  if (result.verdict) lines.push(`verdict: ${result.verdict}${result.score !== null ? ` (score ${result.score})` : ''}`);
  if (result.summary) lines.push(result.summary);
  lines.push(
    `${result.findings.length} of ${result.total} finding(s) shown — critical ${result.counts.critical}, warning ${result.counts.warning}, suggestion ${result.counts.suggestion}${result.truncated ? ' (truncated)' : ''}`,
  );
  for (const f of result.findings) {
    lines.push(`- [${f.severity}] ${f.location} ${f.title}: ${f.message}`);
  }
  if (result.hint) lines.push(result.hint);
  if (result.note) lines.push(result.note);
  if (result.error) lines.push(result.error);
  lines.push(result.url);
  return lines.join('\n');
}

// ---- get_conventions ---------------------------------------------------------

export function toConventions(
  candidates: ConventionCandidate[],
  repoLabel: string,
  url: string,
  hint?: string,
): ConventionsResult {
  const accepted = candidates.filter((c) => c.status === 'accepted');
  const pending = candidates.filter((c) => c.status === 'pending');
  const rejected = candidates.filter((c) => c.status === 'rejected');

  const capped = accepted.slice(0, MAX_CONVENTIONS);
  const truncated = accepted.length > MAX_CONVENTIONS;

  const result: ConventionsResult = {
    repo: repoLabel,
    conventions: capped.map((c) => ({
      category: c.category,
      rule: clip(collapseWhitespace(c.rule), RULE_CLIP),
      evidence: `${c.evidence_path}:${c.evidence_line}`,
    })),
    counts: { accepted: accepted.length, pending: pending.length, rejected: rejected.length },
    truncated,
    url,
  };
  if (hint !== undefined) result.hint = hint;
  return result;
}

export function conventionsToText(result: ConventionsResult): string {
  const lines: string[] = [];
  if (result.conventions.length > 0) lines.push(UNTRUSTED_PREFIX);
  lines.push(`${result.repo}: ${result.counts.accepted} accepted, ${result.counts.pending} pending, ${result.counts.rejected} rejected`);
  for (const c of result.conventions) {
    lines.push(`- [${c.category}] ${c.rule} (${c.evidence})`);
  }
  if (result.hint) lines.push(result.hint);
  lines.push(result.url);
  return lines.join('\n');
}
