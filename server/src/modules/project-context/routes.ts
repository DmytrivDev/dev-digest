/**
 * Project Context module (SPEC-01). Transport layer only: parses requests,
 * maps "not in this workspace" to 404, and delegates to ProjectContextService.
 *   GET  /repos/:id/context              → the repo clone's markdown document list
 *   GET  /repos/:id/context/doc?path=    → one document's full text + used-by count
 *   GET  /agents/:id/context-docs?repo_id= → attached + inherited documents
 *   POST /agents/:id/context-docs        → replace the agent's ordered set for a repo
 *   GET  /skills/:id/context-docs?repo_id= → attached documents
 *   POST /skills/:id/context-docs        → replace the skill's ordered set for a repo
 *
 * `:id` (not `:repoId`) matches the sibling `/repos/:id/*` routes.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SaveContextDocsInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

const DocQuery = z.object({ path: z.string() });
const RepoQuery = z.object({ repo_id: z.string().uuid() });

/** A missing owner reads as 404 with no detail about which id was unknown (AC-69). */
function found<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new NotFoundError(`${what} not found`);
  return value;
}

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Composed once in the composition root (`container.projectContext`).
  const service = container.projectContext;

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return found(await service.listDocs(workspaceId, req.params.id), 'Repository');
  });

  app.get(
    '/repos/:id/context/doc',
    { schema: { params: IdParams, querystring: DocQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return found(
        await service.readDoc(workspaceId, req.params.id, req.query.path),
        'Repository',
      );
    },
  );

  app.get(
    '/agents/:id/context-docs',
    { schema: { params: IdParams, querystring: RepoQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return found(
        await service.getAgentDocs(workspaceId, req.params.id, req.query.repo_id),
        'Agent or repository',
      );
    },
  );

  app.post(
    '/agents/:id/context-docs',
    { schema: { params: IdParams, body: SaveContextDocsInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { repo_id, paths } = req.body;
      return found(
        await service.saveAgentDocs(workspaceId, req.params.id, { repo_id, paths }),
        'Agent or repository',
      );
    },
  );

  app.get(
    '/skills/:id/context-docs',
    { schema: { params: IdParams, querystring: RepoQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return found(
        await service.getSkillDocs(workspaceId, req.params.id, req.query.repo_id),
        'Skill or repository',
      );
    },
  );

  app.post(
    '/skills/:id/context-docs',
    { schema: { params: IdParams, body: SaveContextDocsInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { repo_id, paths } = req.body;
      return found(
        await service.saveSkillDocs(workspaceId, req.params.id, { repo_id, paths }),
        'Skill or repository',
      );
    },
  );
}
