import { describe, expect, it } from 'vitest';
import type { LLMProvider, StructuredRequest } from '@devdigest/shared';
import { MockGitClient } from '../src/adapters/mocks.js';
import { BriefService, type BriefDeps } from '../src/modules/brief/service.js';
import type { BriefPullRef, BriefRepository } from '../src/modules/brief/repository.js';
import type { AgentDocs } from '../src/modules/brief/types.js';

/**
 * The spec-document input of a brief (AC-55, AC-56), without a database: the agents come
 * through the injected `enabledAgentDocs` (F1) and every document is read through the same
 * gate as the project-context run path — `readFileBytes` + `decodeDoc` (F11).
 */

const WORKSPACE = 'ws-1';
const PULL: BriefPullRef = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Add a thing',
  body: null,
  headSha: 'abc123',
  filesCount: 1,
  owner: 'o',
  name: 'n',
  clonePath: '/mock/clone',
};

const repo = {
  pullInWorkspace: async () => PULL,
  files: async () => [{ path: 'src/a.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n x\n+y' }],
  intent: async () => null,
  saveBrief: async () => undefined,
} as unknown as BriefRepository;

function setup(opts: { agents: AgentDocs[]; git: MockGitClient }) {
  const prompts: string[] = [];
  const asked: Array<[string, string]> = [];
  const llm = {
    id: 'openai',
    completeStructured: async (req: StructuredRequest<unknown>) => {
      prompts.push(req.messages.map((m) => m.content).join('\n'));
      return {
        data: { summary: 's', risks: [], review_focus: [] },
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: null,
        raw: '',
        attempts: 1,
      };
    },
  } as unknown as LLMProvider;
  const deps: BriefDeps = {
    repo,
    git: opts.git,
    enabledAgentDocs: async (ws, repoId) => {
      asked.push([ws, repoId]);
      return opts.agents;
    },
    github: async () => {
      throw new Error('no github');
    },
    repoIntel: {
      getBlastRadius: async () => {
        throw new Error('no index');
      },
    },
    resolveModel: async () => ({ provider: 'openai', model: 'm' }),
    llm: async () => llm,
    countTokens: (s) => Math.ceil(s.length / 4),
    systemPrompt: async () => 'SYS',
    log: { info: () => undefined },
    inFlight: new Set<string>(),
  };
  return { service: new BriefService(deps), prompts, asked };
}

const agent = (...paths: string[]): AgentDocs => ({ agentName: 'a', own: paths, linked: [] });
const specsInput = async (s: ReturnType<typeof setup>) => {
  const res = await s.service.generate(WORKSPACE, PULL.id);
  return res!.brief!.inputs.find((i) => i.source === 'specs');
};

describe('spec documents (AC-55, AC-56)', () => {
  it('asks the injected reader for the workspace and repo, and reads the attached document', async () => {
    const s = setup({
      agents: [agent('docs/ok.md')],
      git: new MockGitClient({ docs: { 'docs/ok.md': 'THE-SPEC-BODY' } }),
    });
    expect(await specsInput(s)).toEqual({ source: 'specs', status: 'used' });
    expect(s.asked).toEqual([[WORKSPACE, PULL.repoId]]);
    expect(s.prompts[0]).toContain('THE-SPEC-BODY');
  });

  it('skips a document the project-context gate rejects: binary, invalid UTF-8, outside the clone', async () => {
    const s = setup({
      agents: [agent('docs/bin.md', 'docs/bad.md', 'docs/link.md', 'docs/ok.md')],
      git: new MockGitClient({
        docs: {
          'docs/bin.md': new Uint8Array([0x41, 0x00, 0x42]),
          'docs/bad.md': new Uint8Array([0xff, 0xfe, 0xfd]),
          'docs/link.md': 'SYMLINK-TARGET-CONTENT',
          'docs/ok.md': 'GOOD-DOC',
        },
        outside: ['docs/link.md'],
      }),
    });
    expect(await specsInput(s)).toEqual({ source: 'specs', status: 'used' });
    const prompt = s.prompts[0]!;
    expect(prompt).toContain('GOOD-DOC');
    expect(prompt).not.toContain('SYMLINK-TARGET-CONTENT');
    expect(prompt).not.toContain('docs/bin.md');
    expect(prompt).not.toContain('docs/bad.md');
  });

  it('every attached document rejected → missing / clone_unavailable', async () => {
    const s = setup({
      agents: [agent('docs/bin.md', 'docs/link.md')],
      git: new MockGitClient({
        docs: { 'docs/bin.md': new Uint8Array([0, 1, 2]), 'docs/link.md': 'x' },
        outside: ['docs/link.md'],
      }),
    });
    expect(await specsInput(s)).toEqual({ source: 'specs', status: 'missing', reason: 'clone_unavailable' });
  });

  it('no clone on disk → missing / clone_unavailable; no attachments → missing / none_attached', async () => {
    const gone = setup({ agents: [agent('docs/ok.md')], git: new MockGitClient({ notCloned: true }) });
    expect(await specsInput(gone)).toEqual({ source: 'specs', status: 'missing', reason: 'clone_unavailable' });
    const none = setup({ agents: [agent()], git: new MockGitClient() });
    expect(await specsInput(none)).toEqual({ source: 'specs', status: 'missing', reason: 'none_attached' });
  });
});
