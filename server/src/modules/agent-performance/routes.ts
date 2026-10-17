import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentPerf, AgentStats, PerfWindowQuery } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { AgentPerformanceRepository } from './repository.js';
import { AgentPerformanceService } from './service.js';

/**
 * Agent Performance module (SPEC-10). Read-only.
 *   GET /agents/performance   → dashboard: window, summary, one row per agent, cost breakdowns
 *   GET /agents/:id/stats     → one agent's row for the same window
 *
 * The static `/agents/performance` outranks the agents module's parametric
 * `/agents/:id` in find-my-way, so it is not swallowed by the uuid `IdParams`.
 */
export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentPerformanceService(new AgentPerformanceRepository(app.container.db));

  app.get(
    '/agents/performance',
    { schema: { querystring: PerfWindowQuery, response: { 200: AgentPerf } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.performance(workspaceId, req.query);
    },
  );

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: PerfWindowQuery, response: { 200: AgentStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id, req.query);
      if (!stats) throw new NotFoundError('Agent not found');
      return stats;
    },
  );
}
