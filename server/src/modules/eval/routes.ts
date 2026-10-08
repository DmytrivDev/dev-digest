import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { EvalRepository } from './repository.js';
import { EvalService } from './service.js';

/**
 * Eval module (SPEC-04).
 *   POST   /findings/:id/eval-case   → 201 new case | 200 the finding's existing case
 *   GET    /agents/:id/eval/cases    → the agent's suite
 *   GET    /eval/cases/:id           → one case
 *   PATCH  /eval/cases/:id           → rename / notes / expectation
 *   DELETE /eval/cases/:id           → 204
 *   POST   /agents/:id/eval/runs     → 202 { run_id, status, cases_total }
 *   GET    /agents/:id/eval/runs     → the agent's runs, newest first
 *   GET    /eval/runs/:id            → one run with its per-case outcomes
 *   GET    /eval/compare?a=&b=       → two completed runs of one agent, side by side
 *   GET    /eval/overview            → every workspace agent with its latest run
 *   GET    /agents/:id/eval/dashboard → runs, trend and regression alert of one agent
 *
 * Every id is resolved through the caller's workspace; an id from another workspace is a
 * 404, never a 403 or a leak (AC-103). Transport only — the rules live in the service.
 */
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  // The composition root for this module (OA §4): routes.ts is ring 4 and may read the
  // container; the service gets only the ports and repositories it uses.
  const service = new EvalService({
    repo: new EvalRepository(app.container.db),
    agents: app.container.agentsRepo,
    parseDiff: parseUnifiedDiff,
    resolveLlm: (provider) => app.container.llm(provider),
  });

  // No body schema, on purpose: the client posts nothing, and Fastify delivers a
  // body-less POST as `null`, which a Zod object schema would reject (server/INSIGHTS.md:103).
  app.post('/findings/:id/eval-case', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { status, case: evalCase } = await service.createCaseFromFinding(
      workspaceId,
      req.params.id,
    );
    return reply.code(status).send(evalCase);
  });

  app.get('/agents/:id/eval/cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listCases(workspaceId, req.params.id);
  });

  app.get('/eval/cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getCase(workspaceId, req.params.id);
  });

  // `EvalCaseUpdate` is `.strict()`: an unknown key is a 422, never silently applied.
  app.patch(
    '/eval/cases/:id',
    { schema: { params: IdParams, body: EvalCaseUpdate } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval/cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.deleteCase(workspaceId, req.params.id);
    return reply.code(204).send();
  });

  // ---- suite runs ------------------------------------------------------------

  // Answers before any case is reviewed (AC-46): the run continues detached from this
  // request. No body schema, for the same null-body reason as the case POST above.
  app.post('/agents/:id/eval/runs', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { done: _done, ...started } = await service.startRun(workspaceId, req.params.id);
    return reply.code(202).send(started);
  });

  app.get('/agents/:id/eval/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  app.get('/eval/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getRun(workspaceId, req.params.id);
  });

  // ---- compare / overview / dashboard ----------------------------------------

  app.get('/eval/compare', { schema: { querystring: CompareQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.compare(workspaceId, req.query.a, req.query.b);
  });

  app.get('/eval/overview', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.overview(workspaceId);
  });

  app.get('/agents/:id/eval/dashboard', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId, req.params.id);
  });
}
