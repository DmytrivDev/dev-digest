import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { SmartDiffRepository } from './repository.js';
import { buildSmartDiff } from './helpers.js';

/**
 * Smart Diff service. The repository is injected rather than pulled from the
 * DI container — the service states its one real dependency in its own
 * signature (`arch:check`'s `service-not-to-composition-root` rule).
 */
export class SmartDiffService {
  constructor(private repo: SmartDiffRepository) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, findings] = await Promise.all([
      this.repo.getPrFiles(prId),
      this.repo.latestReviewFindings(workspaceId, prId),
    ]);
    return buildSmartDiff(files, findings);
  }
}
