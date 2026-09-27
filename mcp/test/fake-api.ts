/**
 * In-memory `DevDigestApi` (onion §2's "tests substitute it"). Every test file
 * that needs the port builds one of these instead of hitting the network.
 */
import type { Agent, BlastRadius, ConventionCandidate, PrDetail, PrMeta, Repo } from '@devdigest/shared';
import type { ActiveRun, DevDigestApi, RunResult, StartedRun } from '../src/ports/devdigest-api.js';
import { apiUnreachableText, ToolError } from '../src/core/errors.js';

export interface FakeApiState {
  repos: Repo[];
  pulls: Record<string, PrMeta[]>; // keyed by repoId
  pullDetails: Record<string, PrDetail>; // keyed by prId
  agents: Agent[];
  active: Record<string, ActiveRun[]>; // keyed by prId
  runResults: Record<string, RunResult>; // keyed by runId
  conventions: Record<string, ConventionCandidate[]>; // keyed by repoId
  blast: Record<string, BlastRadius>; // keyed by prId
}

export class FakeDevDigestApi implements DevDigestApi {
  readonly startReviewCalls: { prId: string; agentId: string }[] = [];
  private nextStartedRun: StartedRun | null = null;

  constructor(private state: FakeApiState) {}

  /** What the next `startReview` call returns (defaults to a fresh fake run). */
  setNextStartedRun(run: StartedRun): void {
    this.nextStartedRun = run;
  }

  async listRepos(): Promise<Repo[]> {
    return this.state.repos;
  }

  async listPulls(repoId: string): Promise<PrMeta[]> {
    return this.state.pulls[repoId] ?? [];
  }

  async getPull(prId: string): Promise<PrDetail> {
    const detail = this.state.pullDetails[prId];
    if (!detail) throw new ToolError('not_found', `GET /pulls/:id not found (404): ${prId}`);
    return detail;
  }

  async listAgents(): Promise<Agent[]> {
    return this.state.agents;
  }

  async activeRuns(prId: string): Promise<ActiveRun[]> {
    return this.state.active[prId] ?? [];
  }

  async startReview(prId: string, agentId: string): Promise<StartedRun[]> {
    this.startReviewCalls.push({ prId, agentId });
    const run = this.nextStartedRun ?? { run_id: 'fake-run-id', agent_id: agentId, agent_name: 'Fake Agent' };
    return [run];
  }

  async runResult(runId: string): Promise<RunResult> {
    const result = this.state.runResults[runId];
    if (!result) throw new ToolError('not_found', `GET /runs/:id/result not found (404): ${runId}`);
    return result;
  }

  async listConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.state.conventions[repoId] ?? [];
  }

  async blastRadius(prId: string): Promise<BlastRadius> {
    const blast = this.state.blast[prId];
    if (!blast) throw new ToolError('not_found', `GET /pulls/:id/blast not found (404): ${prId}`);
    return blast;
  }
}

export function emptyState(): FakeApiState {
  return {
    repos: [],
    pulls: {},
    pullDetails: {},
    agents: [],
    active: {},
    runResults: {},
    conventions: {},
    blast: {},
  };
}

/** A `DevDigestApi` whose every method rejects as if the API were unreachable. */
export function unreachableApi(url: string): DevDigestApi {
  const fail = () => Promise.reject(new ToolError('api_unreachable', apiUnreachableText(url)));
  return {
    listRepos: fail,
    listPulls: fail,
    getPull: fail,
    listAgents: fail,
    activeRuns: fail,
    startReview: fail,
    runResult: fail,
    listConventions: fail,
    blastRadius: fail,
  };
}
