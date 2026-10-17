import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Agent Performance demo data (SPEC-10).
 *
 * Gives the dashboard something to show on a fresh stack and gives the e2e flow
 * fixed numbers to assert. Everything hangs off a dedicated PR #484 so the
 * existing PRs' reviews (and their "latest review") are untouched.
 *
 * Two sets:
 *  - HISTORIC: fixed September 2026 dates at 12:00:00Z, so the local-midnight
 *    bounds of 2026-09-01 .. 2026-09-30 contain them in every browser timezone.
 *  - RECENT: relative to the first seed time, so the default 30-day view of a
 *    fresh stack is not empty.
 *
 * Insert-when-absent only (the seed never updates): runs, reviews and findings
 * carry fixed ids, and findings are inserted only for a review this call really
 * created, so a second `seed()` changes nothing.
 */

export const SEED_PERF_PR_NUMBER = 484;
export const SEED_PERF_PR_TITLE = 'Retry policy for webhook delivery';

/** Fixed, valid v4-shaped uuid for the n-th seeded row. */
const id = (n: number) => `0484a000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SECURITY = 'Security Reviewer';
const GENERAL = 'General Reviewer';
const PERFORMANCE = 'Performance Reviewer';

const HISTORIC_MODEL = 'deepseek/deepseek-v4-flash';
const at = (day: number) => new Date(Date.UTC(2026, 8, day, 12, 0, 0));

interface PlannedFindings {
  accepted: number;
  dismissed: number;
  untriaged: number;
}

interface PlannedRun {
  id: string;
  agent: string;
  ranAt: Date;
  status: 'done' | 'failed';
  source: 'local' | 'ci';
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  error?: string;
  /** Present when the run has a review (local, linked by `run_id`). */
  review?: { id: string; findings: PlannedFindings };
}

const F = (accepted: number, dismissed: number, untriaged: number): PlannedFindings => ({
  accepted,
  dismissed,
  untriaged,
});

/** Security Reviewer: 6 done runs (5 accepted, 2 dismissed, 2 untriaged) + 1 failed. */
const SECURITY_DAYS = [5, 8, 11, 14, 17, 20];
const SECURITY_COST = [0.04, 0.04, 0.05, 0.05, 0.06, 0.06];
const SECURITY_MS = [6000, 6200, 6400, 6000, 6200, 6400];
const SECURITY_FINDINGS = [F(1, 1, 0), F(1, 0, 1), F(1, 0, 0), F(1, 1, 0), F(1, 0, 1), F(0, 0, 0)];

/** General Reviewer: 3 done runs (1 accepted, 1 dismissed, 1 untriaged), the last unpriced. */
const GENERAL_DAYS = [6, 12, 18];
const GENERAL_COST: Array<number | null> = [0.02, 0.02, null];
const GENERAL_MS: Array<number | null> = [4000, 5000, null];
const GENERAL_FINDINGS = [F(1, 0, 0), F(0, 1, 0), F(0, 0, 1)];

export const HISTORIC_RUNS: PlannedRun[] = [
  ...SECURITY_DAYS.map<PlannedRun>((day, i) => ({
    id: id(100 + i),
    agent: SECURITY,
    ranAt: at(day),
    status: 'done',
    source: 'local',
    model: HISTORIC_MODEL,
    costUsd: SECURITY_COST[i]!,
    durationMs: SECURITY_MS[i]!,
    review: { id: id(200 + i), findings: SECURITY_FINDINGS[i]! },
  })),
  {
    id: id(110),
    agent: SECURITY,
    ranAt: at(21),
    status: 'failed',
    source: 'local',
    model: HISTORIC_MODEL,
    costUsd: null,
    durationMs: null,
    error: 'seed: provider timeout',
  },
  ...GENERAL_DAYS.map<PlannedRun>((day, i) => ({
    id: id(120 + i),
    agent: GENERAL,
    ranAt: at(day),
    status: 'done',
    source: 'local',
    model: 'openai/gpt-4.1-mini',
    costUsd: GENERAL_COST[i]!,
    durationMs: GENERAL_MS[i]!,
    review: { id: id(220 + i), findings: GENERAL_FINDINGS[i]! },
  })),
  ...[
    { n: 0, day: 9, ms: 30000 },
    { n: 1, day: 23, ms: 32000 },
  ].map<PlannedRun>(({ n, day, ms }) => ({
    id: id(130 + n),
    agent: PERFORMANCE,
    ranAt: at(day),
    status: 'done',
    source: 'ci',
    model: null,
    costUsd: 0.01,
    durationMs: ms,
  })),
];

const HOUR = 3_600_000;

/**
 * Runs relative to the moment the seed first runs, so the default 30-day view
 * demonstrates all three tiers: Security (5 decisions, 80%) and General (5
 * decisions, 40%) are ranked, API Contract (2 decisions) is small-sample and
 * Performance has a run but no decisions.
 */
export function recentRuns(now: Date): PlannedRun[] {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const local = (
    n: number,
    agent: string,
    hours: number,
    costUsd: number,
    durationMs: number,
    findings?: PlannedFindings,
  ): PlannedRun => ({
    id: id(300 + n),
    agent,
    ranAt: ago(hours * HOUR),
    status: 'done',
    source: 'local',
    model: HISTORIC_MODEL,
    costUsd,
    durationMs,
    ...(findings ? { review: { id: id(310 + n), findings } } : {}),
  });
  return [
    local(0, SECURITY, 2, 0.05, 6000, F(3, 1, 0)),
    local(1, SECURITY, 26, 0.05, 6000, F(1, 0, 1)),
    local(2, GENERAL, 72, 0.03, 5000, F(2, 3, 0)),
    {
      id: id(303),
      agent: PERFORMANCE,
      ranAt: ago(48 * HOUR),
      status: 'done',
      source: 'ci',
      model: null,
      costUsd: 0.01,
      durationMs: 31000,
    },
    local(4, 'API Contract Reviewer', 50, 0.04, 7000, F(1, 1, 0)),
  ];
}

export interface SeedPerformanceInput {
  workspaceId: string;
  repoId: string;
  agentIdsByName: ReadonlyMap<string, string>;
}

export async function seedPerformance(db: Db, input: SeedPerformanceInput): Promise<void> {
  const { workspaceId, repoId, agentIdsByName } = input;

  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, SEED_PERF_PR_NUMBER)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: SEED_PERF_PR_NUMBER,
        title: SEED_PERF_PR_TITLE,
        author: 'dev.okafor',
        branch: 'feat/webhook-retry',
        base: 'main',
        headSha: 'c0ffee484a1b',
        status: 'needs_review',
      })
      .returning();
  }
  const prId = pr!.id;

  for (const run of [...HISTORIC_RUNS, ...recentRuns(new Date())]) {
    const agentId = agentIdsByName.get(run.agent);
    if (!agentId) continue;

    await db
      .insert(t.agentRuns)
      .values({
        id: run.id,
        workspaceId,
        agentId,
        prId: run.source === 'local' ? prId : null,
        ranAt: run.ranAt,
        provider: 'openrouter',
        model: run.model,
        durationMs: run.durationMs,
        costUsd: run.costUsd,
        status: run.status,
        error: run.error ?? null,
        source: run.source,
      })
      .onConflictDoNothing();
    // The review is attempted even when the run already existed (a dev DB seeded
    // before its recent runs carried reviews); a review that exists is a no-op.
    if (!run.review) continue;

    const [review] = await db
      .insert(t.reviews)
      .values({
        id: run.review.id,
        workspaceId,
        prId,
        agentId,
        runId: run.id,
        kind: 'review',
        verdict: 'comment',
        summary: 'Seeded review for the Agent Performance demo.',
        model: 'seed',
        createdAt: run.ranAt,
      })
      .onConflictDoNothing()
      .returning({ id: t.reviews.id });
    if (!review) continue;

    const { accepted, dismissed, untriaged } = run.review.findings;
    const kinds = [
      ...Array<'accepted'>(accepted).fill('accepted'),
      ...Array<'dismissed'>(dismissed).fill('dismissed'),
      ...Array<'untriaged'>(untriaged).fill('untriaged'),
    ];
    if (kinds.length === 0) continue;
    await db.insert(t.findings).values(
      kinds.map((kind, i) => ({
        reviewId: review.id,
        file: 'src/webhooks/deliver.ts',
        startLine: 10 + i,
        endLine: 10 + i,
        severity: 'warning',
        category: 'reliability',
        title: `Seeded finding ${i + 1}`,
        rationale: 'Demo finding for the Agent Performance dashboard.',
        confidence: 0.7,
        acceptedAt: kind === 'accepted' ? run.ranAt : null,
        dismissedAt: kind === 'dismissed' ? run.ranAt : null,
      })),
    );
  }
}
