import { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff classification rules — pure data, no logic. `helpers.ts` walks
 * `CLASSIFY_RULES` in order and returns the first matching role, else 'core'.
 *
 * `ROLE_ORDER` is derived from the contract's enum options rather than
 * hand-listed again, so the display order and the wire enum can never drift
 * apart — widening the enum widens the order for free.
 */
export const ROLE_ORDER = SmartDiffRole.options;

/** A path normalised by `normalizePath`, ready for the predicates below. */
export interface NormalizedPath {
  /** All path segments, '/' -separated, no empty segments. */
  segments: string[];
  /** All segments except the last (the directories the file sits under). */
  dirs: string[];
  /** The last segment (the filename). */
  base: string;
  /** The first segment (root-anchored checks: dist/, build/, e2e/, .github/, .claude/). */
  first: string;
}

type ClassifyRule = {
  role: Exclude<SmartDiffRole, 'core'>;
  test: (p: NormalizedPath) => boolean;
};

const LOCK_BASENAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);
const ROOT_GENERATED_DIRS = new Set(['dist', 'build']);
const TEST_DIRS = new Set(['test', 'tests', '__tests__']);
const WIRING_INDEX_BASENAMES = new Set(['index.ts', 'index.js']);
const WIRING_ROOT_DIRS = new Set(['.github', '.claude']);
// Lowercased once here so the docs predicate below can do a single
// case-insensitive comparison per prefix instead of re-lowering on every call.
const DOC_PREFIXES_LOWER = ['readme', 'changelog', 'license'];

/**
 * Ordered boilerplate -> tests -> wiring -> docs. The first matching rule
 * wins, so a snapshot inside a test dir is boilerplate (rule 1 beats rule 2)
 * and a markdown file under `.claude/` is wiring (rule 3 beats rule 4).
 */
export const CLASSIFY_RULES: ClassifyRule[] = [
  {
    role: 'boilerplate',
    test: (p) =>
      p.base.endsWith('.lock') ||
      LOCK_BASENAMES.has(p.base) ||
      ROOT_GENERATED_DIRS.has(p.first) ||
      p.dirs.includes('__snapshots__') ||
      p.base.endsWith('.snap') ||
      p.base.includes('.generated.') ||
      p.base.endsWith('.min.js'),
  },
  {
    role: 'tests',
    test: (p) =>
      /\.test\.tsx?$/.test(p.base) ||
      /\.spec\.ts$/.test(p.base) ||
      p.dirs.some((d) => TEST_DIRS.has(d)) ||
      p.first === 'e2e',
  },
  {
    role: 'wiring',
    test: (p) =>
      WIRING_INDEX_BASENAMES.has(p.base) ||
      p.base.includes('.config.') ||
      /^tsconfig.*\.json$/.test(p.base) ||
      /^\.eslintrc/.test(p.base) ||
      /^\.env/.test(p.base) ||
      /^docker-compose.*\.yml$/.test(p.base) ||
      WIRING_ROOT_DIRS.has(p.first),
  },
  {
    role: 'docs',
    // README*/CHANGELOG*/LICENSE match case-insensitively (per spec); every
    // other predicate in this table stays case-sensitive.
    test: (p) => {
      const baseLower = p.base.toLowerCase();
      return (
        p.base.endsWith('.md') ||
        p.first === 'docs' ||
        DOC_PREFIXES_LOWER.some((prefix) => baseLower.startsWith(prefix))
      );
    },
  },
];
