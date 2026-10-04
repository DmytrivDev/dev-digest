/**
 * PR Brief module (SPEC-03).
 *   GET  /pulls/:id/brief  → the stored brief, whether a generation is running, whether it is stale
 *   POST /pulls/:id/brief  → build and store the brief (exactly one model call)
 *
 * Transport only: parse, delegate, map status codes. GET makes no GitHub and no model call.
 * Generation is synchronous — the caller waits for the brief — and survives a client
 * disconnect (the handler runs to completion), so a closed tab still leaves the brief stored.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { ProjectContextRepository } from '../project-context/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ERR_RATE_LIMITED, SYSTEM_PROMPT_FILE } from './constants.js';
import { chunkMemoCounter } from './helpers/bounds.js';
import { admitGenerate } from './helpers/outcome.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Per app instance. In-memory on purpose: the API is a single local process.
  // `@fastify/rate-limit` cannot do this job — it is not registered under test and it keys
  // by client IP, while AC-92 is a budget per WORKSPACE.
  const inFlight = new Set<string>();
  const rate = new Map<string, number[]>();

  // The service takes ports, not the container, so the composition happens here.
  const contextRepo = new ProjectContextRepository(container.db);
  const makeService = (workspaceId: string) =>
    new BriefService({
      repo: new BriefRepository(container.db),
      git: container.git,
      // Agent selection, ordering and skill links live in project-context; the brief only reads them.
      enabledAgentDocs: (ws, repoId) => contextRepo.enabledAgentDocs(ws, repoId),
      github: () => container.github(),
      repoIntel: container.repoIntel,
      resolveModel: () => resolveFeatureModel(container, workspaceId, 'risk_brief'),
      // A missing API key is a 422 here (AC-86) — the service maps the `ConfigError`.
      llm: (provider) => container.llm(provider),
      // Memoised per word / line: the budget search counts the whole prompt many times, and
      // an unchanged word is a lookup, not a tokenization (F9). Same result as a direct count.
      countTokens: chunkMemoCounter((text) => container.tokenizer.count(text)),
      systemPrompt: () => loadPromptTemplate(SYSTEM_PROMPT_FILE),
      log: { info: (msg) => app.log.info(msg) },
      inFlight,
    });

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await makeService(workspaceId).get(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Pull request not found');
      return result;
    },
  );

  // No body, so no body schema: a POST with no body arrives as `null` and would be a 422.
  // No `config.rateLimit` either — it would double-limit by IP; the budget is below.
  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      // Every request counts, whatever its outcome — before any lookup or call (AC-92).
      const admitted = admitGenerate(rate.get(workspaceId) ?? [], Date.now());
      rate.set(workspaceId, admitted.history);
      if (!admitted.allowed) {
        throw new AppError(
          ERR_RATE_LIMITED,
          'Too many brief generations — try again in a minute',
          429,
        );
      }
      const result = await makeService(workspaceId).generate(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Pull request not found');
      return result;
    },
  );
}
