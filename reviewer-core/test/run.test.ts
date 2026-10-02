import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult, UnifiedDiff } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  describe('Project Context specs reach every LLM call (AC-63)', () => {
    const specs = [
      { path: 'specs/a.md', content: '# A\nalpha body' },
      { path: 'docs/b.md', content: '# B\nbeta body' },
    ];

    function recordingLlm(userMessages: string[]): LLMProvider {
      return {
        id: 'openrouter',
        async completeStructured<T>(req): Promise<StructuredResult<T>> {
          userMessages.push(req.messages.find((m) => m.role === 'user')!.content);
          return {
            data: { verdict: 'approve', summary: 'ok', score: 100, findings: [] } as unknown as T,
            model: req.model,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: 0,
            raw: '',
            attempts: 1,
          };
        },
        async listModels() {
          return [];
        },
        async complete() {
          throw new Error('not used');
        },
        async embed() {
          return [];
        },
      };
    }

    // Two-file diff (distinct paths) so map-reduce yields 2 calls.
    function twoFileDiff(): UnifiedDiff {
      const raw = [
        'diff --git a/src/a.ts b/src/a.ts',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -1 +1 @@',
        '-old a',
        '+new a',
        'diff --git a/src/b.ts b/src/b.ts',
        '--- a/src/b.ts',
        '+++ b/src/b.ts',
        '@@ -1 +1 @@',
        '-old b',
        '+new b',
        '',
      ].join('\n');
      return {
        raw,
        files: ['src/a.ts', 'src/b.ts'].map((path) => ({
          path,
          additions: 1,
          deletions: 1,
          hunks: [
            { file: path, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, newLineNumbers: [1] },
          ],
        })),
      };
    }

    it('map-reduce: assembly.specs is a substring of the user message of each of the 2 calls', async () => {
      const userMessages: string[] = [];
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff: twoFileDiff(),
        llm: recordingLlm(userMessages),
        strategy: 'map-reduce',
        specs,
      });
      expect(outcome.mode).toBe('map-reduce');
      expect(userMessages).toHaveLength(2);
      expect(outcome.assembly.specs).toBeTruthy();
      for (const user of userMessages) expect(user).toContain(outcome.assembly.specs as string);
    });

    it('single-pass: assembly.specs is a substring of the user message of the 1 call', async () => {
      const userMessages: string[] = [];
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff: twoFileDiff(),
        llm: recordingLlm(userMessages),
        strategy: 'single-pass',
        specs,
      });
      expect(outcome.mode).toBe('single-pass');
      expect(userMessages).toHaveLength(1);
      expect(outcome.assembly.specs).toBeTruthy();
      expect(userMessages[0]).toContain(outcome.assembly.specs as string);
    });
  });
});
