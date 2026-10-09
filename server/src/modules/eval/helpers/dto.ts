import {
  EvalActualFinding,
  EvalCaseInputMeta,
  EvalCaseLabels,
  EvalExpectation,
  EvalRunConfig,
  type EvalCase,
  type EvalCaseOutcome,
  type EvalSuiteRun,
} from '@devdigest/shared';
import type { EvalCaseOutcomeRow, EvalCaseRow, EvalSuiteRunRow } from '../../../db/rows.js';

/**
 * Row -> wire mappers for the eval module (snake_case DTOs; Ban 3: a Drizzle row never
 * leaves the module). Ring 1 in spirit — pure, no I/O.
 *
 * Several jsonb columns are nullable or untyped in the database while the wire contract
 * requires them. Mapping is therefore defensive: a value that fails its schema falls back
 * to a recognisable placeholder instead of throwing on a read path — a malformed legacy
 * row must not take the whole list down.
 */

const DIFF_FILE_RE = /^diff --git a\/(.+?) b\/\1$/m;

/** The file a stored case diff is for, read from its `diff --git` header; '' if absent. */
function fileOfDiff(diff: string | null): string {
  return (diff && DIFF_FILE_RE.exec(diff)?.[1]) || '';
}

function parseExpectation(raw: unknown, fallbackFile: string): EvalExpectation {
  const parsed = EvalExpectation.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { kind: 'must_find', file: fallbackFile, start_line: 1, end_line: 1 };
}

export function outcomeRowToDto(row: EvalCaseOutcomeRow): EvalCaseOutcome {
  const actual = EvalActualFinding.array().safeParse(row.actual);
  return {
    case_id: row.caseId,
    case_name: row.caseName,
    kind: row.kind,
    expectation: parseExpectation(row.expectation, ''),
    status: row.status,
    pass: row.pass,
    error_reason: row.errorReason,
    findings_matched: row.findingsMatched,
    findings_total: row.findingsTotal,
    grounding_kept: row.groundingKept,
    grounding_total: row.groundingTotal,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    actual: actual.success ? actual.data : [],
  };
}

export function caseRowToDto(
  row: EvalCaseRow,
  lastOutcome?: EvalCaseOutcomeRow | null,
): EvalCase {
  const meta = EvalCaseInputMeta.safeParse(row.inputMeta);
  const base = {
    id: row.id,
    agent_id: row.agentId,
    name: row.name,
    notes: row.notes,
    input_diff: row.inputDiff ?? '',
    expectation: parseExpectation(row.expectedOutput, fileOfDiff(row.inputDiff)),
    created_at: row.createdAt.toISOString(),
    last_outcome: lastOutcome ? outcomeRowToDto(lastOutcome) : null,
  };

  // A manual case has no source finding, PR or labels; its meta never carries a PR number.
  if (row.origin === 'manual') {
    return {
      ...base,
      input_meta: {
        pr_number: null,
        title: meta.success ? meta.data.title : '',
        body: meta.success ? meta.data.body : null,
      },
      origin: 'manual',
      labels: null,
      source: null,
    };
  }

  const labels = EvalCaseLabels.safeParse(row.labels);
  return {
    ...base,
    input_meta: meta.success
      ? meta.data
      : { pr_number: row.sourcePrNumber ?? null, title: '', body: null },
    origin: 'finding',
    labels: labels.success ? labels.data : { severity: '', category: '', title: row.name },
    source: {
      finding_id: row.sourceFindingId,
      pr_number: row.sourcePrNumber ?? 0,
      repo: row.sourceRepo ?? '',
      // SET NULL on the finding's deletion: the case stays runnable, its link is gone (AC-45).
      available: row.sourceFindingId !== null,
    },
  };
}

const EMPTY_RUN_CONFIG: EvalRunConfig = {
  system_prompt: '',
  model: '',
  provider: 'openrouter',
  strategy: 'auto',
  skills: [],
};

export function runRowToDto(row: EvalSuiteRunRow, outcomes?: EvalCaseOutcomeRow[]): EvalSuiteRun {
  const config = EvalRunConfig.safeParse(row.config);
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_version: row.agentVersion,
    status: row.status,
    error_reason: row.errorReason,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    cases_total: row.casesTotal,
    cases_done: row.casesDone,
    cases_passed: row.casesPassed,
    cases_scored: row.casesScored,
    cases_errored: row.casesErrored,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    config: config.success ? config.data : EMPTY_RUN_CONFIG,
    ...(outcomes ? { outcomes: outcomes.map(outcomeRowToDto) } : {}),
  };
}
