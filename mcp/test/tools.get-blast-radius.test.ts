import { describe, expect, it } from 'vitest';
import type { BlastRadius, PrMeta, Repo } from '@devdigest/shared';
import { connectedClient } from './harness.js';
import { emptyState, FakeDevDigestApi } from './fake-api.js';
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

function blast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'rateLimit',
        callers: [{ name: 'publicRouter', file: 'a.ts', line: 23 }],
        endpoints_affected: ['GET /x'],
        crons_affected: [],
      },
    ],
    summary: '1 symbol changed → 1 caller, 1 endpoint, 0 crons',
    counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
    ...overrides,
  };
}

async function harness(api: import('../src/ports/devdigest-api.js').DevDigestApi) {
  return connectedClient({ api, clock: new FakeClock(), config: { webUrl: WEB_URL, runDeadlineMs: 120_000 } });
}

describe('get_blast_radius', () => {
  it('a resolved PR → structuredContent.counts equals the fake\'s, a caller string, untrusted-prefixed text', async () => {
    const api = new FakeDevDigestApi({
      ...emptyState(),
      repos: [repo()],
      pulls: { r1: [pr()] },
      blast: { p1: blast() },
    });
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/widgets', pr: 7 } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 } });
    const structured = result.structuredContent as { symbols: { callers: string[] }[] };
    expect(structured.symbols[0]!.callers[0]).toBe('a.ts:23 publicRouter');
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text.startsWith('Untrusted repository/model content')).toBe(true);
    await close();
  });

  it('more than 5 callers → more_callers > 0 and truncated: true', async () => {
    const manyCallers = Array.from({ length: 7 }, (_, i) => ({
      name: `caller${i}`,
      file: `f${i}.ts`,
      line: i + 1,
    }));
    const api = new FakeDevDigestApi({
      ...emptyState(),
      repos: [repo()],
      pulls: { r1: [pr()] },
      blast: {
        p1: blast({
          downstream: [
            { symbol: 'rateLimit', callers: manyCallers, endpoints_affected: [], crons_affected: [] },
          ],
          counts: { symbols: 1, callers: 7, endpoints: 0, crons: 0 },
        }),
      },
    });
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/widgets', pr: 7 } });
    const structured = result.structuredContent as {
      truncated: boolean;
      symbols: { more_callers: number }[];
    };
    expect(structured.symbols[0]!.more_callers).toBeGreaterThan(0);
    expect(structured.truncated).toBe(true);
    await close();
  });

  it('degraded with index_partial → a hint containing "resync"', async () => {
    const api = new FakeDevDigestApi({
      ...emptyState(),
      repos: [repo()],
      pulls: { r1: [pr()] },
      blast: { p1: blast({ degraded: true, reason: 'index_partial', index_status: 'partial' }) },
    });
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/widgets', pr: 7 } });
    const structured = result.structuredContent as { hint?: string };
    expect(structured.hint?.toLowerCase()).toContain('resync');
    await close();
  });

  it('an unknown PR number → isError with text containing "PR #"', async () => {
    const api = new FakeDevDigestApi({ ...emptyState(), repos: [repo()], pulls: { r1: [] } });
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/widgets', pr: 99 } });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('PR #');
    await close();
  });

  it('invalid args are rejected', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await harness(api);
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'no-slash', pr: 7 } });
    expect(result.isError).toBe(true);
    await close();
  });
});
