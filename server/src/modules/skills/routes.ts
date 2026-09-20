import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  DERIVED_DESCRIPTION_MAX,
  IMPORT_NAME_MAX,
  SKILL_BODY_MAX,
} from './constants.js';
import { DEFAULT_STATS_WINDOW_DAYS, MAX_STATS_WINDOW_DAYS } from './constants.js';
import { SkillImportError } from './import-parse.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';

/**
 * Skills module (L02).
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create
 *   PUT    /skills/:id              → update / toggle enabled (versions the body)
 *   DELETE /skills/:id              → delete (unlinks from every agent)
 *   GET    /skills/:id/versions     → body snapshots, newest first
 *   POST   /skills/:id/restore      → re-apply an old body AS A NEW version
 *   GET    /skills/:id/stats        → usage statistics over a day window
 *   POST   /skills/import/preview   → parse an upload; PERSISTS NOTHING
 *
 * Attaching a skill to an agent lives on the agents module
 * (`POST /agents/:id/skills`) — that side of `agent_skills` is A2's.
 */

/**
 * Lengths are capped HERE, not only in the importer.
 *
 * `name` and `description` are rendered into the review prompt, and the
 * importer's clamp only runs on the `/skills/import/preview` path — anyone
 * POSTing straight to `/skills` would skip it. The same constants back both
 * enforcement points so they cannot drift.
 */
const CreateSkillBody = z.object({
  name: z.string().min(1).max(IMPORT_NAME_MAX),
  description: z.string().max(DERIVED_DESCRIPTION_MAX),
  type: SkillType,
  body: z.string().min(1).max(SKILL_BODY_MAX),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).max(IMPORT_NAME_MAX).optional(),
  description: z.string().max(DERIVED_DESCRIPTION_MAX).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).max(SKILL_BODY_MAX).optional(),
  enabled: z.boolean().optional(),
});

/** Stats window. Coerced because it arrives as a query string. */
const StatsQuery = z.object({
  days: z.coerce.number().int().positive().max(MAX_STATS_WINDOW_DAYS).default(DEFAULT_STATS_WINDOW_DAYS),
});

/** Which snapshot to re-apply. Versions start at 1 and only ever go up. */
/**
 * The complete ordered id list for the workspace. Capped because it is the whole
 * set, not a page: a list longer than this is not a drag, it is a payload.
 */
const ReorderBody = z.object({ ids: z.array(z.string().uuid()).max(500) });

const RestoreSkillBody = z.object({ version: z.number().int().positive() });

/**
 * The upload envelope. JSON + base64 rather than multipart: the payload is a
 * single small file, the app already caps bodies at 1 MB, and this keeps the
 * client on the one `apiFetch` path instead of a second FormData branch.
 */
const ImportPreviewBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(new SkillsRepository(app.container.db));

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  // The COMPLETE ordered set, like POST /agents/:id/skills — a partial move
  // would leave rows sharing a position and the list without one order.
  app.post('/skills/reorder', { schema: { body: ReorderBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.reorder(workspaceId, req.body.ids);
    return { ok: true };
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      description: body.description,
      type: body.type,
      body: body.body,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  // POST, not PUT: restoring is not idempotent — each call appends a version.
  app.post(
    '/skills/:id/restore',
    { schema: { params: IdParams, body: RestoreSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.body.version);
      // One 404 for "no such skill", "not your skill" and "no such version":
      // telling them apart tells a stranger which skill ids exist.
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, querystring: StatsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id, req.query.days);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );

  app.post('/skills/import/preview', { schema: { body: ImportPreviewBody } }, async (req) => {
    // Context is resolved even though nothing is written: an import is a
    // workspace action, and skipping the check here is how an endpoint quietly
    // becomes unauthenticated.
    await getContext(app.container, req);
    try {
      return service.importPreview(req.body.filename, req.body.content_base64);
    } catch (err) {
      if (err instanceof SkillImportError) throw new ValidationError(err.message);
      throw err;
    }
  });
}
