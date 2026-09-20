/**
 * Conventions module (L02).
 *   POST /repos/:id/conventions/extract  → scan the repo; persists the survivors
 *   GET  /repos/:id/conventions          → stored candidates (optionally by status)
 *   PUT  /conventions/:id                → triage and/or hand-edit one
 *   DELETE /conventions/:id              → remove one for good (not the same as reject)
 *   GET  /repos/:id/conventions/skill/draft → the skill as it WOULD be saved
 *   POST /repos/:id/conventions/skill    → assemble the accepted ones into a skill
 *
 * The scan is synchronous: it makes exactly one cheap-model call and the caller
 * wants the candidates back, not a job id to poll.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CONVENTION_LIMITS, ConventionCategory, ConventionStatus, SKILL_LIMITS } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SKILL_BODY_MAX } from '../skills/constants.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { SkillsRepository } from '../skills/repository.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';

/** Status is optional: no filter means the whole triage list, which is what the studio shows. */
const ListQuery = z.object({ status: ConventionStatus.optional() });

/**
 * Triage and hand-editing share ONE route, so the studio's Accept/Reject and its
 * inline Edit do not need two code paths for the same row. Every field is
 * optional; `.refine` rejects `{}` because an empty patch would reach Drizzle as
 * `.set({})`, which is a Postgres syntax error rather than a no-op.
 *
 * `rule` is capped because it ends up rendered into a review prompt once the skill
 * is assembled — the same reasoning as `SKILL_LIMITS`, enforced here at the real
 * persistence boundary rather than only in a form.
 */
const UpdateConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(CONVENTION_LIMITS.rule).optional(),
    category: ConventionCategory.optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined || b.category !== undefined, {
    message: 'Provide at least one of status, rule or category',
  });

/**
 * What the save modal may override. All optional: an omitted field means "use what
 * the server assembled", so posting `{}` is the plain save path and stays
 * byte-identical to the draft.
 */
const SaveSkillBody = z.preprocess(
  // A POST with NO body arrives as `null`, and `.default({})` fires only on
  // `undefined` — so the plain "just save the draft" call, which sends no body at
  // all, was rejected with a 422 about an invalid type. That is the normal path,
  // not an edge case, so it is normalised here rather than pushed onto callers.
  (v) => v ?? {},
  z.object({
    name: z.string().trim().min(1).max(SKILL_LIMITS.name).optional(),
    description: z.string().trim().max(SKILL_LIMITS.description).optional(),
    body: z.string().trim().min(1).max(SKILL_BODY_MAX).optional(),
  }),
);

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // The service takes ports, not the container, so the composition happens here.
  // `resolveModel` is a closure rather than a resolved value: the workspace is
  // only known per request, and the model must be re-read on every scan so a
  // change in Settings → Models takes effect without a restart.
  const makeService = (workspaceId: string) =>
    new ConventionsService({
      repo: new ConventionsRepository(container.db),
      git: container.git,
      repoIntel: container.repoIntel,
      llm: (provider) => container.llm(provider),
      resolveModel: () => resolveFeatureModel(container, workspaceId, 'conventions'),
      skills: new SkillsService(new SkillsRepository(container.db)),
    });

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams },
      // One model call per request, and a repo's conventions do not change by the
      // second — a low ceiling here is what stops a double-click paying twice.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await makeService(workspaceId).extract(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Repository not found');
      return result;
    },
  );

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, querystring: ListQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const candidates = await makeService(workspaceId).list(
        workspaceId,
        req.params.id,
        req.query.status,
      );
      if (!candidates) throw new NotFoundError('Repository not found');
      return { candidates };
    },
  );

  app.put(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const candidate = await makeService(workspaceId).update(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention candidate not found');
      return candidate;
    },
  );

  // GET, and it writes nothing: the modal needs the real body to edit before the
  // Deleting is not rejecting: a rejected row survives later scans so the
  // decision holds, a deleted one is gone and the same rule can be proposed
  // again as new.
  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await makeService(workspaceId).remove(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention candidate not found');
    return { ok: true };
  });

  // user commits to saving it.
  app.get(
    '/repos/:id/conventions/skill/draft',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const draft = await makeService(workspaceId).skillDraft(workspaceId, req.params.id);
      if (!draft) throw new NotFoundError('Repository not found');
      return draft;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: SaveSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await makeService(workspaceId).buildSkill(
        workspaceId,
        req.params.id,
        req.body,
      );
      if (!skill) throw new NotFoundError('Repository not found');
      return skill;
    },
  );
}
