/**
 * Conventions extractor, end to end against a real Postgres.
 *
 * The assertions that matter are the ones no unit test can make: that a scan's
 * result is PERSISTED, that a REJECTED candidate survives a second scan without
 * being resurrected or duplicated, and that the model actually used is the one
 * the workspace picked in Settings rather than a constant in the code.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { ConventionsRepository } from '../src/modules/conventions/repository.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type {
  ConventionCandidate,
  ConventionScanResult,
  LLMProvider,
  Skill,
} from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const TSCONFIG = ['{', '  "compilerOptions": {', '    "strict": true,', '  }', '}'].join('\n');

const ROUTES = [
  "import { z } from 'zod';",
  '',
  'export const CreateBody = z.object({ name: z.string() });',
  '',
  'export async function routes(app) {',
  "  app.post('/things', { schema: { body: CreateBody } }, handler);",
  '}',
].join('\n');

const FILES: Record<string, string> = { 'tsconfig.json': TSCONFIG, 'src/routes.ts': ROUTES };

const RULE_VALIDATION = 'Declare the request body as a Zod schema and pass it in the route schema.';
const RULE_STRUCTURE = 'Register routes through an exported plugin function per module.';
const RULE_TYPING = 'Keep TypeScript strict mode on for every package.';

/**
 * One model response covering every outcome: three verifiable candidates, an
 * invented file, a line past the end of the sample, a snippet that is not on the
 * cited line, and a re-wording of a rule already in the batch.
 */
const MODEL_FIXTURE = {
  conventions: [
    {
      category: 'validation',
      rule: RULE_VALIDATION,
      evidence_path: 'src/routes.ts',
      evidence_line: 3,
      evidence_snippet: 'export const CreateBody = z.object({ name: z.string() });',
      confidence: 0.95,
    },
    {
      category: 'structure',
      rule: RULE_STRUCTURE,
      // Cited one line late — the validator corrects it to 6 rather than dropping it.
      evidence_path: 'src/routes.ts',
      evidence_line: 7,
      evidence_snippet: "app.post('/things', { schema: { body: CreateBody } }, handler);",
      confidence: 0.8,
    },
    {
      category: 'typing',
      rule: RULE_TYPING,
      evidence_path: 'tsconfig.json',
      evidence_line: 3,
      evidence_snippet: '"strict": true,',
      confidence: 0.9,
    },
    {
      category: 'naming',
      rule: 'Name every service file service.ts.',
      evidence_path: 'src/never-sent.ts',
      evidence_line: 1,
      evidence_snippet: 'export class Service {}',
      confidence: 0.7,
    },
    {
      category: 'testing',
      rule: 'Colocate every test beside its subject.',
      evidence_path: 'src/routes.ts',
      evidence_line: 99,
      evidence_snippet: "import { describe } from 'vitest';",
      confidence: 0.6,
    },
    {
      category: 'imports',
      rule: 'Order imports node, external, internal.',
      evidence_path: 'src/routes.ts',
      evidence_line: 1,
      evidence_snippet: 'import fs from "node:fs";',
      confidence: 0.5,
    },
    {
      category: 'validation',
      rule: 'DECLARE the request body as a Zod schema, and pass it in the route schema!',
      evidence_path: 'src/routes.ts',
      evidence_line: 3,
      evidence_snippet: 'export const CreateBody = z.object({ name: z.string() });',
      confidence: 0.4,
    },
  ],
};

const fakeRepoIntel = (paths: string[]): RepoIntel =>
  ({ getConventionSamples: async () => paths }) as unknown as RepoIntel;

d('conventions extractor', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeRepo() {
    const name = `conv-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: `/mock/clones/acme/${name}`,
      })
      .returning();
    return repo!;
  }

  function makeApp(opts: { codePaths?: string[]; files?: Record<string, string> } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: opts.files ?? FILES, head: 'headsha1' }),
        repoIntel: fakeRepoIntel(opts.codePaths ?? ['src/routes.ts']),
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { RepoConventions: MODEL_FIXTURE },
          }),
        },
      },
    });
  }

  async function extract(app: Awaited<ReturnType<typeof makeApp>>, repoId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(200);
    return res.json() as ConventionScanResult;
  }

  it('samples configs AND ranked code, with no model involved in the choice', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const { scan } = await extract(app, repo.id);

    expect(scan.config_samples).toContain('tsconfig.json');
    expect(scan.code_samples).toEqual(['src/routes.ts']);
    expect(scan.head_sha).toBe('headsha1');
    await app.close();
  });

  it('keeps only candidates whose evidence survives a re-read of the file', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const { candidates, scan } = await extract(app, repo.id);

    expect(scan.proposed).toBe(7);
    expect(scan.kept).toBe(3);
    expect(scan.created).toBe(3);
    expect(candidates).toHaveLength(3);

    // Each rejection is reported with the reason, so a thin result is explainable.
    expect(scan.dropped.map((d2) => d2.reason).sort()).toEqual([
      'duplicate_in_batch',
      'line_out_of_range',
      'snippet_mismatch',
      'unknown_file',
    ]);

    const rules = candidates.map((c) => c.rule);
    expect(rules).toContain(RULE_VALIDATION);
    expect(rules).toContain(RULE_STRUCTURE);
    expect(rules).toContain(RULE_TYPING);
    await app.close();
  });

  it('corrects an off-by-one citation and stores the real line, not the model text', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const { candidates } = await extract(app, repo.id);

    const structure = candidates.find((c) => c.rule === RULE_STRUCTURE)!;
    expect(structure.evidence_line).toBe(6);
    expect(structure.evidence_snippet).toBe(
      "app.post('/things', { schema: { body: CreateBody } }, handler);",
    );
    await app.close();
  });

  it('gives every candidate a clickable permalink pinned to the scan sha', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const { candidates } = await extract(app, repo.id);

    const validation = candidates.find((c) => c.rule === RULE_VALIDATION)!;
    expect(validation.evidence_url).toBe(
      `https://github.com/acme/${repo.name}/blob/headsha1/src/routes.ts#L3`,
    );
    await app.close();
  });

  it('persists the result — a fresh app reads the same candidates back', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const { candidates } = await extract(app, repo.id);
    await app.close();

    // A brand-new app instance: nothing is held in memory from the scan.
    const reader = await makeApp();
    const res = await reader.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { candidates: ConventionCandidate[] };
    expect(body.candidates.map((c) => c.id).sort()).toEqual(candidates.map((c) => c.id).sort());
    await reader.close();
  });

  it('a rejected candidate stays rejected through a re-scan, and is not duplicated', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const first = await extract(app, repo.id);
    const target = first.candidates.find((c) => c.rule === RULE_VALIDATION)!;

    const put = await app.inject({
      method: 'PUT',
      url: `/conventions/${target.id}`,
      payload: { status: 'rejected' },
    });
    expect(put.statusCode).toBe(200);
    expect((put.json() as ConventionCandidate).status).toBe('rejected');

    // Same fixture, so the scan re-proposes the very rule that was rejected.
    const second = await extract(app, repo.id);
    expect(second.scan.kept).toBe(3);
    expect(second.scan.created).toBe(0);
    expect(second.candidates).toHaveLength(3);

    const again = second.candidates.filter((c) => c.rule === RULE_VALIDATION);
    expect(again).toHaveLength(1);
    expect(again[0]!.id).toBe(target.id);
    expect(again[0]!.status).toBe('rejected');
    await app.close();
  });

  it('keeps an accepted decision through a re-scan too', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const first = await extract(app, repo.id);
    const target = first.candidates.find((c) => c.rule === RULE_TYPING)!;
    await app.inject({
      method: 'PUT',
      url: `/conventions/${target.id}`,
      payload: { status: 'accepted' },
    });

    await extract(app, repo.id);
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/conventions?status=accepted`,
    });
    const body = res.json() as { candidates: ConventionCandidate[] };
    expect(body.candidates.map((c) => c.id)).toEqual([target.id]);
    await app.close();
  });

  it('drops an untriaged candidate the newest scan no longer proposes', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const first = await extract(app, repo.id);
    expect(first.candidates).toHaveLength(3);
    await app.close();

    // Second scan sees a repo whose sampled file no longer supports any rule.
    const narrowed = await makeApp({ files: { 'src/routes.ts': 'const nothing = 1;' } });
    const second = await extract(narrowed, repo.id);
    expect(second.scan.kept).toBe(0);
    expect(second.candidates).toHaveLength(0);
    await narrowed.close();
  });

  it('uses the model the WORKSPACE picked, not a constant', async () => {
    const repo = await makeRepo();
    const app = await makeApp();
    const before = await extract(app, repo.id);
    // The registry default for the `conventions` feature.
    expect(before.scan.model).toBe('gpt-5.4');
    await app.close();

    await pg.handle.db.insert(t.settings).values({
      workspaceId,
      key: 'feature_models',
      value: { conventions: { provider: 'openai', model: 'gpt-4.1-mini' } },
    });

    const after = await makeApp();
    const result = await extract(after, repo.id);
    expect(result.scan.model).toBe('gpt-4.1-mini');
    expect(result.scan.provider).toBe('openai');
    await after.close();

    await pg.handle.db.delete(t.settings).where(eq(t.settings.key, 'feature_models'));
  });

  it('assembles the accepted candidates into one repo-conventions skill', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const { candidates } = await extract(app, repo.id);
    const accepted = candidates.find((c) => c.rule === RULE_STRUCTURE)!;
    const rejected = candidates.find((c) => c.rule === RULE_VALIDATION)!;

    await app.inject({
      method: 'PUT',
      url: `/conventions/${accepted.id}`,
      payload: { status: 'accepted' },
    });
    await app.inject({
      method: 'PUT',
      url: `/conventions/${rejected.id}`,
      payload: { status: 'rejected' },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill` });
    expect(res.statusCode).toBe(200);
    const skill = res.json() as Skill;

    expect(skill.name).toBe('repo-conventions');
    expect(skill.type).toBe('convention');
    expect(skill.source).toBe('extracted');
    expect(skill.body).toContain(RULE_STRUCTURE);
    // The rejected rule never reaches the skill — the other half of criterion 48.
    expect(skill.body).not.toContain(RULE_VALIDATION);
    // Evidence travels into the skill, so a reviewer model can cite it.
    expect(skill.body).toContain('src/routes.ts:6');
    await app.close();
  });

  it('refuses to assemble a skill with no accepted rules', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    await extract(app, repo.id);

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('re-assembling updates the SAME skill: a new version only when the body changed', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const { candidates } = await extract(app, repo.id);
    const structure = candidates.find((c) => c.rule === RULE_STRUCTURE)!;
    const typing = candidates.find((c) => c.rule === RULE_TYPING)!;

    await app.inject({
      method: 'PUT',
      url: `/conventions/${structure.id}`,
      payload: { status: 'accepted' },
    });
    const first = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill` })
    ).json() as Skill;

    // Same accepted set → byte-identical body → no version burnt.
    const unchanged = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill` })
    ).json() as Skill;
    expect(unchanged.id).toBe(first.id);
    expect(unchanged.version).toBe(first.version);

    // One more accepted rule → new body → new version on the same skill.
    await app.inject({
      method: 'PUT',
      url: `/conventions/${typing.id}`,
      payload: { status: 'accepted' },
    });
    const bumped = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill` })
    ).json() as Skill;
    expect(bumped.id).toBe(first.id);
    expect(bumped.version).toBe(first.version + 1);
    expect(bumped.body).toContain(RULE_TYPING);
    await app.close();
  });

  it('404s an unknown repo and a candidate from another workspace', async () => {
    const app = await makeApp();
    const missing = await app.inject({
      method: 'GET',
      url: '/repos/00000000-0000-0000-0000-000000000000/conventions',
    });
    expect(missing.statusCode).toBe(404);

    const badId = await app.inject({
      method: 'PUT',
      url: '/conventions/00000000-0000-0000-0000-000000000000',
      payload: { status: 'accepted' },
    });
    expect(badId.statusCode).toBe(404);
    await app.close();
  });

  it('never reads or triages another workspace\'s rows', async () => {
    // LocalNoAuthProvider always resolves the default workspace, so cross-tenant
    // scoping has to be exercised through the service directly.
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: `other-${repoSeq++}` }).returning();
    const repo = await makeRepo();

    const app = await makeApp();
    const { candidates } = await extract(app, repo.id);
    await app.close();

    const service = new ConventionsService({
      repo: new ConventionsRepository(db),
      git: new MockGitClient({ files: FILES }),
      repoIntel: fakeRepoIntel(['src/routes.ts']),
      llm: async () => new MockLLMProvider('openai'),
      resolveModel: async () => ({ provider: 'openai', model: 'unused' }),
      skills: new SkillsService(new SkillsRepository(db)),
    });

    expect(await service.list(other!.id, repo.id)).toBeUndefined();
    expect(await service.setStatus(other!.id, candidates[0]!.id, 'accepted')).toBeUndefined();
    expect(await service.buildSkill(other!.id, repo.id)).toBeUndefined();

    // The row is untouched by the foreign attempt.
    const [row] = await db.select().from(t.conventions).where(eq(t.conventions.id, candidates[0]!.id));
    expect(row!.status).toBe('pending');
  });

  it('fails fast when the model does not answer within the deadline', async () => {
    // The route answers synchronously, so an unbounded call is a connection held
    // open until the client gives up. The deadline is ours to enforce, because the
    // provider this feature runs on ignores the per-request timeoutMs.
    const db = pg.handle.db;
    const repo = await makeRepo();
    const hung: LLMProvider = {
      id: 'openai',
      listModels: async () => [],
      complete: async () => {
        throw new Error('not used');
      },
      embed: async () => [],
      completeStructured: () => new Promise(() => {}), // never settles
    };

    const service = new ConventionsService({
      repo: new ConventionsRepository(db),
      git: new MockGitClient({ files: FILES, head: 'headsha1' }),
      repoIntel: fakeRepoIntel(['src/routes.ts']),
      llm: async () => hung,
      resolveModel: async () => ({ provider: 'openai', model: 'stalls' }),
      skills: new SkillsService(new SkillsRepository(db)),
      deadlineMs: 150,
    });

    await expect(service.extract(workspaceId, repo.id)).rejects.toThrow(/did not answer within/);
    // Nothing was written — a scan that never returned proposes nothing.
    expect(await service.list(workspaceId, repo.id)).toEqual([]);
  });

  it('refuses to spend a model call on a repo with no index', async () => {
    const app = await makeApp({ codePaths: [] });
    const repo = await makeRepo();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('no code index');
    await app.close();
  });
});
