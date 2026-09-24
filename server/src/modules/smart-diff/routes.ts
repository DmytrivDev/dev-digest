import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffRepository } from './repository.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff module.
 *   GET /pulls/:id/smart-diff → the PR's files grouped into five roles
 *                                (core/tests/wiring/docs/boilerplate), with
 *                                the latest review's finding lines attached.
 *
 * No LLM, no GitHub call — reads only what `pulls/routes.ts` already
 * persisted (`pr_files`, `reviews`, `findings`).
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(new SmartDiffRepository(app.container.db));

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
