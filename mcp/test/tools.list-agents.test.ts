import { describe, expect, it } from 'vitest';
import type { Agent } from '@devdigest/shared';
import { connectedClient } from './harness.js';
import { emptyState, FakeDevDigestApi, unreachableApi } from './fake-api.js';
import { FakeClock } from './fake-clock.js';

const WEB_URL = 'http://localhost:3000';

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

describe('list_agents', () => {
  it('happy path: structuredContent + a text duplicate', async () => {
    const api = new FakeDevDigestApi({ ...emptyState(), agents: [agent()] });
    const { client, close } = await connectedClient({
      api,
      clock: new FakeClock(),
      config: { webUrl: WEB_URL, runDeadlineMs: 120_000 },
    });
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ agents: [{ id: 'a1', name: 'Reviewer' }] });
    expect(Array.isArray(result.content)).toBe(true);
    await close();
  });

  it('API down: the text names the URL and ./scripts/dev.sh', async () => {
    const api = unreachableApi('http://localhost:3001');
    const { client, close } = await connectedClient({
      api,
      clock: new FakeClock(),
      config: { webUrl: WEB_URL, runDeadlineMs: 120_000 },
    });
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('http://localhost:3001');
    expect(text).toContain('./scripts/dev.sh');
    await close();
  });
});
