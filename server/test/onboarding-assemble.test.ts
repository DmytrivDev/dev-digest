import { describe, expect, it } from 'vitest';
import { OnboardingTour, type OnboardingReason } from '@devdigest/shared';
import {
  admitRequest,
  buildNarrativeSections,
  buildSkeletonSections,
  callDecision,
  deriveReadiness,
  indexReasons,
  isStale,
  keepNarrative,
  logLine,
  sortReasons,
  usageFor,
  type NarrativeGrounded,
  type ReadinessInput,
  type SectionInput,
} from '../src/modules/onboarding/helpers/assemble.js';
import { SECTION_TITLES } from '../src/modules/onboarding/constants.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';

describe('deriveReadiness (AC-5, AC-6)', () => {
  const ready: ReadinessInput = {
    clonePath: '/clones/a',
    cloneExists: true,
    indexStatus: 'full',
    indexReason: null,
    lastIndexedSha: 'abc123',
    repoIntelEnabled: true,
  };

  it('is ready when cloned and indexed', () => {
    expect(deriveReadiness(ready)).toBe('ready');
    expect(deriveReadiness({ ...ready, indexStatus: 'partial' })).toBe('ready');
  });

  it('is not_cloned without a clone path, when the directory is missing, or for a degraded no_clone index', () => {
    expect(deriveReadiness({ ...ready, clonePath: null })).toBe('not_cloned');
    expect(deriveReadiness({ ...ready, clonePath: '' })).toBe('not_cloned');
    expect(deriveReadiness({ ...ready, cloneExists: false })).toBe('not_cloned');
    expect(deriveReadiness({ ...ready, indexStatus: 'degraded', indexReason: 'no_clone' })).toBe('not_cloned');
  });

  it('is not_indexed without an indexed SHA, or when the flag is off', () => {
    expect(deriveReadiness({ ...ready, lastIndexedSha: '' })).toBe('not_indexed');
    expect(deriveReadiness({ ...ready, lastIndexedSha: null })).toBe('not_indexed');
    expect(deriveReadiness({ ...ready, repoIntelEnabled: false })).toBe('not_indexed');
    expect(deriveReadiness({ ...ready, indexStatus: 'degraded', indexReason: 'flag_off' })).toBe('ready');
  });

  it('prefers not_cloned over not_indexed', () => {
    expect(deriveReadiness({ ...ready, clonePath: null, repoIntelEnabled: false, lastIndexedSha: '' })).toBe(
      'not_cloned',
    );
  });
});

describe('indexReasons / sortReasons (AC-38..AC-41)', () => {
  const base = { status: 'full', filesIndexed: 10, walkTotal: null, edgeCount: 5 };

  it('has no reason for a healthy index', () => {
    expect(indexReasons(base)).toEqual([]);
  });

  it('index_partial needs status partial and at least one file', () => {
    expect(indexReasons({ ...base, status: 'partial' })).toEqual(['index_partial']);
    expect(indexReasons({ ...base, status: 'partial', filesIndexed: 0, edgeCount: 0 })).toEqual([
      'unsupported_language',
      'no_import_graph',
    ]);
  });

  it('index_truncated when the walk total is known', () => {
    expect(indexReasons({ ...base, walkTotal: 8000 })).toEqual(['index_truncated']);
  });

  it('unsupported_language for zero files, no_import_graph for zero edges', () => {
    expect(indexReasons({ ...base, filesIndexed: 0 })).toEqual(['unsupported_language']);
    expect(indexReasons({ ...base, edgeCount: 0 })).toEqual(['no_import_graph']);
  });

  it('comes out in T-1 order whatever the input order', () => {
    expect(
      indexReasons({ status: 'partial', filesIndexed: 3, walkTotal: 9, edgeCount: 0 }),
    ).toEqual(['index_partial', 'index_truncated', 'no_import_graph']);
    expect(
      sortReasons(['llm_failed', 'facts_truncated', 'index_partial', 'no_history', 'index_partial']),
    ).toEqual(['index_partial', 'no_history', 'facts_truncated', 'llm_failed']);
  });
});

describe('callDecision (AC-44, AC-47)', () => {
  it('skips only for the pair unsupported_language + no_import_graph', () => {
    expect(callDecision(['unsupported_language', 'no_import_graph'])).toBe('skip');
    expect(callDecision(['unsupported_language'])).toBe('call');
    expect(callDecision(['no_import_graph'])).toBe('call');
    const soft: OnboardingReason[] = ['index_partial', 'index_truncated', 'no_import_graph', 'no_history', 'facts_truncated'];
    expect(callDecision(soft)).toBe('call');
    expect(callDecision([])).toBe('call');
  });
});

const facts = {
  package_manager: 'pnpm',
  package_dirs: ['(root)', 'server'],
  top_folders: [{ path: 'server', files: 12 }],
  compose_services: ['db'],
  extensions: [{ extension: '.ts', files: 12 }],
};

function sectionInput(over: Partial<SectionInput> = {}): SectionInput {
  return {
    facts,
    packageDiagram: 'flowchart LR\n  p0["client"] --> p1["server"]',
    critical: {
      items: [
        { path: 'server/a.ts', imported_by: 4 },
        { path: 'server/b.ts', imported_by: 2 },
      ],
      empty_reason: null,
    },
    reading: { items: [{ path: 'server/a.ts' }, { path: 'server/c.ts' }], empty_reason: null },
    steps: {
      items: [
        { command: 'pnpm install', note: null },
        { command: 'pnpm run dev', note: null },
      ],
      empty_reason: null,
    },
    ...over,
  };
}

describe('buildSkeletonSections (AC-81, AC-82, AC-87, AC-90, NFR-2)', () => {
  it('builds the five sections in AC-90 order with the English titles', () => {
    const s = buildSkeletonSections(sectionInput());
    expect(s.map((x) => x.kind)).toEqual([
      'architecture_overview',
      'critical_paths',
      'how_to_run',
      'guided_reading',
      'first_tasks',
    ]);
    expect(s.map((x) => x.title)).toEqual(Object.values(SECTION_TITLES));
  });

  it('puts facts and the package diagram in the architecture section, no body', () => {
    const [arch] = buildSkeletonSections(sectionInput());
    expect(arch).toMatchObject({ body: null, facts, empty_reason: null });
    expect(arch.kind === 'architecture_overview' && arch.diagram).toContain('flowchart LR');
  });

  it('gives rows no model text and first tasks needs_model, empty', () => {
    const s = buildSkeletonSections(sectionInput());
    expect(s[1]).toMatchObject({
      items: [
        { path: 'server/a.ts', imported_by: 4, reason: null },
        { path: 'server/b.ts', imported_by: 2, reason: null },
      ],
      empty_reason: null,
    });
    expect(s[3]).toMatchObject({ items: [{ path: 'server/a.ts', why: null }, { path: 'server/c.ts', why: null }] });
    expect(s[4]).toMatchObject({ items: [], empty_reason: 'needs_model' });
  });

  it('shows the empty reason only for a section without rows', () => {
    const s = buildSkeletonSections(
      sectionInput({
        critical: { items: [], empty_reason: 'no_import_graph' },
        reading: { items: [], empty_reason: 'unsupported_language' },
        steps: { items: [], empty_reason: 'no_run_facts' },
        packageDiagram: null,
      }),
    );
    expect(s[1].empty_reason).toBe('no_import_graph');
    expect(s[2].empty_reason).toBe('no_run_facts');
    expect(s[3].empty_reason).toBe('unsupported_language');
    expect(buildSkeletonSections(sectionInput({ critical: { ...sectionInput().critical, empty_reason: 'no_import_graph' } }))[1].empty_reason).toBeNull();
  });

  it('leaves a ranked path with a control character out (AC-96)', () => {
    const s = buildSkeletonSections(
      sectionInput({
        critical: { items: [{ path: 'bad\npath.ts', imported_by: 1 }, { path: 'ok.ts', imported_by: 1 }], empty_reason: null },
        reading: { items: [{ path: 'bad\u0000.ts' }], empty_reason: null },
      }),
    );
    expect(JSON.stringify(s)).not.toContain('bad');
  });

  it('is byte-identical across two builds of one input', () => {
    expect(JSON.stringify(buildSkeletonSections(sectionInput()))).toBe(
      JSON.stringify(buildSkeletonSections(sectionInput())),
    );
  });

  it('produces sections that satisfy the tour contract', () => {
    const tour = {
      repo_id: REPO_ID,
      status: 'skeleton',
      reasons: [],
      generated_at: '2026-10-02T10:00:00.000Z',
      branch: 'main',
      indexed_sha: 'abc',
      indexed_files: 10,
      walk_total: null,
      stale: false,
      last_failure: null,
      usage: usageFor({ kind: 'no_call', provider: null, model: null, durationMs: 5 }),
      sections: buildSkeletonSections(sectionInput()),
    };
    expect(OnboardingTour.safeParse(tour).success).toBe(true);
  });
});

describe('buildNarrativeSections', () => {
  const grounded = (over: Partial<NarrativeGrounded> = {}): NarrativeGrounded => ({
    architecture: { body: 'The server is a Fastify API.', diagram: 'flowchart LR\n  A --> B' },
    critical: [{ path: 'server/a.ts', imported_by: 4, reason: 'core' }],
    reading: [{ path: 'server/a.ts', why: 'start here' }],
    steps: [{ command: 'pnpm install', note: 'once' }],
    tasks: {
      items: [{ title: 'Add a test', scope: 'server/', complexity: 'Low' }],
      empty_reason: null,
    },
    ...over,
  });

  it('carries the model text, the validated model diagram and the grounded rows', () => {
    const s = buildNarrativeSections(sectionInput(), grounded());
    expect(s[0]).toMatchObject({
      kind: 'architecture_overview',
      body: 'The server is a Fastify API.',
      diagram: 'flowchart LR\n  A --> B',
      facts,
    });
    expect(s[1]).toMatchObject({ items: [{ path: 'server/a.ts', reason: 'core' }], empty_reason: null });
    expect(s[2]).toMatchObject({ steps: [{ command: 'pnpm install', note: 'once' }] });
    expect(s[3]).toMatchObject({ items: [{ path: 'server/a.ts', why: 'start here' }] });
    expect(s[4]).toMatchObject({ items: [{ title: 'Add a test' }], empty_reason: null });
  });

  it('never uses the package diagram, and drops an invalid model diagram', () => {
    const s = buildNarrativeSections(
      sectionInput(),
      grounded({ architecture: { body: 'x', diagram: 'sequenceDiagram\nA->>B: hi' } }),
    );
    expect((s[0] as { diagram: string | null }).diagram).toBeNull();
  });

  it('cuts the architecture body to 180 words', () => {
    const body = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const s = buildNarrativeSections(sectionInput(), grounded({ architecture: { body, diagram: null } }));
    const out = (s[0] as { body: string }).body;
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, -1).split(/\s+/)).toHaveLength(180);
  });

  it('carries no_valid_tasks, and no_run_facts only when there is no candidate', () => {
    const none = buildNarrativeSections(
      sectionInput({ steps: { items: [], empty_reason: 'no_run_facts' } }),
      grounded({ steps: [], tasks: { items: [], empty_reason: 'no_valid_tasks' } }),
    );
    expect(none[4]).toMatchObject({ items: [], empty_reason: 'no_valid_tasks' });
    expect(none[2].empty_reason).toBe('no_run_facts');
    // candidates exist but the model kept no step: no reason is stated for it
    const kept = buildNarrativeSections(sectionInput(), grounded({ steps: [] }));
    expect(kept[2].empty_reason).toBeNull();
  });

  it('is byte-identical across two builds of one input', () => {
    expect(JSON.stringify(buildNarrativeSections(sectionInput(), grounded()))).toBe(
      JSON.stringify(buildNarrativeSections(sectionInput(), grounded())),
    );
  });
});

describe('isStale (AC-33)', () => {
  it('is stale when the current indexed SHA differs from the tour SHA', () => {
    expect(isStale('aaa', 'bbb')).toBe(true);
    expect(isStale('aaa', 'aaa')).toBe(false);
    expect(isStale('aaa', '')).toBe(false);
    expect(isStale('aaa', null)).toBe(false);
  });
});

describe('keepNarrative (AC-21)', () => {
  it('keeps a stored narrative for the three llm_* failures only', () => {
    const narrative = { status: 'narrative' as const };
    expect(keepNarrative(narrative, 'llm_timeout')).toBe(true);
    expect(keepNarrative(narrative, 'llm_failed')).toBe(true);
    expect(keepNarrative(narrative, 'llm_invalid_output')).toBe(true);
    expect(keepNarrative(narrative, 'llm_not_configured')).toBe(false);
    expect(keepNarrative(narrative, 'index_partial')).toBe(false);
    expect(keepNarrative(narrative, null)).toBe(false);
  });

  it('never keeps a skeleton or a missing tour', () => {
    expect(keepNarrative({ status: 'skeleton' }, 'llm_failed')).toBe(false);
    expect(keepNarrative(null, 'llm_failed')).toBe(false);
    expect(keepNarrative(undefined, 'llm_failed')).toBe(false);
  });
});

describe('usageFor and logLine (AC-102, AC-103, AC-104)', () => {
  it('reports the engine attempts, tokens and cost for a success', () => {
    const u = usageFor({
      kind: 'success',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      attempts: 1,
      tokensIn: 4200,
      tokensOut: 1014,
      costUsd: 0.0003,
      durationMs: 8123.4,
    });
    expect(u).toEqual({
      llm_calls: 1,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 4200,
      tokens_out: 1014,
      cost_usd: 0.0003,
      duration_ms: 8123,
    });
    expect(logLine(REPO_ID, u, 'narrative', ['index_partial', 'no_history'])).toBe(
      `onboarding: repo=${REPO_ID} llm_calls=1 model=openrouter/deepseek/deepseek-v4-flash tokens_in=4200 tokens_out=1014 cost_usd=0.0003 duration_ms=8123 status=narrative reasons=index_partial,no_history`,
    );
  });

  it('keeps a null cost of a success as unknown', () => {
    const u = usageFor({
      kind: 'success',
      provider: 'openai',
      model: 'gpt-x',
      attempts: 2,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: null,
      durationMs: 1,
    });
    expect(u.llm_calls).toBe(2);
    expect(u.cost_usd).toBeNull();
    expect(logLine(REPO_ID, u, 'narrative', [])).toContain('cost_usd=unknown');
  });

  it('reports one call and null tokens and cost for a failure', () => {
    const u = usageFor({ kind: 'failure', provider: 'openai', model: 'gpt-x', durationMs: 120_000 });
    expect(u).toEqual({
      llm_calls: 1,
      provider: 'openai',
      model: 'gpt-x',
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      duration_ms: 120_000,
    });
    expect(logLine(REPO_ID, u, 'skeleton', ['llm_timeout'])).toBe(
      `onboarding: repo=${REPO_ID} llm_calls=1 model=openai/gpt-x tokens_in=unknown tokens_out=unknown cost_usd=unknown duration_ms=120000 status=skeleton reasons=llm_timeout`,
    );
  });

  it('reports zero calls, zero tokens and zero cost with model=none when no call was made', () => {
    const skipped = usageFor({ kind: 'no_call', provider: null, model: null, durationMs: 12 });
    expect(skipped).toEqual({
      llm_calls: 0,
      provider: null,
      model: null,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      duration_ms: 12,
    });
    expect(logLine(REPO_ID, skipped, 'skeleton', ['unsupported_language', 'no_import_graph'])).toBe(
      `onboarding: repo=${REPO_ID} llm_calls=0 model=none tokens_in=0 tokens_out=0 cost_usd=0 duration_ms=12 status=skeleton reasons=unsupported_language,no_import_graph`,
    );
    // llm_not_configured keeps the resolved provider/model in the usage, but the log says none
    const unconfigured = usageFor({ kind: 'no_call', provider: 'openrouter', model: 'm', durationMs: 3 });
    expect(unconfigured.provider).toBe('openrouter');
    expect(logLine(REPO_ID, unconfigured, 'skeleton', ['llm_not_configured'])).toContain('model=none');
  });

  it('prints reasons=none for an empty list', () => {
    const u = usageFor({ kind: 'no_call', provider: null, model: null, durationMs: 0 });
    expect(logLine(REPO_ID, u, 'skeleton', [])).toMatch(/reasons=none$/);
  });
});

describe('admitRequest (AC-16)', () => {
  it('admits three requests, refuses the fourth inside 60 s, and admits again after the window', () => {
    let history: number[] = [];
    for (const t of [0, 1_000, 2_000]) {
      const r = admitRequest(history, t);
      expect(r.allowed).toBe(true);
      history = r.history;
    }
    const fourth = admitRequest(history, 3_000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.history).toEqual([0, 1_000, 2_000]);
    // a refused request is not recorded: 60 s after the first admitted one a slot is free again
    expect(admitRequest(fourth.history, 60_000).allowed).toBe(true);
    expect(admitRequest(fourth.history, 59_999).allowed).toBe(false);
  });

  it('does not mutate the history it was given', () => {
    const history = [0];
    admitRequest(history, 10);
    expect(history).toEqual([0]);
  });
});
