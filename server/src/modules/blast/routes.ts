import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';

/**
 * Blast module.
 *   GET /pulls/:id/blast    → symbols declared in the PR's changed files, who
 *                             calls them (file:line), and the HTTP endpoints
 *                             and crons behind those callers.
 *   GET /pulls/:id/history  → prior merged PRs that touched the same files
 *                             ("Prior PRs" panel), read from GitHub, lazily.
 *
 * No LLM; reads the repo-intel index; may make GitHub calls (one for
 * `/blast` when `pr_files` is empty — Key decision 3; up to
 * `MAX_HISTORY_PATHS * (1 + MAX_COMMITS_PER_PATH)` for `/history` — Key
 * decision 8, docs/plans/blast-radius.plan.md).
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const service = new BlastService({
    repo: new BlastRepository(container.db),
    repoIntel: container.repoIntel,
    github: () => container.github(),
  });

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/history',
    {
      schema: { params: IdParams, response: { 200: PrHistory } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.history(workspaceId, req.params.id);
    },
  );
}
