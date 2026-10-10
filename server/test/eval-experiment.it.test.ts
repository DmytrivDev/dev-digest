/**
 * SPEC-04 AC-112 (and the setup of AC-113): the eval pipeline can tell two versions of a prompt
 * apart. The seeded Security Reviewer suite is run with its shipped prompt, the prompt is then
 * changed to "flag every changed line", the suite is run again, and the compare shows a
 * non-zero precision/recall delta. The model is a stub keyed on the system prompt — no network,
 * deterministic. Gated on Docker.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { EvalCompare, EvalSuiteRun, Finding, LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { SEED_PR_483_FILES, SEED_PR_483_FINDINGS } from '../src/db/seed-eval.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { buildCaseDiff } from '../src/modules/eval/helpers/case-diff.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-experiment] Docker not available — skipping integration tests.');
}

/** The marker the stub keys on: present only in the edited prompt. */
const FLAG_EVERYTHING = 'Flag every changed line in the diff.';

function finding(file: string, start: number, end: number): Finding {
  return {
    id: `f-${file}-${start}-${end}`,
    severity: 'WARNING',
    category: 'security',
    title: `Issue at ${file}:${start}`,
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
  };
}

/**
 * A stub review engine whose answer depends on the SYSTEM PROMPT it was given:
 *  - shipped prompt: reports only the real issues of the case's file (the `must_find` ranges);
 *  - "flag every changed line": reports every new-side line of every hunk of the case's file.
 */
function promptKeyedLlm(): LLMProvider {
  const unexpected = () => {
    throw new Error('only completeStructured is expected during an eval run');
  };
  return {
    id: 'openrouter',
    listModels: unexpected,
    complete: unexpected,
    async completeStructured(req: { model: string; messages: { content: string }[] }) {
      const text = req.messages.map((m) => m.content).join('\n');
      const file = /diff --git a\/(\S+) b\//.exec(text)?.[1];
      const patch = SEED_PR_483_FILES.find((f) => f.path === file)?.patch;
      let findings: Finding[] = [];
      if (file && patch) {
        if (text.includes(FLAG_EVERYTHING)) {
          const parsed = parseUnifiedDiff(buildCaseDiff(file, patch));
          for (const h of parsed.files[0]?.hunks ?? []) {
            for (let n = h.newStart; n < h.newStart + h.newLines; n++) {
              findings.push(finding(file, n, n));
            }
          }
        } else {
          findings = SEED_PR_483_FINDINGS.filter(
            (f) => f.file === file && f.evalCase?.kind === 'must_find',
          ).map((f) => finding(file, f.startLine, f.endLine));
        }
      }
      return {
        data: { verdict: 'comment', summary: 's', score: 80, findings },
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.01,
        raw: '{}',
        attempts: 1,
      };
    },
  } as unknown as LLMProvider;
}

async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 30_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

d('eval experiment: a prompt change moves recall/precision (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
    agentId = agent!.id;
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: promptKeyedLlm() },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function runSuite(): Promise<EvalSuiteRun> {
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval/runs` });
    expect(res.statusCode).toBe(202);
    const { run_id } = res.json() as { run_id: string };
    return waitFor(async () => {
      const run = (await app.inject({ method: 'GET', url: `/eval/runs/${run_id}` })).json() as EvalSuiteRun;
      return run.status === 'running' ? undefined : run;
    });
  }

  it('shows a non-zero metric delta after the prompt changes (AC-112)', async () => {
    const before = await runSuite();
    expect(before.status).toBe('completed');
    expect(before.cases_total).toBeGreaterThanOrEqual(8);
    // The shipped prompt finds every real issue and flags nothing benign.
    expect(before.recall).toBe(1);
    expect(before.precision).toBe(1);

    const edit = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { system_prompt: `You are a security reviewer. ${FLAG_EVERYTHING}` },
    });
    expect(edit.statusCode).toBe(200);

    const after = await runSuite();
    expect(after.status).toBe('completed');
    expect(after.id).not.toBe(before.id);

    const res = await app.inject({ method: 'GET', url: `/eval/compare?a=${before.id}&b=${after.id}` });
    expect(res.statusCode).toBe(200);
    const cmp = res.json() as EvalCompare;
    expect(cmp.old.id).toBe(before.id);
    expect(cmp.new.id).toBe(after.id);
    expect(cmp.deltas.recall !== 0 || cmp.deltas.precision !== 0).toBe(true);
    // The benign `must_not_flag` lines are now flagged, so precision falls.
    expect(cmp.deltas.precision).toBeLessThan(0);
    expect(cmp.prompt_diff.some((l) => l.kind === 'added')).toBe(true);
  });
});
