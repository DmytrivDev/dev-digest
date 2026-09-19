/**
 * Conventions module (L02).
 *   POST /repos/:id/conventions/extract  → scan the repo; persists the survivors
 *   GET  /repos/:id/conventions          → stored candidates (optionally by status)
 *   PUT  /conventions/:id                → accept / reject / un-triage one
 *   POST /repos/:id/conventions/skill    → assemble the accepted ones into a skill
 *
 * The scan is synchronous: it makes exactly one cheap-model call and the caller
 * wants the candidates back, not a job id to poll.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { SkillsRepository } from '../skills/repository.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';

/** Status is optional: no filter means the whole triage list, which is what the studio shows. */
const ListQuery = z.object({ status: ConventionStatus.optional() });

const TriageBody = z.object({ status: ConventionStatus });

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

  app.put('/conventions/:id', { schema: { params: IdParams, body: TriageBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const candidate = await makeService(workspaceId).setStatus(
      workspaceId,
      req.params.id,
      req.body.status,
    );
    if (!candidate) throw new NotFoundError('Convention candidate not found');
    return candidate;
  });

  app.post('/repos/:id/conventions/skill', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const skill = await makeService(workspaceId).buildSkill(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Repository not found');
    return skill;
  });
}
