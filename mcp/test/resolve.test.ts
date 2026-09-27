import { describe, expect, it } from 'vitest';
import type { PrMeta, Repo } from '@devdigest/shared';
import { resolvePr, resolveRepo } from '../src/app/resolve.js';
import { ToolError } from '../src/core/errors.js';
import { emptyState, FakeDevDigestApi } from './fake-api.js';

function repo(overrides: Partial<Repo> = {}): Repo {
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
    ...overrides,
  };
}

function pr(overrides: Partial<PrMeta> = {}): PrMeta {
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
    ...overrides,
  };
}

describe('resolveRepo', () => {
  it('matches full_name case-insensitively', async () => {
    const api = new FakeDevDigestApi({ ...emptyState(), repos: [repo()] });
    const found = await resolveRepo(api, 'http://localhost:3000', 'ACME/Widgets');
    expect(found.id).toBe('r1');
  });

  it('on a miss, lists up to 5 imported repos and points at the web UI', async () => {
    const api = new FakeDevDigestApi({ ...emptyState(), repos: [repo()] });
    const err = (await resolveRepo(api, 'http://localhost:3000', 'other/repo').catch((e) => e)) as ToolError;
    expect(err).toBeInstanceOf(ToolError);
    expect(err.kind).toBe('not_found');
    expect(err.message).toContain('acme/widgets');
    expect(err.message).toContain('http://localhost:3000');
  });
});

describe('resolvePr', () => {
  it('matches by number', async () => {
    const api = new FakeDevDigestApi({ ...emptyState(), pulls: { r1: [pr()] } });
    const found = await resolvePr(api, 'r1', 'acme/widgets', 7);
    expect(found.number).toBe(7);
  });

  it('on a miss, names the repo and tells the caller to sync', async () => {
    const api = new FakeDevDigestApi({ ...emptyState(), pulls: { r1: [pr()] } });
    const err = (await resolvePr(api, 'r1', 'acme/widgets', 999).catch((e) => e)) as ToolError;
    expect(err).toBeInstanceOf(ToolError);
    expect(err.kind).toBe('not_found');
    expect(err.message).toContain('#999');
    expect(err.message).toContain('acme/widgets');
  });
});
