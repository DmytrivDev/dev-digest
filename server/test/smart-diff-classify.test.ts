import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/smart-diff/helpers.js';
import { SEED_PR_482_FILES } from '../src/db/seed-pulls.js';
import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Table-driven spec for `classifyFile`. Written FIRST (module does not exist
 * yet, so this file must fail to import until helpers.ts lands) per the plan.
 *
 * Rule precedence: boilerplate > tests > wiring > docs > core (fallback).
 */

type Row = [path: string, expected: SmartDiffRole];

const PRECEDENCE_ROWS: Row[] = [
  // Rule 1 (boilerplate) wins over rule 2 (tests): a snapshot inside a test dir.
  ['x/__tests__/__snapshots__/x.snap', 'boilerplate'],
  // Rule 3 (wiring) wins over rule 4 (docs): a markdown file under .claude/.
  ['.claude/skills/security/SKILL.md', 'wiring'],
  // Documented decision: rule 2 (tests) wins over rule 4 (docs) — `first === 'e2e'`
  // fires before the `.md` docs rule gets a chance.
  ['e2e/README.md', 'tests'],
];

const BOILERPLATE_ROWS: Row[] = [
  ['pnpm-lock.yaml', 'boilerplate'],
  ['server/pnpm-lock.yaml', 'boilerplate'],
  ['package-lock.json', 'boilerplate'],
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  ['dist/index.js', 'boilerplate'],
  ['build/out.css', 'boilerplate'],
  ['src/schema.generated.ts', 'boilerplate'],
  ['vendor/jquery.min.js', 'boilerplate'],
  ['a/__snapshots__/b.ts.snap', 'boilerplate'],
];

const TESTS_ROWS: Row[] = [
  ['src/a.test.ts', 'tests'],
  ['src/A.test.tsx', 'tests'],
  ['server/test/foo.it.test.ts', 'tests'],
  ['src/a.spec.ts', 'tests'],
  ['server/test/helpers/pg.ts', 'tests'],
  ['pkg/tests/fixture.json', 'tests'],
  ['src/__tests__/x.ts', 'tests'],
  ['e2e/flows/login.ts', 'tests'],
];

const WIRING_ROWS: Row[] = [
  ['server/src/modules/index.ts', 'wiring'],
  ['lib/index.js', 'wiring'],
  ['client/next.config.mjs', 'wiring'],
  ['vitest.config.ts', 'wiring'],
  ['tsconfig.json', 'wiring'],
  ['server/tsconfig.build.json', 'wiring'],
  ['.eslintrc.cjs', 'wiring'],
  ['.env', 'wiring'],
  ['server/.env.example', 'wiring'],
  ['docker-compose.yml', 'wiring'],
  ['docker-compose.e2e.yml', 'wiring'],
  ['.github/workflows/ci.yml', 'wiring'],
  ['.claude/agents/planner.md', 'wiring'],
];

const DOCS_ROWS: Row[] = [
  ['README.md', 'docs'],
  ['server/README.md', 'docs'],
  ['docs/plans/x.plan.md', 'docs'],
  ['docs/diagram.png', 'docs'],
  ['CHANGELOG.md', 'docs'],
  ['LICENSE', 'docs'],
  // README/CHANGELOG/LICENSE match case-insensitively (per spec).
  ['readme.md', 'docs'],
  ['License', 'docs'],
];

const CORE_ROWS: Row[] = [
  ['server/src/modules/pulls/routes.ts', 'core'],
  // dist/ is root-anchored per spec: only matches as the FIRST segment.
  ['src/dist/x.ts', 'core'],
  // The segment is `testing`, not `test` — must not match the tests rule.
  ['src/testing/util.ts', 'core'],
  ['src/latest.ts', 'core'],
  // Only index.ts/index.js count as barrels — index.tsx does not.
  ['src/index.tsx', 'core'],
];

const WINDOWS_ROWS: Row[] = [
  ['client\\src\\a.test.tsx', 'tests'],
  ['.\\docs\\x.md', 'docs'],
];

describe('classifyFile', () => {
  describe.each(PRECEDENCE_ROWS)('precedence: %s -> %s', (path, expected) => {
    it(`classifies as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  });

  describe.each(BOILERPLATE_ROWS)('boilerplate: %s -> %s', (path, expected) => {
    it(`classifies as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  });

  describe.each(TESTS_ROWS)('tests: %s -> %s', (path, expected) => {
    it(`classifies as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  });

  describe.each(WIRING_ROWS)('wiring: %s -> %s', (path, expected) => {
    it(`classifies as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  });

  describe.each(DOCS_ROWS)('docs: %s -> %s', (path, expected) => {
    it(`classifies as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  });

  describe.each(CORE_ROWS)('core (fallback): %s -> %s', (path, expected) => {
    it(`classifies as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  });

  describe.each(WINDOWS_ROWS)('windows paths: %s -> %s', (path, expected) => {
    it(`classifies as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  });

  it('classifying SEED_PR_482_FILES paths yields all five roles', () => {
    const roles = new Set(SEED_PR_482_FILES.map((f) => classifyFile(f.path)));
    expect(roles).toEqual(new Set(['core', 'tests', 'wiring', 'docs', 'boilerplate']));
  });
});
