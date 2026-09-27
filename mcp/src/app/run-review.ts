/**
 * Ring 3 — D3 in full: resolve → hydrate → validate agent → reuse-or-start →
 * wait → map. No SDK import (onion §D8 app-no-outward); progress and
 * cancellation arrive as a plain callback + `AbortSignal` so this is testable
 * without an MCP client and reusable by a future CLI/CI runner.
 */
import { RUN_STILL_RUNNING_HINT } from '../core/limits.js';
import { toRunStatus } from '../core/mappers.js';
import type { FindingsResult } from '../core/results.js';
import { ToolError } from '../core/errors.js';
import type { Clock } from '../ports/clock.js';
import type { DevDigestApi } from '../ports/devdigest-api.js';
import { findingsResultFromRunResult } from './queries.js';
import { resolveRepoAndPr } from './resolve.js';

export interface RunReviewInput {
  repo: string;
  pr: number;
  agent: string;
}

export interface RunReviewDeps {
  api: DevDigestApi;
  clock: Clock;
  webUrl: string;
  /** Total wait budget for this call (already clamped per D3/D7). */
  deadlineMs: number;
  pollMs: number;
  onProgress?: (elapsedS: number, totalS: number) => void;
  signal?: AbortSignal;
}

/** D1 step 3: `GET /pulls/:id` writes `pr_files`, which the review falls back to
 *  when there is no clone diff — skipping it can review an empty diff. */
async function hydratePr(api: DevDigestApi, prId: string): Promise<void> {
  await api.getPull(prId);
}

export async function runReview(input: RunReviewInput, deps: RunReviewDeps): Promise<FindingsResult> {
  const { pr } = await resolveRepoAndPr(deps.api, deps.webUrl, input.repo, input.pr);
  const prId = pr.id;
  if (!prId) {
    throw new ToolError('bad_response', `PR #${input.pr} in ${input.repo} has no id — mcp and server are out of sync; rebuild mcp (pnpm build)`);
  }
  await hydratePr(deps.api, prId);

  const agents = await deps.api.listAgents();
  const agent =
    agents.find((a) => a.id === input.agent) ??
    agents.find((a) => a.name.toLowerCase() === input.agent.toLowerCase());
  if (!agent) {
    throw new ToolError('not_found', `Agent '${input.agent}' not found — call list_agents for valid ids.`);
  }

  const active = await deps.api.activeRuns(prId);
  const notes: string[] = [];
  if (!agent.enabled) notes.push(`Agent '${agent.name}' is running while disabled (enabled:false).`);

  const sameAgentActive = active.find((a) => a.agent_id === agent.id);
  let runId: string;
  if (sameAgentActive) {
    runId = sameAgentActive.run_id;
  } else {
    const others = active.filter((a) => a.agent_id !== agent.id);
    if (others.length > 0) {
      const names = others.map((a) => a.agent_name ?? a.agent_id ?? 'unknown').join(', ');
      notes.push(`Other agent run(s) already active on this PR: ${names}.`);
    }
    const started = await deps.api.startReview(prId, agent.id);
    const first = started[0];
    if (!first) {
      throw new ToolError('bad_response', 'POST /pulls/:id/review returned no runs — mcp and server are out of sync; rebuild mcp (pnpm build)');
    }
    runId = first.run_id;
  }
  const note = notes.length > 0 ? notes.join(' ') : undefined;

  const startedAt = deps.clock.now();
  const deadlineAt = startedAt + deps.deadlineMs;
  const totalS = Math.round(deps.deadlineMs / 1000);

  while (true) {
    const elapsedS = Math.round((deps.clock.now() - startedAt) / 1000);
    deps.onProgress?.(elapsedS, totalS);

    const result = await deps.api.runResult(runId);
    if (toRunStatus(result.run.status) !== 'running') {
      const extra = note !== undefined ? { note } : {};
      return findingsResultFromRunResult(result, deps.webUrl, extra);
    }

    const now = deps.clock.now();
    if (now >= deadlineAt) {
      return findingsResultFromRunResult(result, deps.webUrl, { hint: RUN_STILL_RUNNING_HINT, ...(note !== undefined ? { note } : {}) });
    }
    if (deps.signal?.aborted) {
      const extra = note !== undefined ? { note } : {};
      return findingsResultFromRunResult(result, deps.webUrl, extra);
    }

    await deps.clock.sleep(Math.min(deps.pollMs, deadlineAt - now), deps.signal);
  }
}
