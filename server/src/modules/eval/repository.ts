import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  EvalCaseOutcomeRow,
  EvalCaseRow,
  EvalSuiteRunRow,
  FindingRow,
  PullRow,
} from '../../db/rows.js';
import type { EvalExpectation } from '@devdigest/shared';

/**
 * Eval data-access (SPEC-04). Owns `eval_cases`, `eval_suite_runs` and
 * `eval_case_outcomes`; reads findings, reviews, PRs and agents for context.
 *
 * Tenancy (AC-103): `eval_cases` and `eval_suite_runs` carry `workspace_id`, so every
 * read of them is scoped by it. `findings` and `eval_case_outcomes` do not — findings
 * inherit tenancy through `reviews.workspace_id` (`server/INSIGHTS.md:45`) and are only
 * ever read through that join; outcomes are only read by ids that came out of an
 * already-scoped case/run read. The methods that take a bare id for that reason
 * (`outcomesForRun`, `latestOutcomesForCases`, `insertOutcome`, `bumpProgress`,
 * `finishRun`, `failAllRunning`) are documented as such below.
 *
 * Drizzle rows are this module's currency; `helpers/dto.ts` maps them to the wire
 * shape before anything leaves the module.
 */

export type { EvalCaseRow, EvalSuiteRunRow, EvalCaseOutcomeRow };
export type ReviewRow = typeof t.reviews.$inferSelect;

/** Everything `createCaseFromFinding` needs about a finding, read in one scoped pass. */
export interface FindingCaseContext {
  finding: FindingRow;
  review: ReviewRow;
  pull: PullRow;
  repoFullName: string;
  /** The stored patch of `finding.file` in this PR; null when the file has none. */
  patch: string | null;
}

export interface InsertEvalCase {
  workspaceId: string;
  agentId: string;
  /** 'finding' when omitted. A 'manual' case has no source finding, PR, repo or labels. */
  origin?: 'finding' | 'manual';
  sourceFindingId: string | null;
  sourcePrNumber: number | null;
  sourceRepo: string | null;
  labels: { severity: string; category: string; title: string } | null;
  name: string;
  inputDiff: string;
  inputMeta: { pr_number: number | null; title: string; body: string | null };
  expectedOutput: EvalExpectation;
  notes?: string | null;
}

export interface EvalCasePatch {
  name?: string;
  notes?: string | null;
  expectedOutput?: EvalExpectation;
  /** Manual cases only (the service refuses a finding-born case before it gets here). */
  inputDiff?: string;
  inputMeta?: { pr_number: null; title: string; body: string | null };
}

export interface InsertEvalRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  config: unknown;
  caseIds: string[];
  casesTotal: number;
}

export interface InsertEvalOutcome {
  runId: string;
  caseId: string;
  caseName: string;
  kind: 'must_find' | 'must_not_flag';
  expectation: EvalExpectation;
  status: 'scored' | 'errored';
  pass: boolean | null;
  errorReason: string | null;
  findingsMatched: number;
  findingsTotal: number;
  groundingKept: number;
  groundingTotal: number;
  durationMs: number;
  costUsd: number | null;
  actual: unknown[];
}

export interface FinishEvalRun {
  status: 'completed' | 'failed';
  errorReason: 'all_cases_errored' | 'interrupted' | null;
  finishedAt: Date;
  casesDone: number;
  casesPassed: number;
  casesScored: number;
  casesErrored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

/** An agent as the eval overview needs it. */
export interface EvalAgentRow {
  id: string;
  name: string;
  provider: string;
  model: string;
}

/** Postgres unique_violation, whether the driver error is bare or wrapped as `cause`. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- finding context (for "turn into eval case") -------------------------

  /**
   * The finding, its review, PR, repo name and the stored patch of its file.
   * `undefined` when the finding does not exist OR belongs to another workspace —
   * the review is the tenancy anchor (`reviews.workspace_id`), and the PR must sit in
   * the same workspace too.
   */
  async findingForCase(
    workspaceId: string,
    findingId: string,
  ): Promise<FindingCaseContext | undefined> {
    const [row] = await this.db
      .select({
        finding: t.findings,
        review: t.reviews,
        pull: t.pullRequests,
        repoFullName: t.repos.fullName,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(
        and(
          eq(t.findings.id, findingId),
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.pullRequests.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!row) return undefined;

    const [file] = await this.db
      .select({ patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, row.pull.id), eq(t.prFiles.path, row.finding.file)))
      .limit(1);

    return {
      finding: row.finding,
      review: row.review,
      pull: row.pull,
      repoFullName: row.repoFullName,
      patch: file?.patch ?? null,
    };
  }

  // ---- cases ----------------------------------------------------------------

  async caseByAgentFinding(
    workspaceId: string,
    agentId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.agentId, agentId),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      );
    return row;
  }

  /** Names already used in an agent's suite (for `-2`, `-3` collision suffixes). */
  async caseNamesForAgent(workspaceId: string, agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.evalCases.name })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)));
    return rows.map((r) => r.name);
  }

  /**
   * Insert a case. A second insert for the same `(agent, source finding)` is a no-op
   * on the unique index and returns `undefined`, so the caller can reread the winner.
   */
  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        origin: values.origin ?? 'finding',
        sourceFindingId: values.sourceFindingId,
        sourcePrNumber: values.sourcePrNumber,
        sourceRepo: values.sourceRepo,
        labels: values.labels,
        name: values.name,
        inputDiff: values.inputDiff,
        inputMeta: values.inputMeta,
        expectedOutput: values.expectedOutput,
        notes: values.notes ?? null,
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  /** An agent's suite, in creation order (name breaks ties). */
  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.name));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: EvalCasePatch,
  ): Promise<EvalCaseRow | undefined> {
    const set: Partial<typeof t.evalCases.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.notes !== undefined) set.notes = patch.notes;
    if (patch.expectedOutput !== undefined) set.expectedOutput = patch.expectedOutput;
    if (patch.inputDiff !== undefined) set.inputDiff = patch.inputDiff;
    if (patch.inputMeta !== undefined) set.inputMeta = patch.inputMeta;
    if (Object.keys(set).length === 0) return this.getCase(workspaceId, id);
    const [row] = await this.db
      .update(t.evalCases)
      .set(set)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  /** Stored outcomes have no FK to cases, so deleting one leaves them untouched (AC-35). */
  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  // ---- outcomes -------------------------------------------------------------

  /**
   * The newest stored outcome per case, as caseId -> outcome. Called only with ids
   * from an already-scoped case read (outcomes carry no `workspace_id`).
   */
  async latestOutcomesForCases(caseIds: string[]): Promise<Map<string, EvalCaseOutcomeRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.evalCaseOutcomes.caseId])
      .from(t.evalCaseOutcomes)
      .where(inArray(t.evalCaseOutcomes.caseId, caseIds))
      .orderBy(t.evalCaseOutcomes.caseId, desc(t.evalCaseOutcomes.createdAt));
    return new Map(rows.map((r) => [r.caseId, r]));
  }

  /** Outcomes of one run, in processing order. Only call with an id from a scoped run read. */
  async outcomesForRun(runId: string): Promise<EvalCaseOutcomeRow[]> {
    return this.db
      .select()
      .from(t.evalCaseOutcomes)
      .where(eq(t.evalCaseOutcomes.runId, runId))
      .orderBy(asc(t.evalCaseOutcomes.createdAt), asc(t.evalCaseOutcomes.caseName));
  }

  /** Called only by the executor of a run this workspace started. */
  async insertOutcome(values: InsertEvalOutcome): Promise<void> {
    await this.db.insert(t.evalCaseOutcomes).values(values);
  }

  // ---- runs -----------------------------------------------------------------

  /**
   * Insert a `running` run. The partial unique index allows one running run per agent,
   * so a second concurrent start loses with Postgres `23505` — returned as `'conflict'`
   * (the 409 `run_in_progress` path) instead of thrown.
   */
  async insertRun(values: InsertEvalRun): Promise<EvalSuiteRunRow | 'conflict'> {
    try {
      const [row] = await this.db.insert(t.evalSuiteRuns).values(values).returning();
      return row!;
    } catch (err) {
      if (isUniqueViolation(err)) return 'conflict';
      throw err;
    }
  }

  /** An agent's runs, newest first. */
  async listRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.agentId, agentId)),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
      .limit(limit);
  }

  async getRun(workspaceId: string, id: string): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row;
  }

  /** Progress counter. Called only by the executor of a run it owns. */
  async bumpProgress(runId: string, casesDone: number): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({ casesDone })
      .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')));
  }

  /** Whether the run is still `running` (false once finished or reaped). */
  async isRunning(runId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Final write of a run. Conditional on `status = 'running'`, so a run the stale
   * reaper already failed is never overwritten by a late executor. Returns whether
   * this call was the one that finished it.
   */
  async finishRun(runId: string, values: FinishEvalRun): Promise<boolean> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set(values)
      .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length > 0;
  }

  /** The newest run of any status for each agent in the workspace, as agentId -> run. */
  async latestRunPerAgent(workspaceId: string): Promise<Map<string, EvalSuiteRunRow>> {
    const rows = await this.db
      .selectDistinctOn([t.evalSuiteRuns.agentId])
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(t.evalSuiteRuns.agentId, desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id));
    return new Map(rows.map((r) => [r.agentId, r]));
  }

  /**
   * Fail runs still `running` that started before `olderThan` (AC-58, lazy reaping).
   * Returns how many were failed.
   */
  async failStaleRuns(workspaceId: string, olderThan: Date): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', errorReason: 'interrupted', finishedAt: new Date() })
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.status, 'running'),
          lt(t.evalSuiteRuns.startedAt, olderThan),
        ),
      )
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }

  /**
   * Boot reaping: a `running` row at process start has no executor left (AC-58).
   * Deliberately workspace-agnostic — it runs once, before the server accepts requests.
   */
  async failAllRunning(): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', errorReason: 'interrupted', finishedAt: new Date() })
      .where(eq(t.evalSuiteRuns.status, 'running'))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }

  // ---- agents (overview) ----------------------------------------------------

  /** Every agent of the workspace, enabled or not, by name. */
  async agentsInWorkspace(workspaceId: string): Promise<EvalAgentRow[]> {
    return this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        provider: t.agents.provider,
        model: t.agents.model,
      })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.name), asc(t.agents.id));
  }

  /** Case count per agent as agentId -> n; agents with no case are absent. */
  async caseCountsByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.evalCases.agentId, count: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(eq(t.evalCases.workspaceId, workspaceId))
      .groupBy(t.evalCases.agentId);
    return new Map(rows.map((r) => [r.agentId, r.count]));
  }
}
