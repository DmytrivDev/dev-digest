/**
 * Ring 4 — the only file that knows this port's `DevDigestApi` methods are
 * actually HTTP. `safeParse`s every response with the shared server contracts
 * (D4's "shared schemas are used only to safeParse API responses" rule); the
 * parts `GET /runs/:id/result` composes that are NOT in `@devdigest/shared`
 * (D2) get a small local schema, built from the same shared pieces.
 */
import { z } from 'zod';
import { Agent, BlastRadius, ConventionCandidate, Finding, PrDetail, PrMeta, Repo, RunSummary, Verdict } from '@devdigest/shared';
import type { Config } from './config.js';
import { apiErrorText, apiUnreachableText, badResponseText, rateLimitedText, ToolError } from '../core/errors.js';
import { API_ERROR_MESSAGE_CLIP } from '../core/limits.js';
import type { ActiveRun, DevDigestApi, RunResult, StartedRun } from '../ports/devdigest-api.js';

// ---- local response schemas (D2/D4: not in @devdigest/shared) -------------

const ActiveRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  ran_at: z.string().nullable(),
});

const StartedRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});

const StartReviewResponseSchema = z.object({
  pr_id: z.string(),
  runs: z.array(StartedRunSchema),
});

const RunResultFindingSchema = Finding.extend({ dismissed_at: z.string().nullable() });

const RunResultReviewSchema = z.object({
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  findings: z.array(RunResultFindingSchema),
});

const RunResultPrSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  repo_id: z.string(),
  repo_full_name: z.string(),
});

const RunResultSchema = z.object({
  run: RunSummary,
  pr: RunResultPrSchema,
  review: RunResultReviewSchema.nullable(),
});

const ConventionsResponseSchema = z.object({ candidates: z.array(ConventionCandidate) });

// ---- fetch plumbing ---------------------------------------------------------

interface RequestOpts {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs: number;
  endpointLabel: string;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/** `TypeError` (connection refused / DNS) and an aborted timeout both mean "API not reachable". */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || isAbortError(err);
}

export class HttpDevDigestApi implements DevDigestApi {
  constructor(private readonly config: Pick<Config, 'apiUrl' | 'fetchTimeoutMs' | 'syncFetchTimeoutMs'>) {}

  private async request<S extends z.ZodType>(path: string, schema: S, opts: RequestOpts): Promise<z.infer<S>> {
    const url = `${this.config.apiUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      if (isNetworkError(err)) {
        throw new ToolError('api_unreachable', apiUnreachableText(this.config.apiUrl));
      }
      throw err;
    }

    if (res.status === 404) {
      throw new ToolError('not_found', `${opts.endpointLabel} not found (404)`);
    }
    if (res.status === 429) {
      throw new ToolError('rate_limited', rateLimitedText());
    }
    if (!res.ok) {
      const body = await safeJson(res);
      const code = isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string' ? body.error.code : 'error';
      const message =
        isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
          ? body.error.message
          : res.statusText;
      throw new ToolError('api_error', apiErrorText(res.status, code, message, API_ERROR_MESSAGE_CLIP));
    }

    const json = await safeJson(res);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ToolError('bad_response', badResponseText(opts.endpointLabel));
    }
    return parsed.data;
  }

  listRepos(): Promise<Repo[]> {
    return this.request('/repos', z.array(Repo), {
      timeoutMs: this.config.fetchTimeoutMs,
      endpointLabel: 'GET /repos',
    });
  }

  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request(`/repos/${repoId}/pulls`, z.array(PrMeta), {
      timeoutMs: this.config.syncFetchTimeoutMs,
      endpointLabel: 'GET /repos/:id/pulls',
    });
  }

  getPull(prId: string): Promise<PrDetail> {
    return this.request(`/pulls/${prId}`, PrDetail, {
      timeoutMs: this.config.syncFetchTimeoutMs,
      endpointLabel: 'GET /pulls/:id',
    });
  }

  listAgents(): Promise<Agent[]> {
    return this.request('/agents', z.array(Agent), {
      timeoutMs: this.config.fetchTimeoutMs,
      endpointLabel: 'GET /agents',
    });
  }

  activeRuns(prId: string): Promise<ActiveRun[]> {
    return this.request(`/pulls/${prId}/runs/active`, z.array(ActiveRunSchema), {
      timeoutMs: this.config.fetchTimeoutMs,
      endpointLabel: 'GET /pulls/:id/runs/active',
    });
  }

  async startReview(prId: string, agentId: string): Promise<StartedRun[]> {
    const result = await this.request(`/pulls/${prId}/review`, StartReviewResponseSchema, {
      method: 'POST',
      body: { agentId },
      timeoutMs: this.config.fetchTimeoutMs,
      endpointLabel: 'POST /pulls/:id/review',
    });
    return result.runs;
  }

  runResult(runId: string): Promise<RunResult> {
    return this.request(`/runs/${runId}/result`, RunResultSchema, {
      timeoutMs: this.config.fetchTimeoutMs,
      endpointLabel: 'GET /runs/:id/result',
    });
  }

  async listConventions(repoId: string): Promise<ConventionCandidate[]> {
    const result = await this.request(`/repos/${repoId}/conventions`, ConventionsResponseSchema, {
      timeoutMs: this.config.fetchTimeoutMs,
      endpointLabel: 'GET /repos/:id/conventions',
    });
    return result.candidates;
  }

  blastRadius(prId: string): Promise<BlastRadius> {
    // The route may make one GitHub call when pr_files is empty — use the
    // longer sync timeout, same reasoning as GET /pulls/:id.
    return this.request(`/pulls/${prId}/blast`, BlastRadius, {
      timeoutMs: this.config.syncFetchTimeoutMs,
      endpointLabel: 'GET /pulls/:id/blast',
    });
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
