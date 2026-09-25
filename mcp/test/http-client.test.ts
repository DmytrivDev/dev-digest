import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HttpDevDigestApi } from '../src/adapters/http-client.js';
import { ToolError } from '../src/core/errors.js';

const CONFIG = { apiUrl: 'http://localhost:3001', fetchTimeoutMs: 5000, syncFetchTimeoutMs: 5000 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('HttpDevDigestApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path: parses a valid /repos response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        {
          id: 'r1',
          workspace_id: 'w1',
          owner: 'acme',
          name: 'widgets',
          full_name: 'acme/widgets',
          default_branch: 'main',
          clone_path: null,
          last_polled_at: null,
          created_by: null,
        },
      ]),
    );
    const api = new HttpDevDigestApi(CONFIG);
    const repos = await api.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]?.full_name).toBe('acme/widgets');
  });

  it('404 becomes a not_found ToolError', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const api = new HttpDevDigestApi(CONFIG);
    await expect(api.runResult('missing-run')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('429 becomes a rate_limited ToolError naming the wait', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    const api = new HttpDevDigestApi(CONFIG);
    const err = await api.listAgents().catch((e) => e as ToolError);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).kind).toBe('rate_limited');
    expect((err as ToolError).message).toMatch(/wait a minute/);
  });

  it('500 becomes an api_error ToolError with a clipped message, no stack frames', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { code: 'internal', message: 'x'.repeat(400) } }));
    const api = new HttpDevDigestApi(CONFIG);
    const err = (await api.listAgents().catch((e) => e)) as ToolError;
    expect(err.kind).toBe('api_error');
    expect(err.message).not.toMatch(/ at /);
    expect(err.message.length).toBeLessThan(300);
  });

  it('connection refused becomes api_unreachable naming the URL and ./scripts/dev.sh', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    const api = new HttpDevDigestApi(CONFIG);
    const err = (await api.listAgents().catch((e) => e)) as ToolError;
    expect(err.kind).toBe('api_unreachable');
    expect(err.message).toContain(CONFIG.apiUrl);
    expect(err.message).toContain('./scripts/dev.sh');
  });

  it('a malformed body becomes a bad_response ToolError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { not: 'a repo list' }));
    const api = new HttpDevDigestApi(CONFIG);
    const err = (await api.listRepos().catch((e) => e)) as ToolError;
    expect(err.kind).toBe('bad_response');
    expect(err.message).toContain('rebuild mcp');
  });
});
