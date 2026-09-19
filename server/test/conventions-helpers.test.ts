/**
 * Conventions rules (`modules/conventions/helpers.ts`) — the two decisions that
 * make the feature honest, both pure and therefore testable without Docker:
 * EVIDENCE VALIDATION (which of the model's proposals survive) and the
 * FINGERPRINT (which proposals count as one already-triaged rule).
 */
import { describe, it, expect } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import {
  buildGithubBlobUrl,
  buildSkillBody,
  buildSkillDescription,
  configSearchDirs,
  fingerprintRule,
  normalizeRule,
  toConventionDto,
  validateEvidence,
  type ConventionRow,
  type ProposedConvention,
} from '../src/modules/conventions/helpers.js';
import { MAX_CONFIG_DIRS } from '../src/modules/conventions/constants.js';

const FILE = [
  "import { z } from 'zod';",
  '',
  'export const Body = z.object({ name: z.string() });',
  '',
  'app.post(/skills/, { schema: { body: Body } }, async (req) => {',
  '  return service.create(req.body);',
  '});',
].join('\n');

function proposal(over: Partial<ProposedConvention> = {}): ProposedConvention {
  return {
    category: 'validation',
    rule: 'Validate the request body with a Zod schema declared in the route schema.',
    evidence_path: 'src/routes.ts',
    evidence_line: 3,
    evidence_snippet: 'export const Body = z.object({ name: z.string() });',
    confidence: 0.9,
    ...over,
  };
}

const samples = new Map([['src/routes.ts', FILE]]);

describe('normalizeRule / fingerprintRule', () => {
  it('treats casing, punctuation and spacing as noise — one rule, one triage decision', () => {
    const a = fingerprintRule('Handlers MUST validate via Zod.');
    const b = fingerprintRule('handlers must validate   via zod');
    expect(a).toBe(b);
  });

  it('keeps genuinely different rules apart', () => {
    expect(fingerprintRule('Use Zod in the route')).not.toBe(
      fingerprintRule('Use Zod in the service'),
    );
  });

  it('strips punctuation rather than collapsing every rule to one key', () => {
    expect(normalizeRule('  Use *Zod*, always! ')).toBe('use zod always');
    expect(fingerprintRule('a')).not.toBe(fingerprintRule('b'));
  });

  it('is a hex sha256, so it fits a text column and an index', () => {
    expect(fingerprintRule('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('configSearchDirs', () => {
  it('always probes the repo root first', () => {
    expect(configSearchDirs([])).toEqual(['']);
    expect(configSearchDirs(['index.ts'])).toEqual(['']);
  });

  it('adds the package directories the ranked files actually live in', () => {
    // Measured against this repo: every config sits under server/ or client/, so
    // a root-only probe returns nothing at all.
    expect(configSearchDirs(['server/src/a.ts', 'server/src/b.ts', 'client/src/c.tsx'])).toEqual([
      '',
      'server/',
      'client/',
    ]);
  });

  it('orders by how many ranked files each directory contributed', () => {
    const dirs = configSearchDirs(['b/src/x.ts', 'a/src/y.ts', 'a/src/z.ts']);
    expect(dirs).toEqual(['', 'a/', 'b/']);
  });

  it('breaks ties alphabetically, so a scan is reproducible', () => {
    expect(configSearchDirs(['z/x.ts', 'a/y.ts'])).toEqual(['', 'a/', 'z/']);
  });

  it('descends one level past a container directory — packages/ holds no config', () => {
    expect(configSearchDirs(['packages/api/src/a.ts', 'apps/web/src/b.tsx'])).toEqual([
      '',
      'apps/web/',
      'packages/api/',
    ]);
  });

  it('ignores a container directory with nothing under it', () => {
    expect(configSearchDirs(['packages/a.ts'])).toEqual(['']);
  });

  it('caps the number of directories so a big monorepo cannot blow the budget', () => {
    const paths = Array.from({ length: 10 }, (_, i) => `pkg${i}/src/a.ts`);
    expect(configSearchDirs(paths)).toHaveLength(MAX_CONFIG_DIRS + 1);
  });

  it('does not repeat a directory', () => {
    const dirs = configSearchDirs(['server/a.ts', 'server/b.ts', 'server/c.ts']);
    expect(dirs).toEqual(['', 'server/']);
  });
});

describe('validateEvidence', () => {
  it('accepts a snippet that really is on the cited line', () => {
    expect(validateEvidence(proposal(), samples)).toEqual({
      ok: true,
      line: 3,
      snippet: 'export const Body = z.object({ name: z.string() });',
    });
  });

  it('CORRECTS an off-by-one citation instead of throwing the rule away', () => {
    const check = validateEvidence(proposal({ evidence_line: 4 }), samples);
    expect(check).toMatchObject({ ok: true, line: 3 });
  });

  it('corrects in either direction, up to the tolerance', () => {
    expect(validateEvidence(proposal({ evidence_line: 1 }), samples)).toMatchObject({
      ok: true,
      line: 3,
    });
    expect(validateEvidence(proposal({ evidence_line: 5 }), samples)).toMatchObject({
      ok: true,
      line: 3,
    });
  });

  it('rejects a citation further away than the tolerance', () => {
    expect(validateEvidence(proposal({ evidence_line: 6 }), samples)).toEqual({
      ok: false,
      reason: 'snippet_mismatch',
    });
  });

  it('returns the REAL line text, not the model\'s paraphrase of it', () => {
    const check = validateEvidence(
      proposal({ evidence_line: 5, evidence_snippet: 'schema: { body: Body }' }),
      samples,
    );
    expect(check).toEqual({
      ok: true,
      line: 5,
      snippet: 'app.post(/skills/, { schema: { body: Body } }, async (req) => {',
    });
  });

  it('ignores indentation differences — the model rarely reproduces them', () => {
    const check = validateEvidence(
      proposal({ evidence_line: 6, evidence_snippet: 'return service.create(req.body);' }),
      samples,
    );
    expect(check).toMatchObject({ ok: true, line: 6 });
  });

  it('rejects a file it was never shown, even if such a file exists in the repo', () => {
    expect(validateEvidence(proposal({ evidence_path: 'src/other.ts' }), samples)).toEqual({
      ok: false,
      reason: 'unknown_file',
    });
  });

  it('rejects a line number outside the sample', () => {
    for (const line of [0, -3, 99]) {
      expect(validateEvidence(proposal({ evidence_line: line }), samples)).toEqual({
        ok: false,
        reason: 'line_out_of_range',
      });
    }
  });

  it('rejects a non-integer line', () => {
    expect(validateEvidence(proposal({ evidence_line: 2.5 }), samples)).toEqual({
      ok: false,
      reason: 'line_out_of_range',
    });
  });

  it('rejects an empty rule before looking at anything else', () => {
    expect(validateEvidence(proposal({ rule: '   ' }), samples)).toEqual({
      ok: false,
      reason: 'empty_rule',
    });
  });

  it('rejects an empty snippet — an unverifiable citation is not a citation', () => {
    expect(validateEvidence(proposal({ evidence_snippet: '  ' }), samples)).toEqual({
      ok: false,
      reason: 'snippet_mismatch',
    });
  });

  it('is case-sensitive: code that differs by case is different code', () => {
    expect(
      validateEvidence(proposal({ evidence_snippet: 'EXPORT CONST BODY' }), samples),
    ).toEqual({ ok: false, reason: 'snippet_mismatch' });
  });
});

describe('buildGithubBlobUrl', () => {
  const repo = { owner: 'acme', name: 'api' };

  it('pins the link to the scan sha, not to a branch', () => {
    expect(buildGithubBlobUrl(repo, 'abc123', 'src/routes.ts', 42)).toBe(
      'https://github.com/acme/api/blob/abc123/src/routes.ts#L42',
    );
  });

  it('is null with no sha — a link that cannot be pinned is not offered', () => {
    expect(buildGithubBlobUrl(repo, null, 'src/routes.ts', 42)).toBeNull();
  });

  it('encodes path segments but keeps the separators', () => {
    expect(buildGithubBlobUrl(repo, 'sha', 'src/my file.ts', 1)).toBe(
      'https://github.com/acme/api/blob/sha/src/my%20file.ts#L1',
    );
  });
});

describe('toConventionDto', () => {
  const repo = { owner: 'acme', name: 'api' };

  function row(over: Partial<ConventionRow> = {}): ConventionRow {
    return {
      id: 'c1',
      workspaceId: 'w1',
      repoId: 'r1',
      category: 'validation',
      rule: 'Validate with Zod',
      evidencePath: 'src/routes.ts',
      evidenceLine: 3,
      evidenceSnippet: 'const Body = z.object({})',
      evidenceSha: 'deadbeef',
      confidence: 0.8,
      fingerprint: 'f1',
      status: 'pending',
      createdAt: new Date('2026-09-19T10:00:00.000Z'),
      ...over,
    };
  }

  it('serialises a clickable permalink alongside the raw path and line', () => {
    const dto = toConventionDto(row(), repo);
    expect(dto.evidence_path).toBe('src/routes.ts');
    expect(dto.evidence_line).toBe(3);
    expect(dto.evidence_url).toBe(
      'https://github.com/acme/api/blob/deadbeef/src/routes.ts#L3',
    );
    expect(dto.created_at).toBe('2026-09-19T10:00:00.000Z');
  });

  it('offers no link when the row predates evidence shas', () => {
    expect(toConventionDto(row({ evidenceSha: null }), repo).evidence_url).toBeNull();
    expect(toConventionDto(row({ evidencePath: null }), repo).evidence_url).toBeNull();
  });

  it('carries the triage status through unchanged', () => {
    expect(toConventionDto(row({ status: 'rejected' }), repo).status).toBe('rejected');
  });
});

describe('buildSkillDescription', () => {
  it('stays inside the 200-character cap the skills routes enforce', () => {
    expect(buildSkillDescription('acme/api').length).toBeLessThanOrEqual(200);
    expect(buildSkillDescription('x'.repeat(300)).length).toBeLessThanOrEqual(200);
  });

  it('names the repository, so a linked skill says where its rules came from', () => {
    expect(buildSkillDescription('acme/api')).toContain('acme/api');
  });
});

describe('buildSkillBody', () => {
  function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
    return {
      id: 'c1',
      category: 'validation',
      rule: 'Validate the body with Zod',
      evidence_path: 'src/routes.ts',
      evidence_line: 3,
      evidence_snippet: 'z.object({})',
      evidence_url: null,
      confidence: 0.9,
      status: 'accepted',
      created_at: '2026-09-19T10:00:00.000Z',
      ...over,
    };
  }

  it('carries each rule with the evidence that justifies it', () => {
    const body = buildSkillBody('acme/api', [candidate()], 10_000);
    expect(body).toContain('# Repo conventions — acme/api');
    expect(body).toContain('## Validation');
    expect(body).toContain('- Validate the body with Zod (evidence: `src/routes.ts:3`)');
  });

  it('groups by category in the contract enum order, not input order', () => {
    const body = buildSkillBody(
      'acme/api',
      [
        candidate({ id: 'c1', category: 'testing', rule: 'Colocate tests' }),
        candidate({ id: 'c2', category: 'naming', rule: 'PascalCase components' }),
      ],
      10_000,
    );
    expect(body.indexOf('## Naming')).toBeLessThan(body.indexOf('## Testing'));
  });

  it('is deterministic — so a rebuild of the same rules burns no skill version', () => {
    const rules = [candidate({ id: 'c1' }), candidate({ id: 'c2', category: 'naming' })];
    expect(buildSkillBody('acme/api', rules, 10_000)).toBe(
      buildSkillBody('acme/api', rules, 10_000),
    );
  });

  it('omits a category nobody accepted a rule in', () => {
    const body = buildSkillBody('acme/api', [candidate()], 10_000);
    expect(body).not.toContain('## Testing');
  });

  it('stays within the body cap', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      candidate({ id: `c${i}`, rule: `Rule number ${i} `.repeat(20) }),
    );
    const body = buildSkillBody('acme/api', many, 1_000);
    expect(body.length).toBeLessThanOrEqual(1_000);
  });

  it('still produces a well-formed body for an empty set (the service blocks it separately)', () => {
    const body = buildSkillBody('acme/api', [], 10_000);
    expect(body).toContain('# Repo conventions — acme/api');
    expect(body).toContain('No conventions have been accepted yet');
  });
});
