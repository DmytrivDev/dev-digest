import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  PrBrief,
  PrBriefResponse,
  SmartDiff,
  Conformance,
  OnboardingTour,
  OnboardingTourResponse,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  ContextDocList,
  ContextDocContent,
  ContextAttachment,
  InheritedContextAttachment,
  AgentContextDocs,
  SkillContextDocs,
  SaveContextDocsInput,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('BlastRadius parses every new optional field', () => {
    const blast = BlastRadius.parse({
      changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [
            {
              name: 'publicRouter',
              file: 'b.ts',
              line: 23,
              endpoints: ['GET /x'],
              crons: ['reset-buckets (hourly)'],
            },
          ],
          endpoints_affected: ['GET /x'],
          crons_affected: ['reset-buckets (hourly)'],
        },
      ],
      summary: 's',
      degraded: true,
      reason: 'index_partial',
      index_status: 'partial',
      indexed_sha: 'abc123',
      counts: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
    });
    expect(blast.degraded).toBe(true);
    expect(blast.counts?.callers).toBe(1);
  });

  it('BlastRadius still parses the OLD shape with no new fields', () => {
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
  });

  it('BlastRadius rejects a bogus reason', () => {
    const result = BlastRadius.safeParse({
      changed_symbols: [],
      downstream: [],
      summary: 's',
      reason: 'bogus',
    });
    expect(result.success).toBe(false);
  });

  it('PrHistory parses reason: no_github', () => {
    expect(() => PrHistory.parse({ history: [], reason: 'no_github' })).not.toThrow();
  });

  describe('PrBrief', () => {
    const brief = {
      summary: 'Adds per-key rate limiting to the public webhook route.',
      risks: {
        risks: [
          {
            kind: 'security',
            title: 'Unauthenticated route',
            explanation: 'The route accepts unsigned payloads.',
            severity: 'high',
            file_refs: ['src/api/public/webhooks.ts:61-74'],
          },
        ],
      },
      review_focus: [{ file: 'src/api/public/webhooks.ts', line: 61, reason: 'Check the signature path.' }],
      intent: null,
      blast: null,
      head_sha: 'a1b2c3d4e5f6',
      generated_at: '2026-10-03T10:00:00.000Z',
      model: 'openai/gpt-4.1',
      usage: { llm_calls: 1, tokens_in: 4200, tokens_out: 380, cost_usd: 0.004, duration_ms: 5100 },
      inputs: [
        { source: 'intent', status: 'missing', reason: 'not_derived' },
        { source: 'blast', status: 'used' },
        { source: 'diff_stats', status: 'truncated', reason: 'over_budget', omitted: 12 },
        { source: 'description', status: 'used' },
        { source: 'linked_issue', status: 'missing', reason: 'no_linked_issue' },
        { source: 'specs', status: 'missing', reason: 'none_attached' },
      ],
      dropped: { risks: 0, review_focus: 1 },
    };

    it('parses a full PrBriefResponse, and a response with brief: null', () => {
      const parsed = PrBriefResponse.parse({ brief, generating: false, stale: false });
      expect(parsed.brief?.summary).toBe(brief.summary);
      expect(parsed.brief?.review_focus).toHaveLength(1);
      expect(parsed.brief?.inputs).toHaveLength(6);
      expect(() => PrBriefResponse.parse({ brief: null, generating: true, stale: false })).not.toThrow();
    });

    it('rejects a focus item with line 0', () => {
      const bad = { ...brief, review_focus: [{ file: 'a.ts', line: 0, reason: 'r' }] };
      expect(PrBrief.safeParse(bad).success).toBe(false);
    });

    it('rejects a 401-character summary and accepts exactly 400', () => {
      expect(PrBrief.safeParse({ ...brief, summary: 'x'.repeat(401) }).success).toBe(false);
      expect(PrBrief.safeParse({ ...brief, summary: 'x'.repeat(400) }).success).toBe(true);
    });

    it('requires a reason on an input that is not used', () => {
      const bad = { ...brief, inputs: [{ source: 'specs', status: 'missing' }] };
      expect(PrBrief.safeParse(bad).success).toBe(false);
      expect(PrBrief.safeParse({ ...brief, inputs: [{ source: 'specs', status: 'used' }] }).success).toBe(true);
    });

    it('rejects an unknown input source', () => {
      const bad = { ...brief, inputs: [{ source: 'history', status: 'used' }] };
      expect(PrBrief.safeParse(bad).success).toBe(false);
    });
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('SmartDiff parses a tests group and a docs group (widened five-role enum)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'tests',
          files: [{ path: 'a.test.ts', additions: 12, deletions: 0, finding_lines: [] }],
        },
        {
          role: 'docs',
          files: [{ path: 'README.md', additions: 3, deletions: 0, finding_lines: [] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 15, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('tests');
    expect(d.groups[1]!.role).toBe('docs');
  });

  it('Conformance / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  describe('OnboardingTour', () => {
    const section = {
      architecture: {
        kind: 'architecture_overview',
        title: 'Architecture overview',
        empty_reason: null,
        body: 'A small API.',
        diagram: 'flowchart LR\n  p0 --> p1',
        facts: {
          package_manager: 'pnpm',
          package_dirs: ['server'],
          top_folders: [{ path: 'server', files: 12 }],
          compose_services: ['db'],
          extensions: [{ extension: '.ts', files: 12 }],
        },
      },
      critical: {
        kind: 'critical_paths',
        title: 'Critical paths',
        empty_reason: null,
        items: [{ path: 'server/src/app.ts', imported_by: 3, reason: 'Entry point.' }],
      },
      run: {
        kind: 'how_to_run',
        title: 'How to run locally',
        empty_reason: null,
        steps: [{ command: 'pnpm install', note: null }],
      },
      reading: {
        kind: 'guided_reading',
        title: 'Guided reading path',
        empty_reason: null,
        items: [{ path: 'server/src/app.ts', why: null }],
      },
      tasks: {
        kind: 'first_tasks',
        title: 'First tasks',
        empty_reason: 'no_valid_tasks',
        items: [],
      },
    };
    const tour = {
      repo_id: '6f1c2c8e-7b0a-4a52-9d9f-0d3a4b1e5c77',
      status: 'narrative',
      reasons: ['index_partial', 'no_history'],
      generated_at: '2026-10-02T10:00:00.000Z',
      branch: 'main',
      indexed_sha: 'abc1234',
      indexed_files: 120,
      walk_total: null,
      stale: false,
      last_failure: null,
      usage: {
        llm_calls: 1,
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        tokens_in: 9000,
        tokens_out: 900,
        cost_usd: 0.004,
        duration_ms: 8000,
      },
      sections: [section.architecture, section.critical, section.run, section.reading, section.tasks],
    };

    it('parses a valid narrative tour and a response with tour: null', () => {
      expect(() => OnboardingTour.parse(tour)).not.toThrow();
      expect(() =>
        OnboardingTourResponse.parse({ readiness: 'ready', generating: false, tour }),
      ).not.toThrow();
      expect(() =>
        OnboardingTourResponse.parse({ readiness: 'not_cloned', generating: false, tour: null }),
      ).not.toThrow();
    });

    it('rejects a tour with 4 sections', () => {
      expect(OnboardingTour.safeParse({ ...tour, sections: tour.sections.slice(0, 4) }).success).toBe(
        false,
      );
    });

    it('rejects sections out of order', () => {
      const [a, b, ...rest] = tour.sections;
      expect(OnboardingTour.safeParse({ ...tour, sections: [b, a, ...rest] }).success).toBe(false);
    });

    it('rejects an unknown reason', () => {
      expect(OnboardingTour.safeParse({ ...tour, reasons: ['bogus'] }).success).toBe(false);
    });

    it('rejects an unknown task complexity', () => {
      const bad = {
        ...section.tasks,
        empty_reason: null,
        items: [{ title: 't', scope: 'server/src', complexity: 'Trivial' }],
      };
      expect(
        OnboardingTour.safeParse({ ...tour, sections: [...tour.sections.slice(0, 4), bad] }).success,
      ).toBe(false);
    });
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('Project Context contracts', () => {
  const uuid = '3f1c8d2e-5b7a-4c1d-9e0f-1a2b3c4d5e6f';

  it('ContextDocList parses the list envelope', () => {
    const parsed = ContextDocList.parse({
      repo_id: uuid,
      branch: 'main',
      total: 1,
      truncated: false,
      docs: [
        { path: 'specs/a.md', name: 'a.md', folder: 'specs', category: 'specs', approx_tokens: 3 },
      ],
    });
    expect(parsed.docs[0]!.category).toBe('specs');
  });

  it('ContextDocList rejects an unknown category', () => {
    expect(
      ContextDocList.safeParse({
        repo_id: uuid,
        branch: 'main',
        total: 1,
        truncated: false,
        docs: [{ path: 'a.md', name: 'a.md', folder: '', category: 'misc', approx_tokens: 1 }],
      }).success,
    ).toBe(false);
  });

  it('ContextDocContent parses', () => {
    expect(() =>
      ContextDocContent.parse({ path: 'a.md', content: '# a', used_by_agents: 2 }),
    ).not.toThrow();
  });

  it('ContextAttachment allows a null approx_tokens (missing file) but not an absent field', () => {
    expect(() =>
      ContextAttachment.parse({ path: 'a.md', present: false, approx_tokens: null }),
    ).not.toThrow();
    expect(ContextAttachment.safeParse({ path: 'a.md', present: false }).success).toBe(false);
  });

  it('InheritedContextAttachment / AgentContextDocs / SkillContextDocs parse', () => {
    const inherited = {
      path: 'b.md',
      present: true,
      approx_tokens: 5,
      skill_id: uuid,
      skill_name: 'Security',
    };
    expect(() => InheritedContextAttachment.parse(inherited)).not.toThrow();
    expect(() =>
      AgentContextDocs.parse({
        repo_id: uuid,
        attached: [{ path: 'a.md', present: true, approx_tokens: 1 }],
        inherited: [inherited],
      }),
    ).not.toThrow();
    expect(() => SkillContextDocs.parse({ repo_id: uuid, attached: [] })).not.toThrow();
  });

  it('SaveContextDocsInput accepts a valid set', () => {
    expect(SaveContextDocsInput.safeParse({ repo_id: uuid, paths: ['specs/a.md'] }).success).toBe(true);
    expect(SaveContextDocsInput.safeParse({ repo_id: uuid, paths: [] }).success).toBe(true);
  });

  it('SaveContextDocsInput accepts exactly 500 paths and rejects 501', () => {
    const paths = (n: number) => Array.from({ length: n }, (_, i) => `docs/${i}.md`);
    expect(SaveContextDocsInput.safeParse({ repo_id: uuid, paths: paths(500) }).success).toBe(true);
    expect(SaveContextDocsInput.safeParse({ repo_id: uuid, paths: paths(501) }).success).toBe(false);
  });

  it('SaveContextDocsInput rejects a duplicated path and a non-uuid repo_id', () => {
    expect(
      SaveContextDocsInput.safeParse({ repo_id: uuid, paths: ['a.md', 'b.md', 'a.md'] }).success,
    ).toBe(false);
    expect(SaveContextDocsInput.safeParse({ repo_id: 'nope', paths: ['a.md'] }).success).toBe(false);
  });
});
