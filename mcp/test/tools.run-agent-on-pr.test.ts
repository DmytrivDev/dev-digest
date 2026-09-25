import { describe, expect, it, vi } from 'vitest';
import type { Agent, PrDetail, PrMeta, Repo } from '@devdigest/shared';
import type { RunResult } from '../src/ports/devdigest-api.js';
import { runReview } from '../src/app/run-review.js';
import { connectedClient } from './harness.js';
import { emptyState, FakeApiState, FakeDevDigestApi } from './fake-api.js';
import { FakeClock } from './fake-clock.js';

const WEB_URL = 'http://localhost:3000';

function repo(): Repo {
  return {
    id: 'r1',
    workspace_id: 'w1',
    owner: 'acme',
    name: 'widgets',
    full_name: 'acme/widgets',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  };
}

function pr(): PrMeta {
  return {
    id: 'p1',
    number: 7,
    title: 'Add feature',
    author: 'octocat',
    branch: 'feat',
    base: 'main',
    head_sha: 'abc123',
    additions: 1,
    deletions: 1,
    files_count: 1,
    status: 'open',
  };
}

function prDetail(): PrDetail {
  return { ...pr(), body: null, files: [], commits: [], linked_issue: null };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    name: 'Reviewer',
    description: 'Reviews PRs.',
    provider: 'openai',
    model: 'gpt-4.1',
    system_prompt: 'You review PRs.',
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...overrides,
  };
}

function baseState(): FakeApiState {
  return {
    ...emptyState(),
    repos: [repo()],
    pulls: { r1: [pr()] },
    pullDetails: { p1: prDetail() },
    agents: [agent()],
  };
}

function runResultFor(runId: string, status: RunResult['run']['status'], overrides: Partial<RunResult> = {}): RunResult {
  return {
    run: {
      run_id: runId,
      agent_id: 'a1',
      agent_name: 'Reviewer',
      provider: 'openai',
      model: 'gpt-4.1',
      status,
      error: status === 'failed' ? 'model timed out' : null,
      duration_ms: 1000,
      tokens_in: 10,
      tokens_out: 10,
      cost_usd: 0.01,
      findings_count: 0,
      grounding: 'ok',
      ran_at: '2024-01-01T00:00:00Z',
      score: status === 'done' ? 90 : null,
      blockers: 0,
    },
    pr: { id: 'p1', number: 7, repo_id: 'r1', repo_full_name: 'acme/widgets' },
    review: status === 'done' ? { verdict: 'approve', summary: 'ok', score: 90, findings: [] } : null,
    ...overrides,
  };
}

const RUN_ID = 'fake-run-id';

function deps(api: FakeDevDigestApi, clock: FakeClock, overrides: Partial<{ deadlineMs: number; onProgress: (e: number, t: number) => void; signal: AbortSignal }> = {}) {
  return {
    api,
    clock,
    webUrl: WEB_URL,
    deadlineMs: overrides.deadlineMs ?? 120_000,
    pollMs: 3_000,
    ...(overrides.onProgress !== undefined ? { onProgress: overrides.onProgress } : {}),
    ...(overrides.signal !== undefined ? { signal: overrides.signal } : {}),
  };
}

describe('runReview (app/run-review.ts) — D8: tested directly, no MCP client', () => {
  it('(a) done within the deadline: status done, one startReview call', async () => {
    const state = baseState();
    state.runResults[RUN_ID] = runResultFor(RUN_ID, 'done');
    const api = new FakeDevDigestApi(state);
    const clock = new FakeClock();

    const result = await runReview({ repo: 'acme/widgets', pr: 7, agent: 'a1' }, deps(api, clock));
    expect(result.status).toBe('done');
    expect(api.startReviewCalls).toHaveLength(1);
  });

  it('(b) not done by the deadline: status running, run_id, and a get_findings hint', async () => {
    const state = baseState();
    state.runResults[RUN_ID] = runResultFor(RUN_ID, 'running');
    const api = new FakeDevDigestApi(state);
    const clock = new FakeClock();

    const result = await runReview({ repo: 'acme/widgets', pr: 7, agent: 'a1' }, deps(api, clock, { deadlineMs: 5_000 }));
    expect(result.status).toBe('running');
    expect(result.run_id).toBe(RUN_ID);
    expect(result.hint).toContain('get_findings');
  });

  it('(c) an active run for the same agent is reused: zero startReview calls, same run_id', async () => {
    const state = baseState();
    state.active.p1 = [{ run_id: 'existing-run', agent_id: 'a1', agent_name: 'Reviewer', ran_at: null }];
    state.runResults['existing-run'] = runResultFor('existing-run', 'done');
    const api = new FakeDevDigestApi(state);
    const clock = new FakeClock();

    const result = await runReview({ repo: 'acme/widgets', pr: 7, agent: 'a1' }, deps(api, clock));
    expect(result.run_id).toBe('existing-run');
    expect(api.startReviewCalls).toHaveLength(0);
  });

  it('(d) an unknown agent: isError (ToolError) naming list_agents, zero startReview calls', async () => {
    const api = new FakeDevDigestApi(baseState());
    const clock = new FakeClock();

    await expect(runReview({ repo: 'acme/widgets', pr: 7, agent: 'does-not-exist' }, deps(api, clock))).rejects.toMatchObject({
      kind: 'not_found',
      message: expect.stringContaining('list_agents'),
    });
    expect(api.startReviewCalls).toHaveLength(0);
  });

  it('(e) a failed run: status failed with error, resolved (not thrown)', async () => {
    const state = baseState();
    state.runResults[RUN_ID] = runResultFor(RUN_ID, 'failed');
    const api = new FakeDevDigestApi(state);
    const clock = new FakeClock();

    const result = await runReview({ repo: 'acme/widgets', pr: 7, agent: 'a1' }, deps(api, clock));
    expect(result.status).toBe('failed');
    expect(result.error).toContain('model timed out');
  });

  it('(g) startReview is called with a non-null agentId', async () => {
    const state = baseState();
    state.runResults[RUN_ID] = runResultFor(RUN_ID, 'done');
    const api = new FakeDevDigestApi(state);
    const clock = new FakeClock();

    await runReview({ repo: 'acme/widgets', pr: 7, agent: 'a1' }, deps(api, clock));
    expect(api.startReviewCalls).toEqual([{ prId: 'p1', agentId: 'a1' }]);
  });

  it('(h) an aborted signal stops polling (the fake is not polled repeatedly) and never calls any cancel', async () => {
    const state = baseState();
    state.runResults[RUN_ID] = runResultFor(RUN_ID, 'running');
    const api = new FakeDevDigestApi(state);
    const spy = vi.spyOn(api, 'runResult');
    const clock = new FakeClock();
    const controller = new AbortController();
    controller.abort();

    // 120s deadline / 3s poll would mean ~40 polls if abort were ignored.
    const result = await runReview({ repo: 'acme/widgets', pr: 7, agent: 'a1' }, deps(api, clock, { signal: controller.signal }));
    expect(result.status).toBe('running');
    expect(spy).toHaveBeenCalledTimes(1);
    // DevDigestApi has no cancel method at all — the port cannot cancel a
    // server run even if it wanted to, which is the guarantee D3 asks for.
    expect('cancelRun' in api).toBe(false);
  });
});

describe('run_agent_on_pr (MCP tool) — progress + annotations only (D8)', () => {
  it('(f) with a progressToken, the client receives at least one progress notification', async () => {
    const state = baseState();
    state.runResults[RUN_ID] = runResultFor(RUN_ID, 'running');
    const api = new FakeDevDigestApi(state);
    const clock = new FakeClock();
    const { client, close } = await connectedClient({ api, clock, config: { webUrl: WEB_URL, runDeadlineMs: 5_000 } });

    let progressCount = 0;
    await client.callTool(
      { name: 'run_agent_on_pr', arguments: { repo: 'acme/widgets', pr: 7, agent: 'a1' }, _meta: { progressToken: 'tok-1' } },
      undefined,
      { onprogress: () => { progressCount += 1; } },
    );
    expect(progressCount).toBeGreaterThanOrEqual(1);
    await close();
  });

  it('annotations match D3/D6 exactly', async () => {
    const api = new FakeDevDigestApi(baseState());
    const clock = new FakeClock();
    const { client, close } = await connectedClient({ api, clock, config: { webUrl: WEB_URL, runDeadlineMs: 120_000 } });

    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'run_agent_on_pr');
    expect(tool?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    await close();
  });
});
