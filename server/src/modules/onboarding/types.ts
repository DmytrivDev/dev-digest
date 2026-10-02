import { z } from 'zod';
import type { CommitTouch, OnboardingArchitectureFacts } from '@devdigest/shared';

/**
 * Internal types shared by the onboarding rules (ring 1) and the application layer.
 * No I/O. The wire contract lives in `@devdigest/shared` (`OnboardingTour`); the
 * only Zod schema here is the api <-> LLM shape.
 */

/** A file with its tour rank: `rank = pagerank * (1 + hotness)` (AC-52). */
export interface RankedFile {
  path: string;
  pagerank: number;
  hotness: number;
  rank: number;
}

/** What the graph rules read from the repo-intel snapshot. */
export interface GraphInput {
  files: { path: string; pagerank: number }[];
  edges: { from: string; to: string }[];
}

/** Outcome of reading the clone's history for the 180-day window. */
export type HistoryResult =
  | { ok: true; touches: CommitTouch[]; windowStart: string; windowEnd: string }
  | { ok: false };

/** Facts read from the clone. A dir key of `''` is the repository root. */
export interface CloneFacts {
  /** Every file of the working tree, `/`-separated, repository-relative. */
  files: string[];
  /** `package.json` text by directory. */
  packageJsons: Record<string, string>;
  /** `.env.example` text by directory (only key NAMES are ever taken from it). */
  envExamples: Record<string, string>;
  compose: { file: string; text: string } | null;
  readme: string | null;
}

/** A command the model may pick for How to run (AC-70). `target` is the dir (`''` = root). */
export interface RunCandidate {
  command: string;
  kind: 'install' | 'env' | 'compose' | 'script';
  target: string;
}

/** The contract's architecture facts. */
export type ArchitectureFacts = OnboardingArchitectureFacts;

/** Everything the prompt may quote; every repo-derived value is untrusted. */
export interface PromptFacts {
  /** Package managers by run target, package dirs, dependency/env KEY names, compose services. */
  stack: {
    packageManagers: string[];
    packageDirs: string[];
    /** Dependency names by package dir (names only, already capped). */
    dependencyNames: Record<string, string[]>;
    composeServices: string[];
    /** `.env.example` key names by dir — never values (AC-76). */
    envKeyNames: Record<string, string[]>;
  };
  /** The numbered command list the model must choose from (AC-72). */
  candidates: RunCandidate[];
  criticalPaths: { path: string; imported_by: number }[];
  readingPath: string[];
  readme: string | null;
  /** Directory-tree entries, already limited to depth and count. */
  tree: string[];
  routes: { file: string; endpoint: string }[];
  /** First characters of each reading-path file. */
  excerpts: { path: string; text: string }[];
}

export interface PromptBuild {
  system: string;
  user: string;
  estimatedTokens: number;
  /** Blocks that were capped or dropped, in the order it happened (AC-100, AC-101). */
  truncated: { block: string; action: 'capped' | 'dropped' }[];
}

/**
 * What the model returns (spec: Model output). Deliberately no `.max()` on the
 * arrays: five tasks are accepted and cut to three by grounding (AC-84).
 */
export const TourModelOutput = z.object({
  architecture: z.object({ body: z.string(), diagram: z.string().nullable() }),
  critical_paths: z.array(z.object({ path: z.string(), reason: z.string() })),
  reading_path: z.array(z.object({ path: z.string(), why: z.string() })),
  run_steps: z.array(z.object({ command: z.string(), note: z.string().nullable() })),
  first_tasks: z.array(
    z.object({
      title: z.string(),
      scope: z.string(),
      complexity: z.enum(['Low', 'Medium', 'High']),
    }),
  ),
});
export type TourModelOutput = z.infer<typeof TourModelOutput>;
