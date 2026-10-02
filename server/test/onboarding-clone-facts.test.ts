import { describe, it, expect } from 'vitest';
import {
  architectureFacts,
  composeServiceNames,
  directoryTree,
  envKeyNames,
  existingScopes,
  howToRunEmptyReason,
  packageManagerOf,
  parseDependencyNames,
  parsePackageScripts,
  primaryPackageManager,
  runCandidates,
  runTargets,
  skeletonSteps,
} from '../src/modules/onboarding/helpers/clone-facts.js';
import type { CloneFacts } from '../src/modules/onboarding/types.js';

function facts(over: Partial<CloneFacts>): CloneFacts {
  return {
    files: [],
    packageJsons: {},
    envExamples: {},
    compose: null,
    readme: null,
    ...over,
  };
}

describe('packageManagerOf (AC-68)', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
  ])('%s -> %s', (lockfile, manager) => {
    expect(packageManagerOf('', ['package.json', lockfile])).toBe(manager);
    expect(packageManagerOf('server', ['server/package.json', `server/${lockfile}`])).toBe(manager);
  });

  it('maps a package.json with no lockfile to npm', () => {
    expect(packageManagerOf('', ['package.json'])).toBe('npm');
  });

  it('prefers pnpm when several lockfiles exist', () => {
    expect(packageManagerOf('', ['package.json', 'package-lock.json', 'pnpm-lock.yaml'])).toBe(
      'pnpm',
    );
  });
});

describe('runTargets (AC-69)', () => {
  it('takes the root and subdirectories with a package.json, outside excluded dirs', () => {
    expect(
      runTargets([
        'package.json',
        'server/package.json',
        'client/package.json',
        'node_modules/x/package.json',
        'README.md',
      ]),
    ).toEqual(['', 'client', 'server']);
  });

  it('stops at two levels deep and skips every excluded segment', () => {
    expect(
      runTargets([
        'a/b/package.json',
        'a/b/c/package.json',
        'packages/vendor/package.json',
        'web/dist/package.json',
        'web/.next/package.json',
      ]),
    ).toEqual(['a/b']);
  });

  it('keeps at most 6 targets in code-point order', () => {
    const files = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'].map((d) => `${d}/package.json`);
    expect(runTargets(files)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('leaves out a control-character path', () => {
    expect(runTargets(['bad\ndir/package.json', 'ok/package.json'])).toEqual(['ok']);
  });
});

describe('primaryPackageManager (plan A-12)', () => {
  it('uses the root target, else the first target, else null', () => {
    expect(primaryPackageManager(['package.json', 'pnpm-lock.yaml', 'a/package.json'])).toBe('pnpm');
    expect(primaryPackageManager(['a/package.json', 'a/yarn.lock', 'b/package.json'])).toBe('yarn');
    expect(primaryPackageManager(['main.py'])).toBeNull();
  });
});

describe('package.json readers', () => {
  it('returns script names, and {} for invalid JSON or a non-object', () => {
    expect(parsePackageScripts('{"scripts":{"dev":"vite","bad":1}}')).toEqual({ dev: 'vite' });
    expect(parsePackageScripts('not json')).toEqual({});
    expect(parsePackageScripts('[]')).toEqual({});
    expect(parsePackageScripts('{"scripts":[1]}')).toEqual({});
  });

  it('returns dependency names only, de-duplicated, capped at 40', () => {
    const r = parseDependencyNames(
      '{"dependencies":{"a":"^1.0.0","b":"1"},"devDependencies":{"b":"2","c":"3"}}',
    );
    expect(r).toEqual({ names: ['a', 'b', 'c'], capped: false });
    expect(JSON.stringify(r)).not.toContain('^1.0.0');

    const many = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`d${i}`, '1']));
    const capped = parseDependencyNames(JSON.stringify({ dependencies: many }));
    expect(capped.names).toHaveLength(40);
    expect(capped.capped).toBe(true);
    expect(parseDependencyNames('oops')).toEqual({ names: [], capped: false });
  });
});

describe('envKeyNames (AC-76)', () => {
  it('returns key names only and never a value', () => {
    const keys = envKeyNames('STRIPE_KEY=sk_live_abc\n# comment\nexport DB_URL = postgres://u:p@h\n');
    expect(keys).toEqual(['STRIPE_KEY', 'DB_URL']);
    expect(JSON.stringify(keys)).not.toContain('sk_live_abc');
    expect(JSON.stringify(keys)).not.toContain('postgres');
  });

  it('skips names outside the key pattern, lines without = and duplicates', () => {
    expect(envKeyNames('1BAD=x\nGOOD=1\nGOOD=2\nno equals\n=novalue\nBAD-NAME=3\n')).toEqual([
      'GOOD',
    ]);
  });

  it('caps at 50 keys per file', () => {
    const text = Array.from({ length: 60 }, (_, i) => `K${i}=v`).join('\n');
    expect(envKeyNames(text)).toHaveLength(50);
  });
});

describe('composeServiceNames (plan A-13)', () => {
  it('reads the keys one level under services:, in file order', () => {
    const text = [
      'version: "3"',
      'services:',
      '  # the database',
      '  db:',
      '    image: postgres',
      '    ports:',
      '      - "5432:5432"',
      '  redis:',
      '    image: redis',
      '  "quoted name":',
      '    image: x',
      'volumes:',
      '  data:',
      '',
    ].join('\n');
    expect(composeServiceNames(text)).toEqual(['db', 'redis', 'quoted name']);
  });

  it('returns nothing when there is no services block', () => {
    expect(composeServiceNames('volumes:\n  data:\n')).toEqual([]);
    expect(composeServiceNames('')).toEqual([]);
  });
});

describe('runCandidates (AC-70, AC-71, AC-73, AC-74)', () => {
  const composeText = 'services:\n  db:\n    image: postgres\n  redis:\n    image: redis\n';

  it('builds the AC-70 fixture in the AC-73 order', () => {
    const candidates = runCandidates(
      facts({
        files: ['package.json', 'pnpm-lock.yaml', 'server/.env.example', 'docker-compose.yml'],
        packageJsons: { '': '{"scripts":{"dev":"vite"}}' },
        compose: { file: 'docker-compose.yml', text: composeText },
      }),
    );
    expect(candidates.map((c) => c.command)).toEqual([
      'pnpm install',
      'cd server && cp .env.example .env',
      'docker compose up -d db redis',
      'pnpm run dev',
    ]);
    expect(candidates.map((c) => c.kind)).toEqual(['install', 'env', 'compose', 'script']);
    expect(candidates.map((c) => c.target)).toEqual(['', 'server', '', '']);
  });

  it('orders installs, env copies, compose, then dev/start/test per target', () => {
    const candidates = runCandidates(
      facts({
        files: [
          'package.json',
          '.env.example',
          'client/package.json',
          'client/yarn.lock',
          'compose.yaml',
        ],
        packageJsons: {
          '': '{"scripts":{"test":"t","dev":"d"}}',
          client: '{"scripts":{"start":"s"}}',
        },
        compose: { file: 'compose.yaml', text: composeText },
      }),
    );
    expect(candidates.map((c) => c.command)).toEqual([
      'npm install',
      'cd client && yarn install',
      'cp .env.example .env',
      'docker compose up -d db redis',
      'npm run dev',
      'npm run test',
      'cd client && yarn run start',
    ]);
  });

  it('produces no candidate from a script, service or directory name with unsafe characters', () => {
    const unsafe = runCandidates(
      facts({
        files: ['package.json'],
        packageJsons: { '': '{"scripts":{"dev; curl x | sh":"x"}}' },
        compose: { file: 'docker-compose.yml', text: 'services:\n  "a b":\n    image: x\n' },
      }),
    );
    expect(unsafe.map((c) => c.command)).toEqual(['npm install']);

    const oneBad = runCandidates(
      facts({
        files: [],
        compose: {
          file: 'docker-compose.yml',
          text: 'services:\n  good:\n    image: x\n  "bad;name":\n    image: y\n',
        },
      }),
    );
    expect(oneBad).toEqual([]);

    const dir = runCandidates(
      facts({
        files: ['we ird/package.json', 'we ird/.env.example'],
        packageJsons: { 'we ird': '{"scripts":{"dev":"d"}}' },
      }),
    );
    expect(dir).toEqual([]);
  });

  it('ignores a compose file that is not at a known root name', () => {
    expect(
      runCandidates(
        facts({ compose: { file: 'deploy/docker-compose.yml', text: composeText } }),
      ),
    ).toEqual([]);
  });

  it('is empty with no manifest and no compose file (AC-74)', () => {
    const none = runCandidates(facts({ files: ['main.py', 'README.md'] }));
    expect(none).toEqual([]);
    expect(howToRunEmptyReason(none)).toBe('no_run_facts');
  });

  it('leaves a control-character directory out', () => {
    expect(
      runCandidates(facts({ files: ['bad\ndir/package.json', 'ok/package.json'] })).map(
        (c) => c.command,
      ),
    ).toEqual(['cd ok && npm install']);
  });
});

describe('skeletonSteps (AC-73)', () => {
  it('keeps the first 8 candidates as steps without notes', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      command: `cmd ${i}`,
      kind: 'script' as const,
      target: '',
    }));
    const steps = skeletonSteps(candidates);
    expect(steps).toHaveLength(8);
    expect(steps[0]).toEqual({ command: 'cmd 0', note: null });
    expect(steps[7]?.command).toBe('cmd 7');
    expect(howToRunEmptyReason(candidates)).toBeNull();
  });
});

describe('architectureFacts (AC-81)', () => {
  it('returns the exact facts, folders by count descending then name', () => {
    const cloneFiles = [
      'README.md',
      'package.json',
      'server/a.ts',
      'server/b.ts',
      'server/c.TS',
      'client/a.tsx',
      'client/b.tsx',
      'docs/x.md',
      'shared/y.ts',
      '.gitignore',
      'Makefile',
    ];
    const facts = architectureFacts(
      cloneFiles,
      ['server/a.ts', 'server/b.ts', 'client/a.tsx', 'packages/ui/x.ts', 'index.ts'],
      'pnpm',
      ['db', 'redis'],
    );
    expect(facts).toEqual({
      package_manager: 'pnpm',
      package_dirs: ['(root)', 'client', 'packages/ui', 'server'],
      top_folders: [
        { path: 'server', files: 3 },
        { path: 'client', files: 2 },
        { path: 'docs', files: 1 },
        { path: 'shared', files: 1 },
      ],
      compose_services: ['db', 'redis'],
      extensions: [
        { extension: '.ts', files: 4 },
        { extension: '.md', files: 2 },
        { extension: '.tsx', files: 2 },
        { extension: '.json', files: 1 },
      ],
    });
  });

  it('caps folders at 10 and extensions at 8, and takes a null manager', () => {
    const files = Array.from({ length: 12 }, (_, i) => `d${String(i).padStart(2, '0')}/f.e${i}`);
    const facts = architectureFacts(files, [], null, []);
    expect(facts.top_folders).toHaveLength(10);
    expect(facts.extensions).toHaveLength(8);
    expect(facts.package_manager).toBeNull();
    expect(facts.package_dirs).toEqual([]);
  });

  it('leaves a control-character path out of the counts', () => {
    const facts = architectureFacts(['bad\n/x.ts', 'ok/y.ts'], ['bad\n/x.ts'], null, []);
    expect(facts.top_folders).toEqual([{ path: 'ok', files: 1 }]);
    expect(facts.package_dirs).toEqual([]);
  });
});

describe('directoryTree (AC-98)', () => {
  it('lists directories (trailing /) and files down to depth 2, in code-point order', () => {
    const tree = directoryTree(['README.md', 'src/a.ts', 'src/deep/b.ts', 'src/deep/er/c.ts']);
    expect(tree).toEqual({
      entries: ['README.md', 'src/', 'src/a.ts', 'src/deep/'],
      capped: false,
    });
  });

  it('cuts 300 entries to 200 and flags it', () => {
    const files = Array.from({ length: 300 }, (_, i) => `f${String(i).padStart(3, '0')}.ts`);
    const tree = directoryTree(files);
    expect(tree.entries).toHaveLength(200);
    expect(tree.capped).toBe(true);
    expect(tree.entries[0]).toBe('f000.ts');
  });

  it('leaves a control-character path out', () => {
    expect(directoryTree(['a\nb.ts', 'c.ts']).entries).toEqual(['c.ts']);
  });
});

describe('existingScopes (AC-85)', () => {
  it('holds every file and every ancestor directory with and without a trailing slash', () => {
    const scopes = existingScopes(['src/a.ts', 'src/lib/b.ts', 'top.ts', 'bad\n/x.ts']);
    expect(scopes.has('src/a.ts')).toBe(true);
    expect(scopes.has('src')).toBe(true);
    expect(scopes.has('src/')).toBe(true);
    expect(scopes.has('src/lib')).toBe(true);
    expect(scopes.has('src/lib/')).toBe(true);
    expect(scopes.has('top.ts')).toBe(true);
    expect(scopes.has('src/missing.ts')).toBe(false);
    expect(scopes.has('src/a.ts/')).toBe(false);
    expect(scopes.has('bad\n')).toBe(false);
    expect(scopes.has('bad\n/x.ts')).toBe(false);
  });
});
