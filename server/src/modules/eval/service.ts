import type {
  EvalAlert,
  EvalCase,
  EvalCaseOutcome,
  EvalCaseUpdate,
  EvalCompare,
  EvalDashboard,
  EvalExpectation,
  EvalOverviewRow,
  EvalRunConfig,
  EvalRunStartResponse,
  EvalSuiteRun,
  LLMProvider,
  Provider,
  UnifiedDiff,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import type { AgentsRepository } from '../agents/repository.js';
import { assembleSkills } from '../reviews/helpers.js';
import {
  COMPARE_ERROR,
  CREATE_CASE_ERROR,
  RUN_LIST_LIMIT,
  RUN_START_ERROR,
  STALE_RUN_MS,
  UPDATE_CASE_ERROR,
} from './constants.js';
import {
  buildCaseDiff,
  caseDiffTooLarge,
  diffFilePath,
  rangeIntersectsHunks,
  slugifyTitle,
  uniqueCaseName,
} from './helpers/case-diff.js';
import { regressionAlert } from './helpers/alert.js';
import { compareRuns, orderRuns, promptLineDiff } from './helpers/compare.js';
import { caseRowToDto, outcomeRowToDto, runRowToDto } from './helpers/dto.js';
import { evalIneligibleReason } from './helpers/eligibility.js';
import type { EvalRepository } from './repository.js';
import { EvalRunExecutor, type CaseSnapshot } from './run-executor.js';

/**
 * Eval use cases (SPEC-04): cases from findings, case edit/read/delete, suite runs, and
 * the compare / overview / dashboard reads.
 *
 * Ring 3. Built from the ports and repositories it uses — never the `Container`
 * (`service-not-to-composition-root`); `routes.ts` does the composition. The diff parser
 * is injected because it lives in `adapters/` and a service may not import an adapter.
 */
export interface EvalServiceDeps {
  repo: EvalRepository;
  agents: Pick<AgentsRepository, 'getById' | 'list' | 'linkedSkills'>;
  parseDiff: (raw: string) => UnifiedDiff;
  resolveLlm: (provider: Provider) => Promise<LLMProvider>;
  now?: () => Date;
}

/** Create outcome: 201 for a new case, 200 when the finding already had one (AC-17). */
export interface CreateCaseResult {
  status: 200 | 201;
  case: EvalCase;
}

/** Start outcome: the 202 body plus a promise that settles when the run is finished. */
export interface StartRunResult extends EvalRunStartResponse {
  /** For tests only — routes drop it. Never rejects. */
  done: Promise<void>;
}

const UNPROCESSABLE = 422;
const CONFLICT = 409;

/** Human message per create-case reason; the code is what clients map on. */
const CREATE_CASE_MESSAGE = {
  [CREATE_CASE_ERROR.notTriaged]: 'Accept or dismiss the finding before turning it into an eval case.',
  [CREATE_CASE_ERROR.notAgentFinding]: 'This finding was not produced by an agent.',
  [CREATE_CASE_ERROR.agentMissing]: 'The agent that produced this finding no longer exists.',
  [CREATE_CASE_ERROR.patchMissing]: 'The finding’s file has no stored patch.',
  [CREATE_CASE_ERROR.rangeOutsideHunks]: 'The finding’s lines are outside the changed hunks of its file.',
  [CREATE_CASE_ERROR.diffTooLarge]: 'The file’s diff is too large to store as an eval case.',
} as const;

function createError(code: keyof typeof CREATE_CASE_MESSAGE): AppError {
  return new AppError(code, CREATE_CASE_MESSAGE[code], UNPROCESSABLE);
}

function runInProgress(): AppError {
  return new AppError(
    RUN_START_ERROR.runInProgress,
    'A run of this agent is already in progress.',
    CONFLICT,
  );
}

export class EvalService {
  constructor(private readonly deps: EvalServiceDeps) {}

  // ===========================================================================
  // Create a case from a triaged finding (AC-9 … AC-24)
  // ===========================================================================

  async createCaseFromFinding(workspaceId: string, findingId: string): Promise<CreateCaseResult> {
    const { repo, agents, parseDiff } = this.deps;

    // 1. The finding, scoped through its review's workspace (404 across tenants, AC-103).
    const ctx = await repo.findingForCase(workspaceId, findingId);
    if (!ctx) throw new NotFoundError('Finding not found');
    const { finding, review, pull } = ctx;

    // 2. Eligibility — the same pure rule the reviews response uses, so the button and
    //    the endpoint cannot disagree (AC-2…AC-4, AC-18…AC-20).
    const agentId = review.agentId;
    const agent = agentId ? await agents.getById(workspaceId, agentId) : undefined;
    const reason = evalIneligibleReason(
      { acceptedAt: finding.acceptedAt, dismissedAt: finding.dismissedAt },
      agentId,
      agent !== undefined,
    );
    if (reason === 'not_triaged') throw createError(CREATE_CASE_ERROR.notTriaged);
    if (reason === 'not_agent_finding') throw createError(CREATE_CASE_ERROR.notAgentFinding);
    if (reason === 'agent_missing') throw createError(CREATE_CASE_ERROR.agentMissing);
    // `reason === null` implies a review agent exists.
    if (!agentId || !agent) throw createError(CREATE_CASE_ERROR.notAgentFinding);

    // 3. Already a case for this (agent, finding) → return it unchanged (AC-17, AC-24).
    const existing = await repo.caseByAgentFinding(workspaceId, agentId, findingId);
    if (existing) return { status: 200, case: await this.toDto(existing) };

    // 4–6. The stored single-file diff must exist, fit, and contain the finding's lines.
    if (ctx.patch === null) throw createError(CREATE_CASE_ERROR.patchMissing);
    const diff = buildCaseDiff(finding.file, ctx.patch);
    if (caseDiffTooLarge(diff)) throw createError(CREATE_CASE_ERROR.diffTooLarge);
    if (!rangeIntersectsHunks(parseDiff(diff), finding.file, finding.startLine, finding.endLine)) {
      throw createError(CREATE_CASE_ERROR.rangeOutsideHunks);
    }

    // 7. A kebab name from the finding's title, unique inside the agent's suite (AC-16).
    const taken = new Set(await repo.caseNamesForAgent(workspaceId, agentId));
    const name = uniqueCaseName(slugifyTitle(finding.title), taken);

    // 8. Everything the case needs is COPIED, so later edits of the PR, the finding or the
    //    review cannot change what the case runs (AC-14).
    const expectedOutput: EvalExpectation = {
      kind: finding.acceptedAt ? 'must_find' : 'must_not_flag',
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
    };
    const inserted = await repo.insertCase({
      workspaceId,
      agentId,
      sourceFindingId: finding.id,
      sourcePrNumber: pull.number,
      sourceRepo: ctx.repoFullName,
      labels: { severity: finding.severity, category: finding.category, title: finding.title },
      name,
      inputDiff: diff,
      inputMeta: { pr_number: pull.number, title: pull.title, body: pull.body ?? null },
      expectedOutput,
    });
    if (inserted) return { status: 201, case: caseRowToDto(inserted, null) };

    // 9. Lost a race against a concurrent identical request → return the winner.
    const winner = await repo.caseByAgentFinding(workspaceId, agentId, findingId);
    if (!winner) throw new AppError('internal_error', 'Could not create the eval case', 500);
    return { status: 200, case: await this.toDto(winner) };
  }

  // ===========================================================================
  // Case reads / edit / delete
  // ===========================================================================

  /** An agent's suite. 404 when the agent is not in the workspace. */
  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    const { repo, agents } = this.deps;
    if (!(await agents.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const rows = await repo.listCases(workspaceId, agentId);
    const outcomes = await repo.latestOutcomesForCases(rows.map((r) => r.id));
    return rows.map((r) => caseRowToDto(r, outcomes.get(r.id)));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCase> {
    const row = await this.deps.repo.getCase(workspaceId, id);
    if (!row) throw new NotFoundError('Eval case not found');
    return this.toDto(row);
  }

  /**
   * Edit name, notes and/or expectation (AC-41…AC-43). The expectation must stay in the
   * case's own file and inside its hunks; `kind` may change freely. Stored outcomes of
   * past runs are not touched (AC-35).
   */
  async updateCase(workspaceId: string, id: string, body: EvalCaseUpdate): Promise<EvalCase> {
    const { repo, parseDiff } = this.deps;
    const row = await repo.getCase(workspaceId, id);
    if (!row) throw new NotFoundError('Eval case not found');

    const expectation = body.expectation;
    if (expectation) {
      const parsed = parseDiff(row.inputDiff ?? '');
      if (expectation.file !== diffFilePath(parsed)) {
        throw new AppError(
          UPDATE_CASE_ERROR.fileMismatch,
          'The expectation must stay in the file this case’s diff is for.',
          UNPROCESSABLE,
        );
      }
      if (!rangeIntersectsHunks(parsed, expectation.file, expectation.start_line, expectation.end_line)) {
        throw new AppError(
          UPDATE_CASE_ERROR.rangeOutsideHunks,
          'The expectation’s lines are outside the changed hunks of the case diff.',
          UNPROCESSABLE,
        );
      }
    }

    const updated = await repo.updateCase(workspaceId, id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(expectation ? { expectedOutput: expectation } : {}),
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return this.toDto(updated);
  }

  async deleteCase(workspaceId: string, id: string): Promise<void> {
    const deleted = await this.deps.repo.deleteCase(workspaceId, id);
    if (!deleted) throw new NotFoundError('Eval case not found');
  }

  // ===========================================================================
  // Suite runs (AC-46 … AC-60)
  // ===========================================================================

  /**
   * Start a run over the agent's cases as they are right now. Answers as soon as the run
   * row exists; the cases are reviewed by a detached executor (AC-46, AC-60), which works
   * on an in-memory snapshot so a later edit or delete of a case cannot change this run.
   */
  async startRun(workspaceId: string, agentId: string): Promise<StartRunResult> {
    const { repo, agents, parseDiff, resolveLlm } = this.deps;

    const agent = await agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    // A run left `running` past the stale window is dead; reap it so it cannot block the start.
    await this.reapStale(workspaceId);
    const recent = await repo.listRuns(workspaceId, agentId, RUN_LIST_LIMIT);
    if (recent.some((r) => r.status === 'running')) throw runInProgress();

    const caseRows = await repo.listCases(workspaceId, agentId);
    if (caseRows.length === 0) {
      throw new AppError(
        RUN_START_ERROR.noCases,
        'This agent has no eval cases to run.',
        UNPROCESSABLE,
      );
    }

    let llm: LLMProvider;
    try {
      llm = await resolveLlm(agent.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError(
          RUN_START_ERROR.providerKeyMissing,
          `No API key is configured for ${agent.provider}.`,
          UNPROCESSABLE,
        );
      }
      throw err;
    }

    // The skills the run will carry: ENABLED links only, in link order (AC-47). The
    // blocks come from the same assembler a review uses, so an imported skill is wrapped
    // in its untrusted delimiter here too (NFR-5). Token counts are not needed here.
    const links = await agents.linkedSkills(agent.id);
    const assembly = assembleSkills(
      links.map((l) => l.skill),
      () => 0,
    );
    const config: EvalRunConfig = {
      system_prompt: agent.systemPrompt,
      model: agent.model,
      provider: agent.provider,
      strategy: agent.strategy,
      skills: links
        .filter((l) => l.skill.enabled)
        .map((l) => ({ name: l.skill.name, version: l.skill.version })),
    };

    const run = await repo.insertRun({
      workspaceId,
      agentId: agent.id,
      agentVersion: agent.version,
      config,
      caseIds: caseRows.map((r) => r.id),
      casesTotal: caseRows.length,
    });
    if (run === 'conflict') throw runInProgress();

    const cases: CaseSnapshot[] = caseRows.map((row) => {
      const dto = caseRowToDto(row, null);
      return {
        id: dto.id,
        name: dto.name,
        inputDiff: dto.input_diff,
        inputMeta: dto.input_meta,
        expectation: dto.expectation,
      };
    });

    const executor = new EvalRunExecutor({
      store: repo,
      parseDiff,
      now: () => this.now().getTime(),
    });
    // Detached on purpose (A8). `execute` never rejects; the catch is the second net so
    // an unexpected bug can never become an unhandled rejection.
    const done = executor
      .execute({
        runId: run.id,
        startedAt: run.startedAt,
        cases,
        config,
        skillBlocks: assembly.blocks,
        llm,
      })
      .catch(() => undefined);

    return { run_id: run.id, status: 'running', cases_total: run.casesTotal, done };
  }

  /** An agent's runs, newest first (without per-case outcomes). */
  async listRuns(workspaceId: string, agentId: string): Promise<EvalSuiteRun[]> {
    const { repo, agents } = this.deps;
    if (!(await agents.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    await this.reapStale(workspaceId);
    const rows = await repo.listRuns(workspaceId, agentId, RUN_LIST_LIMIT);
    return rows.map((r) => runRowToDto(r));
  }

  /** One run with its per-case outcomes (progress while running, results when done). */
  async getRun(workspaceId: string, id: string): Promise<EvalSuiteRun> {
    const { repo } = this.deps;
    await this.reapStale(workspaceId);
    const row = await repo.getRun(workspaceId, id);
    if (!row) throw new NotFoundError('Eval run not found');
    return runRowToDto(row, await repo.outcomesForRun(row.id));
  }

  // ===========================================================================
  // Compare, overview, dashboard (AC-79 … AC-97)
  // ===========================================================================

  /** Compare two completed runs of one agent; the earlier one is "old" (AC-90). */
  async compare(workspaceId: string, aId: string, bId: string): Promise<EvalCompare> {
    const { repo } = this.deps;
    await this.reapStale(workspaceId);
    const [a, b] = await Promise.all([
      repo.getRun(workspaceId, aId),
      repo.getRun(workspaceId, bId),
    ]);
    if (!a || !b) throw new NotFoundError('Eval run not found');

    if (a.id === b.id) {
      throw new AppError(COMPARE_ERROR.sameRun, 'Pick two different runs to compare.', UNPROCESSABLE);
    }
    if (a.agentId !== b.agentId) {
      throw new AppError(
        COMPARE_ERROR.differentAgents,
        'Only runs of the same agent can be compared.',
        UNPROCESSABLE,
      );
    }
    if (a.status !== 'completed' || b.status !== 'completed') {
      throw new AppError(
        COMPARE_ERROR.runNotCompleted,
        'Only completed runs can be compared.',
        CONFLICT,
      );
    }

    const { old: oldRun, new: newRun } = orderRuns(runRowToDto(a), runRowToDto(b));
    // Outcomes come from the DB: aggregation needs each outcome's `kind`, which only the
    // stored snapshot carries.
    const [oldOutcomes, newOutcomes] = await Promise.all([
      repo.outcomesForRun(oldRun.id),
      repo.outcomesForRun(newRun.id),
    ]);

    return {
      old: oldRun,
      new: newRun,
      ...compareRuns(
        oldRun,
        newRun,
        oldOutcomes.map(outcomeRowToDto),
        newOutcomes.map(outcomeRowToDto),
      ),
      prompt_diff: promptLineDiff(oldRun.config.system_prompt, newRun.config.system_prompt),
    };
  }

  /** Every agent of the workspace — zero-case agents included — with its latest run (AC-79). */
  async overview(workspaceId: string): Promise<EvalOverviewRow[]> {
    const { repo, agents } = this.deps;
    await this.reapStale(workspaceId);
    const [list, counts, latest] = await Promise.all([
      agents.list(workspaceId),
      repo.caseCountsByAgent(workspaceId),
      repo.latestRunPerAgent(workspaceId),
    ]);
    return list.map((agent) => {
      const run = latest.get(agent.id);
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        model: agent.model,
        cases_total: counts.get(agent.id) ?? 0,
        latest_run: run ? runRowToDto(run) : null,
      };
    });
  }

  /** One agent's dashboard: last runs, the trend of completed ones, the regression alert. */
  async dashboard(workspaceId: string, agentId: string): Promise<EvalDashboard> {
    const { repo, agents } = this.deps;
    const agent = await agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    await this.reapStale(workspaceId);

    const [rows, counts] = await Promise.all([
      repo.listRuns(workspaceId, agentId, RUN_LIST_LIMIT),
      repo.caseCountsByAgent(workspaceId),
    ]);
    const runs = rows.map((r) => runRowToDto(r));
    const completed = runs.filter((r) => r.status === 'completed');

    // The alert reads the outcomes of the two newest completed runs only.
    const outcomes = new Map<string, EvalCaseOutcome[]>();
    for (const run of completed.slice(0, 2)) {
      outcomes.set(run.id, (await repo.outcomesForRun(run.id)).map(outcomeRowToDto));
    }
    const alert: EvalAlert | null = regressionAlert(completed, (id) => outcomes.get(id) ?? []);

    return {
      agent: { id: agent.id, name: agent.name, provider: agent.provider, model: agent.model },
      cases_total: counts.get(agent.id) ?? 0,
      runs,
      trend: [...completed].reverse().map((r) => ({
        started_at: r.started_at,
        recall: r.recall,
        precision: r.precision,
        citation_accuracy: r.citation_accuracy,
      })),
      alert,
    };
  }

  // ---- helpers --------------------------------------------------------------

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /** Lazy reaping (A4): fail this workspace's runs still `running` past the stale window. */
  private async reapStale(workspaceId: string): Promise<void> {
    await this.deps.repo.failStaleRuns(workspaceId, new Date(this.now().getTime() - STALE_RUN_MS));
  }

  private async toDto(row: Parameters<typeof caseRowToDto>[0]): Promise<EvalCase> {
    const outcomes = await this.deps.repo.latestOutcomesForCases([row.id]);
    return caseRowToDto(row, outcomes.get(row.id));
  }
}
