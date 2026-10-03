import { z } from 'zod';
import { Risk } from '@devdigest/shared';
import type {
  BriefInput,
  BriefInputSource,
  ChangedSymbol,
  Intent,
  SmartDiffRole,
} from '@devdigest/shared';

/**
 * Internal types of the PR Brief rules (ring 1) and the application layer. No I/O.
 * The wire contract lives in `@devdigest/shared` (`PrBrief`); the only Zod schema here is
 * the api <-> LLM shape (precedent `onboarding/types.ts`).
 */

/**
 * What the model must return (contract C-4). NO length or `min` keywords on purpose: lengths
 * are cut after the call (AC-81), so an over-long answer must not become a 502, and the
 * provider's strict-mode JSON schema stays simple.
 */
export const BriefModelOutput = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(
    z.object({
      file: z.string(),
      line: z.number().int(),
      reason: z.string(),
    }),
  ),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

/** An inclusive new-side line range of one hunk. */
export interface LineRange {
  start: number;
  end: number;
}

/** One stored PR file as the repository returns it. `patch` is null for binary / oversized files. */
export interface StoredFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** Per-file facts the prompt and the validation read. Never carries a hunk body (AC-51). */
export interface FileStat {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  /** New-side changed ranges, from the hunk headers only. */
  ranges: LineRange[];
  hasPatch: boolean;
}

/** A caller the blast map lists, with the rank the budget cuts by (lowest first). */
export interface BlastCallerFact {
  file: string;
  symbol: string;
  line: number;
  rank: number;
}

/**
 * One enabled agent and the documents it attaches for a repo (AC-55). The shape the brief
 * needs, declared here so the service depends on no other module's repository; the
 * project-context repository's `EnabledAgentDocs` satisfies it structurally.
 */
export interface AgentDocs {
  agentName: string;
  /** The agent's own attached paths, in attachment order. */
  own: string[];
  /** Its linked skills, in link order, each with its enabled flag and paths. */
  linked: { enabled: boolean; paths: string[] }[];
}

/** A project spec document read from the clone. */
export interface SpecDoc {
  path: string;
  content: string;
}

/** The text-length ceilings the budget sets in its last tier (AC-62 tier 6). */
export interface TextLimits {
  title?: number;
  intent?: number;
  blast?: number;
}

/** Everything the prompt is built from. The budget cuts a copy of it, never the original. */
export interface BriefFacts {
  title: string;
  description: string | null;
  linkedIssue: { number: number; title: string; body: string } | null;
  intent: Intent | null;
  blast: { summary: string; changedSymbols: ChangedSymbol[]; callers: BlastCallerFact[] } | null;
  /** The rows shown to the model. */
  files: FileStat[];
  /** How many files the PR has in total (>= `files.length`). */
  filesTotal: number;
  specs: SpecDoc[];
  /** Sources with nothing to show, by reason code — named in one trusted line. */
  unavailable: Partial<Record<BriefInputSource, string>>;
  textLimits: TextLimits;
}

/** The prompt, split the way `LLMProvider.completeStructured` takes it. */
export interface RenderedPrompt {
  system: string;
  user: string;
}

/** One `inputs` entry (AC-60). */
export type InputRecord = BriefInput;

/** What the budget did to one source (AC-63). */
export interface BudgetCut {
  source: BriefInputSource;
  status: 'truncated' | 'missing';
  reason: 'over_budget';
  /** diff_stats only: how many file rows were cut. */
  omitted?: number;
}
