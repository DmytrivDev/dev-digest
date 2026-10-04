/**
 * Readiness, reasons, the call decision, section assembly, usage, the log line and the
 * generate rate window (SPEC-02) — pure, ring 1. Nothing here reads the clock: callers
 * pass `now`. Ordering is by `<` / the contract's enum order, never `localeCompare`
 * (NFR-2: two builds of one input are byte-identical).
 */
import {
  OnboardingFailureReason,
  OnboardingReason,
  type OnboardingEmptyReason,
  type OnboardingReadiness,
  type OnboardingTour,
  type OnboardingUsage,
} from '@devdigest/shared';
import {
  CONTROL_CHAR_RE,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SECTION_TITLES,
} from '../constants.js';
import type { ArchitectureFacts } from '../types.js';
import { cutWords, validDiagram, type GroundedTasks } from './ground.js';

type Sections = OnboardingTour['sections'];
type CriticalItem = Sections[1]['items'][number];
type ReadingItem = Sections[3]['items'][number];
type Step = Sections[2]['steps'][number];

// ---- Readiness (AC-5, AC-6) ---------------------------------------------------

export interface ReadinessInput {
  /** `repos.clone_path`. */
  clonePath: string | null;
  /** Whether the clone directory exists on disk. */
  cloneExists: boolean;
  /** `IndexState.status` of the repo-intel facade; `null` when it has no state. */
  indexStatus: string | null;
  /** `IndexState.reason` (`no_clone` when the facade found no clone). */
  indexReason: string | null;
  /** `IndexState.lastIndexedSha`; empty / `null` when never indexed. */
  lastIndexedSha: string | null;
  repoIntelEnabled: boolean;
}

/** `not_cloned` → else `not_indexed` → else `ready`. */
export function deriveReadiness(i: ReadinessInput): OnboardingReadiness {
  if (!i.clonePath || !i.cloneExists) return 'not_cloned';
  if (i.indexStatus === 'degraded' && i.indexReason === 'no_clone') return 'not_cloned';
  if (!i.repoIntelEnabled || !i.lastIndexedSha) return 'not_indexed';
  return 'ready';
}

// ---- Reasons and the call decision (AC-38..AC-41, AC-44, AC-47) -----------------

/** Dedupe and order reasons as T-1 (the contract enum order — the order they are stored in). */
export function sortReasons(reasons: Iterable<OnboardingReason>): OnboardingReason[] {
  const set = new Set(reasons);
  return OnboardingReason.options.filter((r) => set.has(r));
}

export interface IndexReasonInput {
  /** `IndexState.status`. */
  status: string;
  filesIndexed: number;
  /** `IndexState.walkTotal`; non-null only when the walk dropped files. */
  walkTotal: number | null;
  edgeCount: number;
}

/** The reasons the index alone implies, in T-1 order. */
export function indexReasons(i: IndexReasonInput): OnboardingReason[] {
  const out: OnboardingReason[] = [];
  if (i.status === 'partial' && i.filesIndexed >= 1) out.push('index_partial');
  if (i.walkTotal !== null) out.push('index_truncated');
  if (i.filesIndexed === 0) out.push('unsupported_language');
  if (i.edgeCount === 0) out.push('no_import_graph');
  return sortReasons(out);
}

/** `skip` (no model call) only when both `unsupported_language` and `no_import_graph` apply. */
export function callDecision(reasons: ReadonlyArray<OnboardingReason>): 'call' | 'skip' {
  return reasons.includes('unsupported_language') && reasons.includes('no_import_graph')
    ? 'skip'
    : 'call';
}

// ---- Sections (AC-81, AC-82, AC-87, AC-90) -------------------------------------

/** Rows of a ranked section with the reason it is empty (from the path rules, W6). */
export interface RankedRows<T> {
  items: T[];
  empty_reason: OnboardingEmptyReason | null;
}

export interface SectionInput {
  facts: ArchitectureFacts;
  /** The deterministic package diagram (AC-82); used by a skeleton only. */
  packageDiagram: string | null;
  /** Ranked critical-path files, `imported_by` filled. */
  critical: RankedRows<{ path: string; imported_by: number }>;
  /** Ranked reading-path files. */
  reading: RankedRows<{ path: string }>;
  /**
   * The deterministic steps a skeleton shows (`skeletonSteps`), and the reason How to run
   * is empty when there is no candidate command (`howToRunEmptyReason`, AC-74).
   */
  steps: { items: Step[]; empty_reason: OnboardingEmptyReason | null };
}

/** What a successful, grounded model answer contributes to a narrative tour. */
export interface NarrativeGrounded {
  /** The model's architecture answer, raw — cut and validated here (AC-77, AC-78). */
  architecture: { body: string; diagram: string | null };
  /** `groundCriticalPaths` result. */
  critical: CriticalItem[];
  /** `groundReadingPath` result. */
  reading: ReadingItem[];
  /** `groundSteps` result. */
  steps: Step[];
  /** `groundTasks` result. */
  tasks: GroundedTasks;
}

const safeRows = <T extends { path: string }>(rows: T[]): T[] =>
  rows.filter((r) => !CONTROL_CHAR_RE.test(r.path));

/** `reason` only while the section has no rows (AC-43); a section with rows has none. */
const emptyReasonFor = (count: number, reason: OnboardingEmptyReason | null): OnboardingEmptyReason | null =>
  count === 0 ? reason : null;

/** The five sections of a skeleton tour, in AC-90 order. */
export function buildSkeletonSections(input: SectionInput): Sections {
  const critical = safeRows(input.critical.items).map(
    (r): CriticalItem => ({ path: r.path, imported_by: r.imported_by, reason: null }),
  );
  const reading = safeRows(input.reading.items).map((r): ReadingItem => ({ path: r.path, why: null }));
  return [
    {
      kind: 'architecture_overview',
      title: SECTION_TITLES.architecture_overview,
      empty_reason: null,
      body: null,
      diagram: input.packageDiagram,
      facts: input.facts,
    },
    {
      kind: 'critical_paths',
      title: SECTION_TITLES.critical_paths,
      empty_reason: emptyReasonFor(critical.length, input.critical.empty_reason),
      items: critical,
    },
    {
      kind: 'how_to_run',
      title: SECTION_TITLES.how_to_run,
      empty_reason: emptyReasonFor(input.steps.items.length, input.steps.empty_reason),
      steps: input.steps.items,
    },
    {
      kind: 'guided_reading',
      title: SECTION_TITLES.guided_reading,
      empty_reason: emptyReasonFor(reading.length, input.reading.empty_reason),
      items: reading,
    },
    {
      kind: 'first_tasks',
      title: SECTION_TITLES.first_tasks,
      empty_reason: 'needs_model',
      items: [],
    },
  ];
}

/**
 * The five sections of a narrative tour. The architecture diagram is the model's, validated
 * (never the package diagram); everything else is the grounded rows. A narrative whose model
 * kept no valid step although candidates exist stores How to run empty with no reason
 * (the spec states none for it).
 */
export function buildNarrativeSections(input: SectionInput, grounded: NarrativeGrounded): Sections {
  const critical = safeRows(grounded.critical);
  const reading = safeRows(grounded.reading);
  const body = grounded.architecture.body.trim();
  return [
    {
      kind: 'architecture_overview',
      title: SECTION_TITLES.architecture_overview,
      empty_reason: null,
      body: body === '' ? null : cutWords(body),
      diagram: validDiagram(grounded.architecture.diagram),
      facts: input.facts,
    },
    {
      kind: 'critical_paths',
      title: SECTION_TITLES.critical_paths,
      empty_reason: emptyReasonFor(critical.length, input.critical.empty_reason),
      items: critical,
    },
    {
      kind: 'how_to_run',
      title: SECTION_TITLES.how_to_run,
      empty_reason: emptyReasonFor(grounded.steps.length, input.steps.empty_reason),
      steps: grounded.steps,
    },
    {
      kind: 'guided_reading',
      title: SECTION_TITLES.guided_reading,
      empty_reason: emptyReasonFor(reading.length, input.reading.empty_reason),
      items: reading,
    },
    {
      kind: 'first_tasks',
      title: SECTION_TITLES.first_tasks,
      empty_reason: grounded.tasks.empty_reason,
      items: grounded.tasks.items,
    },
  ];
}

// ---- Staleness and failure handling (AC-21, AC-33) ----------------------------

/** The tour's SHA differs from the repository's current indexed SHA. An unknown current SHA is not stale. */
export function isStale(tourSha: string, currentSha: string | null | undefined): boolean {
  return !!currentSha && currentSha !== tourSha;
}

/** Keep the stored narrative (and only record `last_failure`) when a regeneration ends in an `llm_*` failure. */
export function keepNarrative(
  stored: { status: 'narrative' | 'skeleton' } | null | undefined,
  failureReason: OnboardingReason | null | undefined,
): boolean {
  return (
    stored?.status === 'narrative' &&
    failureReason !== null &&
    failureReason !== undefined &&
    OnboardingFailureReason.safeParse(failureReason).success
  );
}

// ---- Usage and the log line (AC-102, AC-103, AC-104) --------------------------

export type UsageInput =
  /** No model call (AC-44, AC-45): nothing was spent. `provider`/`model` as the caller resolved them, or `null`. */
  | { kind: 'no_call'; provider: string | null; model: string | null; durationMs: number }
  /** The engine's result: attempts, tokens and cost as reported (`cost` may be `null`). */
  | {
      kind: 'success';
      provider: string;
      model: string;
      attempts: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;
      durationMs: number;
    }
  /** The call threw or timed out: one attempt, no tokens, no cost. */
  | { kind: 'failure'; provider: string; model: string; durationMs: number };

const wholeMs = (ms: number): number => Math.max(0, Math.round(ms));

export function usageFor(i: UsageInput): OnboardingUsage {
  switch (i.kind) {
    case 'no_call':
      return {
        llm_calls: 0,
        provider: i.provider,
        model: i.model,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        duration_ms: wholeMs(i.durationMs),
      };
    case 'success':
      return {
        llm_calls: Math.max(0, Math.trunc(i.attempts)),
        provider: i.provider,
        model: i.model,
        tokens_in: Math.round(i.tokensIn),
        tokens_out: Math.round(i.tokensOut),
        cost_usd: i.costUsd,
        duration_ms: wholeMs(i.durationMs),
      };
    case 'failure':
      return {
        llm_calls: 1,
        provider: i.provider,
        model: i.model,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        duration_ms: wholeMs(i.durationMs),
      };
  }
}

/**
 * The one info line per generation (AC-102). `model` is `none` whenever no call was made.
 * Carries ids, counts and cost only — no secret, no repo content.
 */
export function logLine(
  repoId: string,
  usage: OnboardingUsage,
  status: OnboardingTour['status'],
  reasons: ReadonlyArray<OnboardingReason>,
): string {
  const model =
    usage.llm_calls === 0
      ? 'none'
      : [usage.provider, usage.model].filter((p): p is string => !!p).join('/') || 'none';
  const num = (n: number | null): string => (n === null ? 'unknown' : String(n));
  return (
    `onboarding: repo=${repoId} llm_calls=${usage.llm_calls} model=${model}` +
    ` tokens_in=${num(usage.tokens_in)} tokens_out=${num(usage.tokens_out)}` +
    ` cost_usd=${num(usage.cost_usd)} duration_ms=${usage.duration_ms}` +
    ` status=${status} reasons=${reasons.length > 0 ? reasons.join(',') : 'none'}`
  );
}

// ---- Rate window (AC-16) ----------------------------------------------------------

/**
 * Sliding 60 s window, at most 3 admitted. `history` holds the admitted request times
 * (ms) of one workspace; the returned history is the one to keep. A refused request is
 * not recorded, so a client that keeps retrying is admitted again 60 s after its last
 * admitted request.
 */
export function admitRequest(
  history: ReadonlyArray<number>,
  nowMs: number,
): { allowed: boolean; history: number[] } {
  const recent = history.filter((t) => nowMs - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return { allowed: false, history: recent };
  return { allowed: true, history: [...recent, nowMs] };
}
