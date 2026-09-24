/**
 * Intent module (the intent layer).
 *   GET  /pulls/:id/intent  → the stored derivation, or `{ intent: null }` when
 *                              none exists yet (a normal state, not an error)
 *   POST /pulls/:id/intent  → derive (or reuse) the intent; `{ force: true }`
 *                              forces a fresh derivation even when the cache
 *                              key still matches
 *
 * Both routes and the review pre-work step (`reviews/run-executor.ts`) call
 * the SAME `IntentService.derive()` — there is exactly one derivation path,
 * two entry points (docs/plans/intent-layer.plan.md §2.2).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { IntentRepository } from './repository.js';
import { IntentService } from './service.js';

/**
 * A Fastify POST with no body arrives as `null`, and `.default({})` fires
 * only on `undefined` — so the ordinary "just derive it" call with no
 * payload would 422 without this (`server/INSIGHTS.md`, 2026-09-19).
 */
const DeriveBody = z.preprocess(
  (v) => v ?? {},
  z.object({ force: z.boolean().optional() }),
);

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // The service takes ports, not the container, so the composition happens
  // here — same shape as `modules/conventions/routes.ts`. `resolveModel` is a
  // closure, not a resolved value, so a Settings change takes effect on the
  // next derivation without a restart.
  const makeService = (workspaceId: string) =>
    new IntentService({
      repo: new IntentRepository(container.db),
      git: container.git,
      github: () => container.github(),
      llm: (provider) => container.llm(provider),
      resolveModel: () => resolveFeatureModel(container, workspaceId, 'review_intent'),
    });

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const repo = new IntentRepository(container.db);
    const pull = await repo.getPull(workspaceId, req.params.id);
    if (!pull) throw new NotFoundError('Pull request not found');
    const intent = await repo.get(req.params.id);
    return { intent: intent ?? null };
  });

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, body: DeriveBody },
      // One model call per request; same ceiling and reasoning as
      // `POST /repos/:id/conventions/extract`.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await makeService(workspaceId).derive(workspaceId, req.params.id, {
        force: req.body.force,
      });
      if (!result) throw new NotFoundError('Pull request not found');
      return { intent: result.record };
    },
  );
}
