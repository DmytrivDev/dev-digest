import { describe, expect, it, vi } from 'vitest';
import type { RunResult } from '../src/ports/devdigest-api.js';
import { connectedClient } from './harness.js';
import { emptyState, FakeDevDigestApi, unreachableApi } from './fake-api.js';
import { FakeClock } from './fake-clock.js';

const WEB_URL = 'http://localhost:3000';

function runResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    run: {
      run_id: 'run-1',
      agent_id: 'a1',
      agent_name: 'Reviewer',
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'done',
      error: null,
      duration_ms: 1000,
      tokens_in: 10,
      tokens_out: 10,
      cost_usd: 0.01,
      findings_count: 0,
      grounding: 'ok',
      ran_at: '2024-01-01T00:00:00Z',
      score: 90,
      blockers: 0,
    },
    pr: { id: 'p1', number: 7, repo_id: 'r1', repo_full_name: 'acme/widgets' },
    review: { verdict: 'approve', summary: 'ok', score: 90, findings: [] },
    ...overrides,
  };
}

async function harness(api: import('../src/ports/devdigest-api.js').DevDigestApi) {
  return connectedClient({ api, clock: new FakeClock(), config: { webUrl: WEB_URL, runDeadlineMs: 120_000 } });
}

describe('get_findings', () => {
  it('happy path: structuredContent + a text duplicate', async () => {
    const runId = '11111111-1111-1111-1111-111111111111';
    const api = new FakeDevDigestApi({ ...emptyState(), runResults: { [runId]: runResult({ run: { ...runResult().run, run_id: runId } }) } });
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_findings', arguments: { run_id: runId } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ status: 'done', pr: 'acme/widgets#7' });
    await close();
  });

  it('not found: the onward text names run_agent_on_pr', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await harness(api);
    const missing = '22222222-2222-2222-2222-222222222222';
    const result = await client.callTool({ name: 'get_findings', arguments: { run_id: missing } });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('run_agent_on_pr');
    await close();
  });

  it('API down: the text names the URL and ./scripts/dev.sh', async () => {
    const api = unreachableApi('http://localhost:3001');
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_findings', arguments: { run_id: '33333333-3333-3333-3333-333333333333' } });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('http://localhost:3001');
    expect(text).toContain('./scripts/dev.sh');
    await close();
  });

  it('invalid run_id is rejected without calling the fake', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const spy = vi.spyOn(api, 'runResult');
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_findings', arguments: { run_id: 'not-a-uuid' } });
    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    await close();
  });
});
