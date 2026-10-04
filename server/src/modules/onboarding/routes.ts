/**
 * Onboarding Tour module (SPEC-02).
 *   GET  /repos/:id/onboarding           → readiness, whether a generation is running, the stored tour
 *   POST /repos/:id/onboarding/generate  → build and store the tour (one model call at most)
 *
 * Transport only: parse, delegate, map status codes. Generation is synchronous — the
 * caller waits for the tour — and survives a client disconnect (the handler runs to
 * completion), so a closed tab still leaves the tour stored.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ERR_RATE_LIMITED } from './constants.js';
import { admitRequest } from './helpers/assemble.js';
import { OnboardingRepository } from './repository.js';
import { OnboardingService } from './service.js';

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Per app instance. In-memory on purpose: the API is a single local process (plan A-7).
  // `@fastify/rate-limit` cannot do this job — it is not registered under test and it keys
  // by client IP, while AC-16 is a budget per WORKSPACE.
  const inFlight = new Set<string>();
  const rate = new Map<string, number[]>();

  // The service takes ports, not the container, so the composition happens here.
  const makeService = (workspaceId: string) =>
    new OnboardingService({
      repo: new OnboardingRepository(container.db),
      git: container.git,
      repoIntel: container.repoIntel,
      repoIntelEnabled: container.config.repoIntelEnabled,
      resolveModel: () => resolveFeatureModel(container, workspaceId, 'onboarding'),
      // A missing API key is not an error here: the tour falls back to its skeleton (AC-45).
      llm: async (provider) => {
        try {
          return await container.llm(provider);
        } catch (err) {
          if (err instanceof ConfigError) return null;
          throw err;
        }
      },
      systemPrompt: () => loadPromptTemplate('onboarding.system.md'),
      log: { info: (msg) => app.log.info(msg) },
      inFlight,
    });

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const result = await makeService(workspaceId).getTour(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Repository not found');
    return result;
  });

  // No body, so no body schema: a POST with no body arrives as `null` and would be a 422.
  // No `config.rateLimit` either — it would double-limit by IP; the budget is below.
  app.post('/repos/:id/onboarding/generate', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    // Every request counts, whatever its outcome (plan A-9) — before any lookup or call.
    const admitted = admitRequest(rate.get(workspaceId) ?? [], Date.now());
    rate.set(workspaceId, admitted.history);
    if (!admitted.allowed) {
      throw new AppError(
        ERR_RATE_LIMITED,
        'Too many tour generations — try again in a minute',
        429,
      );
    }
    const result = await makeService(workspaceId).generate(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Repository not found');
    return result;
  });
}
