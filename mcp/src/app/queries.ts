/**
 * Ring 3 — the four read use cases (`list_agents`, `get_findings`,
 * `get_conventions`, `get_blast_radius`). Rings 1–2 only, no SDK import
 * (onion §D8 app-no-outward).
 */
import { toAgentList, toBlastResult, toConventions, toFindingsResult, toRunStatus, type ToFindingsResultInput } from '../core/mappers.js';
import type { AgentListOutput, BlastRadiusResult, ConventionsResult, FindingsResult, VerdictOutput } from '../core/results.js';
import { ToolError } from '../core/errors.js';
import type { DevDigestApi, RunResult } from '../ports/devdigest-api.js';
import { resolveRepo, resolveRepoAndPr } from './resolve.js';

export async function listAgents(api: DevDigestApi): Promise<AgentListOutput> {
  const agents = await api.listAgents();
  return toAgentList(agents);
}

/** Shared by `get_findings` and `run_agent_on_pr` (D3/D5): a `RunResult` → the flat `FindingsResult`. */
export function findingsResultFromRunResult(
  result: RunResult,
  webUrl: string,
  extra?: { hint?: string; note?: string },
): FindingsResult {
  const prLabel = `${result.pr.repo_full_name}#${result.pr.number}`;
  const url = `${webUrl}/repos/${result.pr.repo_id}/pulls/${result.pr.number}`;
  const review = result.review;

  const input: ToFindingsResultInput = {
    status: toRunStatus(result.run.status),
    runId: result.run.run_id,
    agentName: result.run.agent_name ?? 'unknown agent',
    prLabel,
    verdict: (review?.verdict as VerdictOutput | undefined) ?? null,
    score: review?.score ?? null,
    summary: review?.summary ?? null,
    findings: review?.findings ?? [],
    url,
  };
  if (extra?.hint !== undefined) input.hint = extra.hint;
  if (extra?.note !== undefined) input.note = extra.note;
  if (result.run.error !== null && result.run.error !== undefined) input.error = result.run.error;
  return toFindingsResult(input);
}

/** `get_findings(run_id)`: status + verdict + findings in one call (D5). */
export async function getRunFindings(api: DevDigestApi, webUrl: string, runId: string): Promise<FindingsResult> {
  let result: RunResult;
  try {
    result = await api.runResult(runId);
  } catch (err) {
    if (err instanceof ToolError && err.kind === 'not_found') {
      throw new ToolError('not_found', `Run ${runId} not found — run_agent_on_pr returns a run_id.`);
    }
    throw err;
  }
  return findingsResultFromRunResult(result, webUrl);
}

/** `get_conventions(repo)`: accepted conventions + triage counts in one call (D5). */
export async function getConventions(api: DevDigestApi, webUrl: string, repoFullName: string): Promise<ConventionsResult> {
  const repo = await resolveRepo(api, webUrl, repoFullName);
  const candidates = await api.listConventions(repo.id);
  const url = `${webUrl}/repos/${repo.id}/conventions`;

  const acceptedCount = candidates.filter((c) => c.status === 'accepted').length;
  let hint: string | undefined;
  if (acceptedCount === 0) {
    const pendingCount = candidates.filter((c) => c.status === 'pending').length;
    hint =
      pendingCount > 0
        ? `No accepted conventions yet — ${pendingCount} await triage at ${url}.`
        : `No accepted conventions yet — extract conventions for this repo at ${url}.`;
  }

  return toConventions(candidates, repo.full_name, url, hint);
}

/** `get_blast_radius(repo, pr)`: resolve, one blast call, map (D5). */
export async function getBlastRadius(
  api: DevDigestApi,
  webUrl: string,
  repoFullName: string,
  number: number,
): Promise<BlastRadiusResult> {
  const { repo, pr } = await resolveRepoAndPr(api, webUrl, repoFullName, number);
  const url = `${webUrl}/repos/${repo.id}/pulls/${number}`;
  const prId = pr.id;
  if (!prId) {
    throw new ToolError(
      'bad_response',
      `PR #${number} in ${repoFullName} has no id — mcp and server are out of sync; rebuild mcp (pnpm build)`,
    );
  }

  let blast;
  try {
    blast = await api.blastRadius(prId);
  } catch (err) {
    if (err instanceof ToolError && err.kind === 'not_found') {
      throw new ToolError(
        'not_found',
        `PR #${number} not found in ${repoFullName} — open the repo's PR list in DevDigest to sync pull requests, then retry.`,
      );
    }
    throw err;
  }

  return toBlastResult(blast, `${repoFullName}#${number}`, url);
}
