import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../src/adapters/mocks.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type {
  ContextRepoRef,
  LinkedSkillDocs,
  ProjectContextRepository,
} from '../src/modules/project-context/repository.js';

/**
 * `resolveForRun` — the pure orchestration half of run-time injection (W9),
 * driven with a fake repository and the MockGitClient: no DB, no network.
 */

const AGENT = 'agent-1';
const WORKSPACE = 'ws-1';

const cloned: ContextRepoRef = { id: 'repo-1', owner: 'acme', name: 'api', clonePath: '/clones/acme/api' };

interface FakeData {
  agentExists?: boolean;
  own?: string[];
  linked?: LinkedSkillDocs[];
  /** Make every repository read reject. */
  fail?: Error;
}

function fakeRepo(data: FakeData = {}) {
  const asked: { agentPaths: string[]; linked: string[] } = { agentPaths: [], linked: [] };
  const repo = {
    async agentInWorkspace() {
      if (data.fail) throw data.fail;
      return data.agentExists === false ? undefined : { id: AGENT, name: 'A' };
    },
    async agentPaths(_agentId: string, repoId: string) {
      asked.agentPaths.push(repoId);
      return data.own ?? [];
    },
    async linkedSkillPaths(_agentId: string, repoId: string) {
      asked.linked.push(repoId);
      return data.linked ?? [];
    },
  } as unknown as ProjectContextRepository;
  return { repo, asked };
}

function setup(
  data: FakeData,
  git: MockGitClient,
  repoRef: ContextRepoRef = cloned,
  prBase = 'main',
) {
  const { repo, asked } = fakeRepo(data);
  const service = new ProjectContextService({ repo, git });
  return {
    asked,
    run: () => service.resolveForRun({ workspaceId: WORKSPACE, agentId: AGENT, repo: repoRef, prBase }),
  };
}

const skill = (id: string, enabled: boolean, paths: string[]): LinkedSkillDocs => ({
  id,
  name: id,
  enabled,
  paths,
});

describe('ProjectContextService.resolveForRun (W9)', () => {
  it('orders agent paths, then enabled linked skills in link order, dropping duplicates and disabled skills (AC-47..AC-49)', async () => {
    const git = new MockGitClient({
      docs: { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C', 'd.md': 'D', 'off.md': 'OFF' },
    });
    const { run } = setup(
      {
        own: ['a.md', 'b.md'],
        linked: [
          skill('s1', true, ['b.md', 'c.md']),
          skill('off', false, ['off.md']),
          skill('s2', true, ['c.md', 'd.md']),
        ],
      },
      git,
    );
    const out = await run();
    expect(out.docs.map((d) => d.path)).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
    expect(out.docs.map((d) => d.content)).toEqual(['A', 'B', 'C', 'D']);
    expect(out.lines).toContain('project context: 4 document(s) attached, 0 skipped');
  });

  it('asks the repository for the PR repo only (AC-46)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' } });
    const { run, asked } = setup({ own: ['a.md'] }, git);
    await run();
    expect(asked).toEqual({ agentPaths: ['repo-1'], linked: ['repo-1'] });
  });

  it('logs the checkout line with branch and clone HEAD (AC-51) and keeps the text in full (AC-55)', async () => {
    const big = 'x'.repeat(200 * 1024);
    const git = new MockGitClient({ docs: { 'big.md': big }, branch: 'main', head: 'abc123' });
    const { run } = setup({ own: ['big.md'] }, git);
    const out = await run();
    expect(out.lines[0]).toBe('project context: read from clone checkout main @ abc123');
    expect(out.docs[0]!.content).toBe(big);
  });

  it('logs one exact skip line per reason and counts them in the summary (AC-56..AC-58, AC-61)', async () => {
    const git = new MockGitClient({
      docs: {
        'ok.md': 'fine',
        'bin.md': new Uint8Array([0x68, 0x00, 0x69]),
        'bad.md': new Uint8Array([0xff, 0xfe, 0xfd]),
        'link.md': 'secret',
      },
      outside: ['link.md'],
    });
    const { run } = setup({ own: ['ok.md', 'gone.md', 'bin.md', 'bad.md', 'link.md'] }, git);
    const out = await run();
    expect(out.docs.map((d) => d.path)).toEqual(['ok.md']);
    expect(out.lines).toContain('project context: skipped gone.md — missing');
    expect(out.lines).toContain('project context: skipped bin.md — unreadable');
    expect(out.lines).toContain('project context: skipped bad.md — unreadable');
    expect(out.lines).toContain('project context: skipped link.md — outside_clone');
    expect(out.lines[out.lines.length - 1]).toBe('project context: 1 document(s) attached, 4 skipped');
  });

  it('a clone_path of null logs the not-cloned lines and injects nothing (AC-59)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' } });
    const { run } = setup({ own: ['a.md', 'b.md'] }, git, { ...cloned, clonePath: null });
    expect(await run()).toEqual({
      docs: [],
      lines: [
        'project context: skipped — repository not cloned',
        'project context: 0 document(s) attached, 2 skipped',
      ],
    });
  });

  it('a clone directory that is gone is "not cloned" too (AC-59)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' }, notCloned: true });
    const { run } = setup({ own: ['a.md'] }, git);
    const out = await run();
    expect(out.docs).toEqual([]);
    expect(out.lines[0]).toBe('project context: skipped — repository not cloned');
  });

  describe('base branch comparison (AC-74)', () => {
    const MISMATCH = (base: string, branch: string) =>
      `project context: base branch ${base} differs from clone branch ${branch} — documents read from ${branch}`;

    it('logs the exact line for base release/1.x against branch main and still reads the docs', async () => {
      const git = new MockGitClient({ docs: { 'a.md': 'A' }, branch: 'main' });
      const out = await setup({ own: ['a.md'] }, git, cloned, 'release/1.x').run();
      expect(out.lines).toContain(MISMATCH('release/1.x', 'main'));
      expect(out.docs).toEqual([{ path: 'a.md', content: 'A' }]);
    });

    it('logs nothing when the base equals the clone branch', async () => {
      const git = new MockGitClient({ docs: { 'a.md': 'A' }, branch: 'main' });
      const out = await setup({ own: ['a.md'] }, git, cloned, 'main').run();
      expect(out.lines.some((l) => l.includes('differs from clone branch'))).toBe(false);
    });

    it('names the clone branch (master), not any stored default branch', async () => {
      const git = new MockGitClient({ docs: { 'a.md': 'A' }, branch: 'master' });
      const out = await setup({ own: ['a.md'] }, git, cloned, 'main').run();
      expect(out.lines).toContain(MISMATCH('main', 'master'));
    });
  });

  it('zero attachments: no lines, no docs, and the clone is not touched (A-1)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' } });
    let touched = 0;
    git.currentBranch = async () => {
      touched += 1;
      return 'main';
    };
    const { run } = setup({ own: [], linked: [skill('s', true, [])] }, git);
    expect(await run()).toEqual({ docs: [], lines: [] });
    expect(touched).toBe(0);
  });

  it('an agent outside the workspace resolves to nothing (AC-69)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' } });
    const { run } = setup({ agentExists: false, own: ['a.md'] }, git);
    expect(await run()).toEqual({ docs: [], lines: [] });
  });

  it('never rethrows: a repository failure becomes one skipped line (AC-60)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' } });
    const { run } = setup({ fail: new Error('db down') }, git);
    await expect(run()).resolves.toEqual({
      docs: [],
      lines: ['project context: skipped — db down'],
    });
  });

  it('never rethrows: an unexpected git failure still resolves (AC-60)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' } });
    git.readFileBytes = async () => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    };
    const out = await setup({ own: ['a.md'] }, git).run();
    expect(out.docs).toEqual([]);
    expect(out.lines).toContain('project context: skipped a.md — unreadable');
    expect(out.lines[out.lines.length - 1]).toBe('project context: 0 document(s) attached, 1 skipped');
  });

  it('an unknown HEAD or branch degrades to "unknown" without failing (A-6)', async () => {
    const git = new MockGitClient({ docs: { 'a.md': 'A' } });
    git.currentHead = async () => {
      throw new Error('no head');
    };
    git.currentBranch = async () => {
      throw new Error('detached weirdness');
    };
    const out = await setup({ own: ['a.md'] }, git, cloned, 'release/1.x').run();
    expect(out.lines[0]).toBe('project context: read from clone checkout unknown @ unknown');
    expect(out.lines.some((l) => l.includes('differs from clone branch'))).toBe(false);
    expect(out.docs).toEqual([{ path: 'a.md', content: 'A' }]);
  });
});
