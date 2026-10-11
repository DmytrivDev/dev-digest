import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExportInput, CiPreviewInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { FsRunnerBundle } from '../../adapters/runner-bundle/fs.js';
import { CiIngestService } from './ingest.js';
import { CiRepository } from './repository.js';
import { CiService } from './service.js';

/**
 * Export to CI (SPEC-08).
 *   POST /agents/:id/ci/preview        → { files }
 *   POST /agents/:id/export-ci         → { installation, pr_url } | application/zip
 *   GET  /agents/:id/ci/installations  → { installations }
 *   POST /ci/refresh                   → { ingested, rejected, failed, running, errors }
 *   GET  /ci/runs?agent_id=            → { runs } (workspace-scoped, newest first, ≤ 50)
 *
 * Transport only. Every id resolves through the caller's workspace — a foreign
 * id is a 404 (AC-17).
 */
const RunsQuery = z.object({ agent_id: z.string().uuid().optional() });

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  // Composition root for this module (OA §4): ports in, no Container in the services.
  const repo = new CiRepository(app.container.db);
  const github = () => app.container.github();
  const service = new CiService({
    repo,
    agents: app.container.agentsRepo,
    github,
    bundle: new FsRunnerBundle(app.container.config.runnerDistDir),
  });
  const ingest = new CiIngestService({
    repo,
    agents: app.container.agentsRepo,
    github,
    log: app.log,
  });

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.export(workspaceId, req.params.id, req.body);
      if (result.kind === 'zip') {
        return reply
          .type('application/zip')
          .header('content-disposition', `attachment; filename="${result.fileName}"`)
          .send(Buffer.from(result.bytes));
      }
      return { installation: result.installation, pr_url: result.prUrl };
    },
  );

  app.get('/agents/:id/ci/installations', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.installations(workspaceId, req.params.id);
  });

  // No body schema, on purpose: the client posts nothing and Fastify delivers a
  // body-less POST as `null`, which a Zod object schema would reject.
  app.post(
    '/ci/refresh',
    // Each refresh fans out to the GitHub API per installation.
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return ingest.refresh(workspaceId);
    },
  );

  app.get('/ci/runs', { schema: { querystring: RunsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return ingest.listRuns(workspaceId, req.query.agent_id);
  });
}
