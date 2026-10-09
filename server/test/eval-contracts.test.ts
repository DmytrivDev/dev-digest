import { describe, it, expect } from 'vitest';
import {
  EvalCase,
  EvalCaseOutcome,
  EvalCaseUpdate,
  EvalCompare,
  EvalDashboard,
  EvalExpectation,
  EvalOverviewRow,
  EvalSuiteRun,
  FindingRecord,
} from '@devdigest/shared';

/**
 * SPEC-04 eval contracts — parse the shapes the eval endpoints and screens read.
 * Importing the barrel here also proves the section order has no TDZ crash.
 */

const expectation = {
  kind: 'must_find' as const,
  file: 'src/payments/charge.ts',
  start_line: 12,
  end_line: 14,
};

const outcome = {
  case_id: 'c1',
  case_name: 'hardcoded-stripe-secret-key',
  kind: 'must_find' as const,
  expectation,
  status: 'scored' as const,
  pass: true,
  error_reason: null,
  findings_matched: 1,
  findings_total: 2,
  grounding_kept: 2,
  grounding_total: 2,
  duration_ms: 4200,
  cost_usd: 0.012,
  actual: [
    {
      file: 'src/payments/charge.ts',
      start_line: 12,
      end_line: 13,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
    },
  ],
};

const config = {
  system_prompt: 'You are a security reviewer.',
  model: 'openai/gpt-4.1-nano',
  provider: 'openrouter' as const,
  strategy: 'auto' as const,
  skills: [{ name: 'secrets', version: 2 }],
};

const run = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  agent_id: 'a1',
  agent_version: 3,
  status: 'completed' as const,
  error_reason: null,
  started_at: '2026-10-08T10:00:00.000Z',
  finished_at: '2026-10-08T10:01:00.000Z',
  cases_total: 1,
  cases_done: 1,
  cases_passed: 1,
  cases_scored: 1,
  cases_errored: 0,
  recall: 1,
  precision: 0.9,
  citation_accuracy: null,
  cost_usd: 0.012,
  duration_ms: 60000,
  config,
  ...over,
});

describe('eval contracts', () => {
  it('parses an EvalCase with its last outcome', () => {
    const parsed = EvalCase.parse({
      id: 'c1',
      agent_id: 'a1',
      name: 'hardcoded-stripe-secret-key',
      notes: null,
      input_diff: 'diff --git a/x b/x\n',
      input_meta: { pr_number: 483, title: 'Add charge', body: null },
      expectation,
      origin: 'finding',
      labels: { severity: 'CRITICAL', category: 'security', title: 'Hardcoded secret' },
      source: { finding_id: 'f1', pr_number: 483, repo: 'acme/payments-api', available: true },
      created_at: '2026-10-08T09:00:00.000Z',
      last_outcome: outcome,
    });
    expect(parsed.last_outcome?.kind).toBe('must_find');
    expect(EvalCaseOutcome.parse(outcome).expectation.start_line).toBe(12);
  });

  it('parses an EvalSuiteRun with outcomes, and one without', () => {
    expect(EvalSuiteRun.parse(run('r1', { outcomes: [outcome] })).outcomes).toHaveLength(1);
    expect(EvalSuiteRun.parse(run('r2')).outcomes).toBeUndefined();
  });

  it('parses an EvalCompare', () => {
    const parsed = EvalCompare.parse({
      old: run('r1'),
      new: run('r2', { agent_version: 4 }),
      common_case_ids: ['c1'],
      only_in_old: [],
      only_in_new: [{ case_id: 'c2', name: 'new-case' }],
      metrics: {
        old: { recall: 1, precision: 0.9, citation_accuracy: null },
        new: { recall: 1, precision: 0.8, citation_accuracy: null },
      },
      deltas: { recall: 0, precision: -0.1, citation_accuracy: null, cost_usd: 0.001 },
      config_changes: [{ field: 'model', old: 'a', new: 'b' }],
      prompt_diff: [
        { kind: 'context', text: 'You are a security reviewer.' },
        { kind: 'added', text: 'Flag every changed line.' },
      ],
      flips: [{ case_id: 'c1', name: 'x', direction: 'now_failing' }],
    });
    expect(parsed.prompt_diff[1]!.kind).toBe('added');
  });

  it('parses an EvalDashboard and an EvalOverviewRow', () => {
    const dash = EvalDashboard.parse({
      agent: { id: 'a1', name: 'Security Reviewer', provider: 'openrouter', model: 'm' },
      cases_total: 1,
      runs: [run('r1')],
      trend: [{ started_at: '2026-10-08T10:00:00.000Z', recall: 1, precision: 0.9, citation_accuracy: null }],
      alert: {
        drops: [{ metric: 'precision', old_value: 0.9, new_value: 0.8, old_version: 3, new_version: 4 }],
        now_failing: [{ case_id: 'c1', name: 'x' }],
      },
    });
    expect(dash.alert?.drops[0]!.metric).toBe('precision');
    expect(
      EvalOverviewRow.parse({
        agent_id: 'a2',
        agent_name: 'Zero-case agent',
        model: 'm',
        cases_total: 0,
        latest_run: null,
      }).latest_run,
    ).toBeNull();
  });

  it('rejects an expectation whose end_line < start_line, with the path on end_line', () => {
    const r = EvalExpectation.safeParse({ ...expectation, start_line: 20, end_line: 10 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(['end_line']);
  });

  it('rejects an expectation without a file', () => {
    const { file: _file, ...noFile } = expectation;
    expect(EvalExpectation.safeParse(noFile).success).toBe(false);
  });

  it('rejects an EvalCaseUpdate with an empty name or an unknown key', () => {
    expect(EvalCaseUpdate.safeParse({ name: '' }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ name: '   ' }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ agent_id: 'other' }).success).toBe(false);
    expect(EvalCaseUpdate.safeParse({ name: 'ok', notes: null }).success).toBe(true);
  });

  it('FindingRecord accepts the new eval fields and stays valid without them', () => {
    const base = {
      id: 'f1',
      file: 'a.ts',
      start_line: 1,
      end_line: 1,
      severity: 'WARNING',
      category: 'security',
      title: 't',
      rationale: 'r',
      confidence: 0.5,
      review_id: 'rv1',
      accepted_at: null,
      dismissed_at: null,
    };
    const without = FindingRecord.safeParse(base);
    expect(without.success).toBe(true);
    const withFields = FindingRecord.parse({
      ...base,
      eval_case_id: null,
      eval_ineligible_reason: 'agent_missing',
    });
    expect(withFields.eval_ineligible_reason).toBe('agent_missing');
    expect(FindingRecord.safeParse({ ...base, eval_ineligible_reason: 'nope' }).success).toBe(false);
  });
});
