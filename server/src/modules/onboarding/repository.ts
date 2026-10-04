import { and, eq } from 'drizzle-orm';
import { OnboardingTour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Just enough of the repo row to read its clone and name the tour. */
export interface OnboardingRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

/**
 * The one-tour-per-repo store (SPEC-02). Owns the `onboarding` table.
 *
 * `onboarding` has no `workspace_id` of its own: tenancy is transitive through
 * `repos`. So the repository is only ever read or written AFTER `repoInWorkspace`
 * resolved the repo for the caller's workspace — a tour is source-derived content,
 * and a read by bare `repo_id` would leak another tenant's code facts.
 *
 * Writes lock the owning `repos` row (`FOR UPDATE`) and check it still exists, so a
 * repository deleted while a generation was running stores nothing (AC-23) instead
 * of racing the cascade.
 */
export class OnboardingRepository {
  constructor(private db: Db) {}

  /** The repo, scoped by workspace. `undefined` is how the route learns to 404 (AC-105). */
  async repoInWorkspace(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** The stored tour; a document that no longer parses is "no tour" (plan A-2). */
  async getTour(repoId: string): Promise<OnboardingTour | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const parsed = OnboardingTour.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  /**
   * Replace the repo's tour (AC-20). `false` when the repo no longer exists — nothing is
   * written (AC-23). One transaction: the lock and the upsert see the same repo.
   */
  async saveTour(repoId: string, tour: OnboardingTour): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: t.repos.id })
        .from(t.repos)
        .where(eq(t.repos.id, repoId))
        .for('update');
      if (locked.length === 0) return false;
      const generatedAt = new Date(tour.generated_at);
      await tx
        .insert(t.onboarding)
        .values({ repoId, json: tour, generatedAt })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: tour, generatedAt } });
      return true;
    });
  }

  /**
   * Set `last_failure` on the stored tour and touch nothing else (AC-21). Returns the
   * updated tour, or `null` when the repo is gone or holds no (valid) tour.
   */
  async recordFailure(
    repoId: string,
    failure: NonNullable<OnboardingTour['last_failure']>,
  ): Promise<OnboardingTour | null> {
    return this.db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: t.repos.id })
        .from(t.repos)
        .where(eq(t.repos.id, repoId))
        .for('update');
      if (locked.length === 0) return null;
      const [row] = await tx
        .select({ json: t.onboarding.json })
        .from(t.onboarding)
        .where(eq(t.onboarding.repoId, repoId));
      const parsed = OnboardingTour.safeParse(row?.json);
      if (!parsed.success) return null;
      const updated: OnboardingTour = { ...parsed.data, last_failure: failure };
      await tx.update(t.onboarding).set({ json: updated }).where(eq(t.onboarding.repoId, repoId));
      return updated;
    });
  }
}
