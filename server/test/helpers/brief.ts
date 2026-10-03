/**
 * Shared doubles and fixtures of the PR Brief (SPEC-03) integration suites:
 * `brief.it.test.ts`, `brief-generation.it.test.ts`, `brief-seed.it.test.ts` and
 * `pulls-head-sha.it.test.ts`.
 *
 * The fixture builders take a `Db` and write rows, so every suite that uses them carries the
 * `.it.test.ts` suffix. Nothing here starts a container itself.
 */
import type {
  LLMProvider,
  PrBrief,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import type { Db } from '../../src/db/client.js';
import * as t from '../../src/db/schema.js';
import type { BlastResult } from '../../src/modules/repo-intel/types.js';

// ---- The model double ------------------------------------------------------------------------

/** A line that exists only in a patch — it must never reach a prompt (AC-51). */
export const PATCH_MARKER = 'PATCH_BODY_MARKER_8c1d2e';

/** A valid answer for the default fixture: grounded in `src/config.ts` (new range 10-13). */
export const GOOD_OUTPUT = {
  summary: 'Adds a rate limiter and moves the Stripe key into config.',
  risks: [
    {
      kind: 'security',
      title: 'Secret in config',
      explanation: 'A key is committed in the config file.',
      severity: 'high',
      file_refs: ['src/config.ts:11'],
    },
  ],
  review_focus: [{ file: 'src/config.ts', line: 11, reason: 'Check the key handling.' }],
};

/** What a successful fake call reports; the tests assert the brief carries exactly this (AC-85). */
export const FAKE_USAGE = { tokensIn: 100, tokensOut: 50, costUsd: 0.001 } as const;

type Behavior =
  | { kind: 'ok' }
  | { kind: 'throw'; error: Error }
  | { kind: 'never' };

/**
 * Records every structured call. The answer and the behaviour are settable, and a call can
 * be held open until `release()`. The call is recorded BEFORE it waits, so a test can poll
 * `calls.length` instead of sleeping.
 */
export class FakeLlm implements LLMProvider {
  calls: StructuredRequest<unknown>[] = [];
  answer: unknown = GOOD_OUTPUT;
  private behavior: Behavior = { kind: 'ok' };
  private gate: { promise: Promise<void>; open: () => void } | null = null;

  constructor(readonly id: 'openai' | 'anthropic' | 'openrouter' = 'openai') {}

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
  succeed(answer: unknown = GOOD_OUTPUT): void {
    this.answer = answer;
    this.behavior = { kind: 'ok' };
  }
  fail(error: Error): void {
    this.behavior = { kind: 'throw', error };
  }
  hang(): void {
    this.behavior = { kind: 'never' };
  }

  /** The text of the user message of the n-th call (the captured prompt). */
  userPrompt(n = 0): string {
    const msgs = this.calls[n]?.messages ?? [];
    return msgs.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  }
  /** The whole captured prompt (system + user) of the n-th call. */
  fullPrompt(n = 0): string {
    return (this.calls[n]?.messages ?? []).map((m) => m.content).join('\n');
  }

  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('complete is not used by the brief');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    await this.gate?.promise;
    if (this.behavior.kind === 'throw') throw this.behavior.error;
    if (this.behavior.kind === 'never') return new Promise<StructuredResult<T>>(() => {});
    return {
      data: this.answer as T,
      model: req.model,
      tokensIn: FAKE_USAGE.tokensIn,
      tokensOut: FAKE_USAGE.tokensOut,
      costUsd: FAKE_USAGE.costUsd,
      raw: JSON.stringify(this.answer),
      attempts: 1,
    };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

/** An error shaped like the SDK's `APIError`: it carries `status`, not `statusCode`. */
export const providerError = (status: number): Error =>
  Object.assign(new Error(`provider answered ${status}`), { status });

// ---- The repo-intel double -------------------------------------------------------------------

/** A blast map with one changed symbol and one caller at `src/server.ts:88`. */
export const BLAST_FIXTURE: BlastResult = {
  changedSymbols: [{ file: 'src/config.ts', name: 'loadConfig', kind: 'function' }],
  callers: [
    {
      file: 'src/server.ts',
      symbol: 'main',
      viaSymbol: 'loadConfig',
      line: 88,
      rank: 0.5,
      declFile: 'src/config.ts',
    },
  ],
  impactedEndpoints: [],
  degraded: false,
};

/** `getBlastRadius` with a scripted answer (or a throw); records the changed files it was asked about. */
export class FakeBlastIntel {
  calls: { repoId: string; files: string[] }[] = [];
  result: BlastResult | Error = BLAST_FIXTURE;
  async getBlastRadius(repoId: string, files: string[]): Promise<BlastResult> {
    this.calls.push({ repoId, files });
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

// ---- The logger double -----------------------------------------------------------------------

/** Captures what a service writes — the app logger is silent under test. */
export class CapturedLog {
  lines: string[] = [];
  info = (msg: string): void => {
    this.lines.push(msg);
  };
}

// ---- Rows ------------------------------------------------------------------------------------

export interface FixtureFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** Three files: config (new range 10-13), users (40-49) and a binary one without a patch. */
export const DEFAULT_FILES: FixtureFile[] = [
  {
    path: 'src/config.ts',
    additions: 4,
    deletions: 0,
    patch: `@@ -10,3 +10,4 @@\n   port: 3000,\n+  // ${PATCH_MARKER}\n   redisUrl: x,\n   a: 1,`,
  },
  {
    path: 'src/api/users.ts',
    additions: 9,
    deletions: 1,
    patch: '@@ -40,2 +40,10 @@\n a\n+b\n c',
  },
  { path: 'assets/logo.png', additions: 0, deletions: 0, patch: null },
];

let seq = 0;

export interface MadePr {
  repo: typeof t.repos.$inferSelect;
  pr: typeof t.pullRequests.$inferSelect;
}

/**
 * A repo and a PR of `workspaceId`, with their `pr_files` (default: `DEFAULT_FILES`) and
 * optionally a stored intent. Every call creates fresh rows, so a test owns its data.
 */
export async function makePr(
  db: Db,
  workspaceId: string,
  opts: {
    files?: FixtureFile[];
    body?: string | null;
    title?: string;
    headSha?: string;
    filesCount?: number;
    intent?: { intent: string; inScope?: string[]; outOfScope?: string[] };
    clonePath?: string | null;
    owner?: string;
  } = {},
): Promise<MadePr> {
  const n = seq++;
  const owner = opts.owner ?? 'acme';
  const name = `brief-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const [repo] = await db
    .insert(t.repos)
    .values({
      workspaceId,
      owner,
      name,
      fullName: `${owner}/${name}`,
      clonePath: opts.clonePath ?? null,
    })
    .returning();
  const files = opts.files ?? DEFAULT_FILES;
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: opts.title ?? 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit',
      base: 'main',
      headSha: opts.headSha ?? 'aaa111',
      filesCount: opts.filesCount ?? files.length,
      body: opts.body === undefined ? 'Adds a limiter.' : opts.body,
    })
    .returning();
  if (files.length > 0) {
    await db.insert(t.prFiles).values(files.map((f) => ({ prId: pr!.id, ...f })));
  }
  if (opts.intent) {
    await db.insert(t.prIntent).values({
      prId: pr!.id,
      intent: opts.intent.intent,
      inScope: opts.intent.inScope ?? [],
      outOfScope: opts.intent.outOfScope ?? [],
    });
  }
  return { repo: repo!, pr: pr! };
}

/** A second workspace with a real PR — what a cross-tenant test needs (not just a random uuid). */
export async function makeForeignPr(db: Db): Promise<MadePr> {
  const [ws] = await db
    .insert(t.workspaces)
    .values({ name: `other-ws-${seq++}-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  return makePr(db, ws!.id, { owner: 'other' });
}

// ---- Agents, skills and their attached documents (AC-55) --------------------------------------

/** An agent of the workspace; documents are attached with `attachAgentDocs`. */
export async function makeAgent(
  db: Db,
  workspaceId: string,
  name: string,
  enabled = true,
): Promise<string> {
  const [agent] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      systemPrompt: 'Review the diff.',
      enabled,
    })
    .returning();
  return agent!.id;
}

/** Attach `paths` to the agent for `repoId`, in the given order. */
export async function attachAgentDocs(
  db: Db,
  agentId: string,
  repoId: string,
  paths: string[],
): Promise<void> {
  await db
    .insert(t.agentContextDocs)
    .values(paths.map((path, position) => ({ agentId, repoId, path, position })));
}

/** A skill linked to `agentId` (link order 0) with `paths` attached for `repoId`. */
export async function linkSkill(
  db: Db,
  workspaceId: string,
  agentId: string,
  repoId: string,
  opts: { name: string; enabled: boolean; paths: string[] },
): Promise<void> {
  const [skill] = await db
    .insert(t.skills)
    .values({
      workspaceId,
      name: opts.name,
      description: 'd',
      type: 'custom',
      source: 'manual',
      body: 'body',
      enabled: opts.enabled,
    })
    .returning();
  await db.insert(t.agentSkills).values({ agentId, skillId: skill!.id, order: 0 });
  await db
    .insert(t.skillContextDocs)
    .values(opts.paths.map((path, position) => ({ skillId: skill!.id, repoId, path, position })));
}

/** A stored brief that parses, for tests that need one in `pr_brief`. */
export function sampleBrief(over: Partial<PrBrief> = {}): PrBrief {
  return {
    summary: 'A stored brief.',
    risks: { risks: [] },
    review_focus: [],
    intent: null,
    blast: null,
    head_sha: 'aaa111',
    generated_at: '2026-10-01T10:00:00.000Z',
    model: 'openai/gpt-4.1',
    usage: { llm_calls: 1, tokens_in: 10, tokens_out: 5, cost_usd: 0.001, duration_ms: 100 },
    inputs: [
      { source: 'intent', status: 'missing', reason: 'not_derived' },
      { source: 'blast', status: 'missing', reason: 'no_data' },
      { source: 'diff_stats', status: 'used' },
      { source: 'description', status: 'used' },
      { source: 'linked_issue', status: 'missing', reason: 'no_linked_issue' },
      { source: 'specs', status: 'missing', reason: 'none_attached' },
    ],
    dropped: { risks: 0, review_focus: 0 },
    ...over,
  };
}

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
