import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MultiAgentRunRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ReviewRepository } from '../reviews/repository.js';
import { ReviewService } from '../reviews/service.js';
import { MAX_ESTIMATE_AGENTS, START_RATE_LIMIT } from './constants.js';
import { MultiAgentRepository } from './repository.js';
import { MultiAgentService } from './service.js';

/**
 * Multi-agent review module (SPEC-08).
 *   POST /pulls/:id/multi-agent-run   {agent_ids} → { id, pr_id, runs }
 *   GET  /pulls/:id/multi-agent-runs              → { runs: MultiAgentRunSummary[] } (newest 5)
 *   GET  /multi-agent-runs/:id                    → MultiAgentRun (columns, groups, totals)
 *   GET  /agents/run-estimates?agent_ids=a,b,c    → { estimates }
 *
 * Every id is resolved through the caller's workspace; one from another workspace is a
 * 404. Transport only — the rules live in the service and `helpers.ts`.
 */

// `agent_ids` arrives as one comma-separated string.
const EstimatesQuery = z.object({
  agent_ids: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
    z.array(z.string().uuid()).min(1).max(MAX_ESTIMATE_AGENTS),
  ),
});

export default async function multiAgentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  // The composition root for this module (OA §4): routes.ts is ring 4 and may read the
  // container; the service gets only the repositories and the `startRuns` function.
  const reviewService = new ReviewService(app.container);
  const service = new MultiAgentService({
    repo: new MultiAgentRepository(app.container.db),
    reviews: new ReviewRepository(app.container.db),
    agents: app.container.agentsRepo,
    startRuns: (workspaceId, prId, targets, parentId, logger) =>
      reviewService.runReview(workspaceId, prId, targets, logger, parentId),
  });

  // Fastify answers an EMPTY `application/json` body with its own 400 before schema
  // validation. Parse it as `null` instead, so the body schema rejects it with 422
  // (AC-14). Encapsulated: affects this module only.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '') return done(null, null);
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      Object.assign(err as Error, { statusCode: 400 });
      done(err as Error);
    }
  });

  // No null-body preprocess on purpose: a missing body must answer 422 (AC-14).
  app.post(
    '/pulls/:id/multi-agent-run',
    {
      schema: { params: IdParams, body: MultiAgentRunRequest },
      config: { rateLimit: START_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.start(workspaceId, req.params.id, req.body.agent_ids, req.log);
    },
  );

  app.get('/pulls/:id/multi-agent-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.recent(workspaceId, req.params.id);
  });

  app.get('/multi-agent-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.get('/agents/run-estimates', { schema: { querystring: EstimatesQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.estimates(workspaceId, req.query.agent_ids);
  });
}
