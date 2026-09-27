import { describe, expect, it, vi } from 'vitest';
import type { ConventionCandidate, Repo } from '@devdigest/shared';
import { connectedClient } from './harness.js';
import { emptyState, FakeDevDigestApi, unreachableApi } from './fake-api.js';
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

function candidate(overrides: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'c1',
    category: 'naming',
    rule: 'Use camelCase for variables.',
    evidence_path: 'src/x.ts',
    evidence_line: 12,
    evidence_snippet: 'const fooBar = 1;',
    evidence_url: null,
    confidence: 0.8,
    status: 'accepted',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

async function harness(api: import('../src/ports/devdigest-api.js').DevDigestApi) {
  return connectedClient({ api, clock: new FakeClock(), config: { webUrl: WEB_URL, runDeadlineMs: 120_000 } });
}

describe('get_conventions', () => {
  it('happy path: structuredContent + a text duplicate', async () => {
    const api = new FakeDevDigestApi({ ...emptyState(), repos: [repo()], conventions: { r1: [candidate()] } });
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/widgets' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ repo: 'acme/widgets', counts: { accepted: 1 } });
    await close();
  });

  it('repo not imported: the onward text names the web UI', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'other/repo' } });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain(WEB_URL);
    await close();
  });

  it('API down: the text names the URL and ./scripts/dev.sh', async () => {
    const api = unreachableApi('http://localhost:3001');
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/widgets' } });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('http://localhost:3001');
    expect(text).toContain('./scripts/dev.sh');
    await close();
  });

  it('invalid repo (no slash) is rejected without calling the fake', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const spy = vi.spyOn(api, 'listRepos');
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'no-slash' } });
    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    await close();
  });
});
