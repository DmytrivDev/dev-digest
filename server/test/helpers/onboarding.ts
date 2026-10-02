/**
 * Shared doubles and fixtures of the two Onboarding Tour (SPEC-02) integration
 * suites: `onboarding-generation.it.test.ts` and `onboarding-history.it.test.ts`.
 *
 * Type-only imports of `Db` and the like are fine here, but this file never reaches a
 * database itself — every DB-backed suite that uses it carries the `.it.test.ts` suffix.
 */
import { execFileSync } from 'node:child_process';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import type { GraphSnapshot, IndexState } from '../../src/modules/repo-intel/types.js';

// ---- A tiny TypeScript repository: three source files, an env example, a lockfile --------

export const FIXTURE_FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'tour-fixture',
    scripts: { dev: 'node src/a.js', test: 'vitest' },
    dependencies: { zod: '^3.0.0' },
  }),
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  // `sk_live_abc` is a VALUE; only the key name may ever reach the model or the store.
  '.env.example': 'STRIPE_KEY=sk_live_abc\n',
  'README.md': '# Tour fixture\n\nA small repository for the onboarding tour tests.\n',
  'src/a.ts': "import { b } from './b';\nimport { c } from './c';\nexport const a = b + c;\n",
  'src/b.ts': "import { c } from './c';\nexport const b = c + 1;\n",
  'src/c.ts': 'export const c = 1;\n',
};

/** Runs git in `cwd`; `date` pins the author and committer date of a commit. */
export function git(cwd: string, args: string[], date?: string): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
      },
    },
  ).trim();
}

// ---- The model double ------------------------------------------------------------------------

export const MODEL_FIXTURE = {
  architecture: {
    body: 'A tiny TypeScript package: `a` uses `b` and `c`.',
    diagram: 'flowchart LR\n  A["a"] --> B["b"]\n  B --> C["c"]',
  },
  critical_paths: [{ path: 'src/c.ts', reason: 'Imported by both other files.' }],
  reading_path: [{ path: 'src/c.ts', why: 'The leaf everything depends on.' }],
  run_steps: [
    { command: 'pnpm install', note: null },
    { command: 'pnpm run dev', note: 'Starts the app.' },
  ],
  first_tasks: [{ title: 'Document c', scope: 'src/c.ts', complexity: 'Low' }],
};

/** What a successful stub call reports; the tests assert the tour carries exactly this. */
export const STUB_USAGE = { tokensIn: 100, tokensOut: 50, costUsd: 0.002 } as const;

type Behavior = { kind: 'ok' } | { kind: 'throw'; error: Error } | { kind: 'never' };

/**
 * Records every structured call. Behaviour is settable (`succeed` / `fail` / `hang`) and
 * a call can be held open until `release()`. The call is recorded BEFORE it waits, so a
 * test can poll `calls.length` instead of sleeping.
 */
export class StubLlm implements LLMProvider {
  readonly id = 'openrouter' as const;
  calls: StructuredRequest<unknown>[] = [];
  private behavior: Behavior = { kind: 'ok' };
  private gate: { promise: Promise<void>; open: () => void } | null = null;

  hold(): void {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    this.gate = { promise, open };
  }
  release(): void {
    this.gate?.open();
    this.gate = null;
  }
  succeed(): void {
    this.behavior = { kind: 'ok' };
  }
  fail(error: Error): void {
    this.behavior = { kind: 'throw', error };
  }
  hang(): void {
    this.behavior = { kind: 'never' };
  }

  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('complete is not used by the tour');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    await this.gate?.promise;
    if (this.behavior.kind === 'throw') throw this.behavior.error;
    if (this.behavior.kind === 'never') return new Promise<StructuredResult<T>>(() => {});
    return {
      data: MODEL_FIXTURE as unknown as T,
      model: req.model,
      tokensIn: STUB_USAGE.tokensIn,
      tokensOut: STUB_USAGE.tokensOut,
      costUsd: STUB_USAGE.costUsd,
      raw: JSON.stringify(MODEL_FIXTURE),
      attempts: 1,
    };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

// ---- The repo-intel double ------------------------------------------------------------------

/** A repo-intel facade whose index state and graph the test can set. */
export class FakeIntel {
  state!: IndexState;
  snapshot: GraphSnapshot = { files: [], edges: [], endpoints: [] };
  async getIndexState() {
    return this.state;
  }
  async getGraphSnapshot() {
    return this.snapshot;
  }
}

export const indexedState = (sha: string, over: Partial<IndexState> = {}): IndexState => ({
  repoId: 'fake',
  status: 'full',
  filesIndexed: 3,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: sha,
  indexerVersion: 1,
  updatedAt: new Date(),
  walkTotal: null,
  ...over,
});

export const GRAPH: GraphSnapshot = {
  files: [
    { path: 'src/a.ts', pagerank: 0.2 },
    { path: 'src/b.ts', pagerank: 0.3 },
    { path: 'src/c.ts', pagerank: 0.5 },
  ],
  edges: [
    { from: 'src/a.ts', to: 'src/b.ts' },
    { from: 'src/a.ts', to: 'src/c.ts' },
    { from: 'src/b.ts', to: 'src/c.ts' },
  ],
  endpoints: [],
};

/** Polls `cond` every 10 ms until it holds; a plain sleep would make the test slow AND flaky. */
export async function waitFor(
  cond: () => boolean | Promise<boolean>,
  label: string,
  ms = 15_000,
): Promise<void> {
  const until = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
