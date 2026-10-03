/**
 * PR Brief (SPEC-03) — application layer.
 *
 * Like `OnboardingService`, the class takes the PORTS it uses, never the DI `Container`
 * (a service that imports the composition root trips `arch:check`'s
 * `service-not-to-composition-root`). `routes.ts` assembles them.
 *
 * Every rule lives in `helpers/*` (ring 1). This file reads the facts (stored files,
 * intent, issue, blast map, spec documents), calls those rules, makes EXACTLY ONE model
 * call, validates the answer against the PR, and stores the brief. `get` makes no GitHub
 * and no model call (NFR-4).
 */
import {
  PrBrief as PrBriefSchema,
  type BriefInput,
  type BriefUsage,
  type FeatureModelChoice,
  type GitClient,
  type GitHubClient,
  type LLMProvider,
  type PrBrief,
  type PrBriefResponse,
  type Provider,
  type RepoRef,
  type StructuredResult,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import type { BlastResult, RepoIntel } from '../repo-intel/types.js';
import { toBlastRadius } from '../blast/helpers.js';
import { decodeDoc, orderRunDocs } from '../project-context/helpers.js';
import {
  ERR_FILES_UNAVAILABLE,
  ERR_GENERATION_IN_PROGRESS,
  INPUT_TOKEN_BUDGET,
  MODEL_DEADLINE_MS,
  MODEL_MAX_TOKENS,
  MODEL_TEMPERATURE,
  REASON,
} from './constants.js';
import { applyCuts, fitBudget } from './helpers/budget.js';
import { fileStats } from './helpers/diff-stats.js';
import {
  blastInput,
  buildInputs,
  diffStatsInput,
  linkedIssueNumber,
  unionDocPaths,
  type BlastInputState,
} from './helpers/inputs.js';
import {
  BriefOutputInvalidError,
  classifyModelError,
  isStale,
  logLine,
  truncatedSources,
} from './helpers/outcome.js';
import { renderBriefPrompt } from './helpers/prompt.js';
import { parseModelOutput, validateBrief } from './helpers/validate.js';
import type { BriefPullRef, BriefRepository } from './repository.js';
import {
  BriefModelOutput,
  type AgentDocs,
  type BriefFacts,
  type FileStat,
  type InputRecord,
  type SpecDoc,
} from './types.js';

export interface BriefDeps {
  repo: BriefRepository;
  /**
   * `readFileBytes` is the docs-only guarded read the project-context run path uses: it
   * rejects a symlink landing on a non-markdown file and the document-excluded directories.
   */
  git: Pick<GitClient, 'readFileBytes' | 'currentBranch'>;
  /**
   * The workspace's enabled agents with their attached documents for a repo — one read
   * owned by project-context (`ProjectContextRepository.enabledAgentDocs`), composed in `routes.ts`.
   */
  enabledAgentDocs: (workspaceId: string, repoId: string) => Promise<AgentDocs[]>;
  /** `container.github` — async because the client is built from a stored token. */
  github: () => Promise<GitHubClient>;
  /** The facade, called directly: `BlastService.get` may call GitHub (it is not ours to drive). */
  repoIntel: Pick<RepoIntel, 'getBlastRadius'>;
  /** The workspace's `risk_brief` choice, read per generation (AC-65). */
  resolveModel: () => Promise<FeatureModelChoice>;
  /** `container.llm` — throws `ConfigError` on a missing key (AC-86). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** The cl100k counter (`container.tokenizer.count`). */
  countTokens: (text: string) => number;
  systemPrompt: () => Promise<string>;
  /** Where the AC-94 line goes — injected because the app logger is silent under test. */
  log: { info(msg: string): void };
  /** PR ids with a generation in flight; owned by the route plugin, shared by every service. */
  inFlight: Set<string>;
  now?: () => Date;
  /** Override the model deadline — injected only by the test that proves it fires. */
  modelDeadlineMs?: number;
}

/** What assembling the facts yields. */
interface Assembled {
  facts: BriefFacts;
  records: InputRecord[];
  /** Files of the PR, for validation. */
  prFiles: FileStat[];
  /** The wire blast snapshot to store; `null` when blast is not usable. */
  blast: PrBrief['blast'];
  /** Caller lines per file from the FULL blast snapshot; `null` when blast is `missing` (AC-58). */
  blastCallers: Map<string, Set<number>> | null;
  intent: PrBrief['intent'];
}

const NO_USAGE = {
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
} as const;

export class BriefService {
  constructor(private deps: BriefDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private ref(pull: BriefPullRef): RepoRef {
    return { owner: pull.owner, name: pull.name };
  }

  /**
   * `undefined` → no such PR in this workspace (404, AC-93); no brief content is read.
   * No GitHub call and no model call (NFR-4, AC-43). `stale` is computed on read against
   * the DB head (AC-45).
   */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse | undefined> {
    const pull = await this.deps.repo.pullInWorkspace(workspaceId, prId);
    if (!pull) return undefined;
    const brief = await this.deps.repo.getBrief(pull.id);
    return {
      brief,
      generating: this.deps.inFlight.has(pull.id),
      stale: brief ? isStale(brief.head_sha, pull.headSha) : false,
    };
  }

  /**
   * Generate and store this PR's brief. `undefined` → 404 (AC-93). Refusals (422 no files,
   * 409 already running) are raised BEFORE any model resolution or call.
   */
  async generate(workspaceId: string, prId: string): Promise<PrBriefResponse | undefined> {
    const pull = await this.deps.repo.pullInWorkspace(workspaceId, prId);
    if (!pull) return undefined;

    const files = await this.deps.repo.files(pull.id);
    if (files.length === 0) {
      throw new AppError(
        ERR_FILES_UNAVAILABLE,
        'This pull request has no stored files yet — open its Files changed tab first.',
        422,
      );
    }

    // `has` + `add` with no await between them: two requests cannot both pass (AC-91).
    if (this.deps.inFlight.has(pull.id)) {
      throw new AppError(
        ERR_GENERATION_IN_PROGRESS,
        'A brief is already being generated for this pull request.',
        409,
      );
    }
    this.deps.inFlight.add(pull.id);
    // Released when THIS generation ends — never on the reply: a client that disconnects does
    // not stop the handler, so the brief is still stored.
    try {
      return await this.run(workspaceId, pull, files);
    } finally {
      this.deps.inFlight.delete(pull.id);
    }
  }

  private async run(
    workspaceId: string,
    pull: BriefPullRef,
    storedFiles: Awaited<ReturnType<BriefRepository['files']>>,
  ): Promise<PrBriefResponse> {
    const started = this.now().getTime();
    const choice = await this.deps.resolveModel();
    const model = `${choice.provider}/${choice.model}`;
    const elapsed = (): number => Math.max(0, this.now().getTime() - started);

    /** Log the one line of a failed generation and raise the API error (AC-90, AC-94). */
    const fail = (
      err: unknown,
      llmCalls: number,
      inputs: ReadonlyArray<BriefInput>,
    ): never => {
      const outcome = classifyModelError(err, { provider: choice.provider, model: choice.model });
      this.deps.log.info(
        logLine({
          prId: pull.id,
          usage: { llm_calls: llmCalls, ...NO_USAGE, duration_ms: elapsed() },
          model,
          status: 'failed',
          reason: outcome.code,
          dropped: { risks: 0, review_focus: 0 },
          truncated: truncatedSources(inputs),
        }),
      );
      throw new AppError(outcome.code, outcome.message, outcome.status);
    };

    // ---- The provider: a missing key is a 422, before any fact is read (AC-86) ----
    let llm: LLMProvider;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      return fail(err, 0, []);
    }

    // ---- Facts and the prompt (AC-49 … AC-63) ----
    const assembled = await this.assemble(workspaceId, pull, storedFiles);
    const system = await this.deps.systemPrompt();
    const fitted = fitBudget({
      facts: assembled.facts,
      render: (f) => renderBriefPrompt(system, f),
      countTokens: this.deps.countTokens,
      budget: INPUT_TOKEN_BUDGET,
    });
    const inputs = buildInputs(applyCuts(assembled.records, fitted.cuts));

    // ---- Exactly one model call (AC-64, AC-66) ----
    let res: StructuredResult<BriefModelOutput>;
    let output: BriefModelOutput;
    try {
      res = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: BriefModelOutput,
          schemaName: 'PrBrief',
          messages: [
            { role: 'system', content: fitted.prompt.system },
            { role: 'user', content: fitted.prompt.user },
          ],
          temperature: MODEL_TEMPERATURE,
          maxTokens: MODEL_MAX_TOKENS,
          // Exactly one engine attempt, no schema-repair retry. OpenRouter ignores a
          // per-request `timeoutMs`, so the bound is `withTimeout`, not a request field.
          maxRetries: 0,
          disableReasoning: true,
        }),
        this.deps.modelDeadlineMs ?? MODEL_DEADLINE_MS,
      );
      // Re-parse even provider-validated data: fakes and future providers may skip validation.
      const parsed = parseModelOutput(res.data);
      if (!parsed.ok) throw new BriefOutputInvalidError();
      output = parsed.data;
    } catch (err) {
      return fail(err, 1, inputs);
    }

    // ---- Ground the answer in the PR (AC-71 … AC-82), then store (AC-83 … AC-85) ----
    const validated = validateBrief({
      output,
      prFiles: assembled.prFiles,
      blastCallers: assembled.blastCallers,
    });
    const usage: BriefUsage = {
      llm_calls: res.attempts,
      tokens_in: res.tokensIn ?? null,
      tokens_out: res.tokensOut ?? null,
      cost_usd: res.costUsd ?? null,
      duration_ms: elapsed(),
    };
    let brief: PrBrief;
    try {
      brief = PrBriefSchema.parse({
        summary: validated.summary,
        risks: { risks: validated.risks },
        review_focus: validated.review_focus,
        intent: assembled.intent,
        blast: assembled.blast,
        head_sha: pull.headSha,
        generated_at: this.now().toISOString(),
        model,
        usage,
        inputs,
        dropped: validated.dropped,
      });
    } catch {
      // Our own contract rejected the assembled brief — as bad as an unparsable answer.
      return fail(new BriefOutputInvalidError(), 1, inputs);
    }
    await this.deps.repo.saveBrief(pull.id, brief);

    this.deps.log.info(
      logLine({
        prId: pull.id,
        usage,
        model,
        status: 'ok',
        reason: null,
        dropped: brief.dropped,
        truncated: truncatedSources(inputs),
      }),
    );
    return { brief, generating: false, stale: false };
  }

  // ------------------------------------------------------------------ facts

  /** Read every input. A read failure degrades the input; it never throws (AC-54, AC-56, AC-58). */
  private async assemble(
    workspaceId: string,
    pull: BriefPullRef,
    storedFiles: Awaited<ReturnType<BriefRepository['files']>>,
  ): Promise<Assembled> {
    const unavailable: BriefFacts['unavailable'] = {};
    const records: InputRecord[] = [];
    const note = (record: InputRecord): void => {
      records.push(record);
      if (record.status === 'missing' && record.reason) unavailable[record.source] = record.reason;
    };

    // intent — stored only; the brief never derives one (AC-52)
    const intent = await this.deps.repo.intent(pull.id);
    note(
      intent
        ? { source: 'intent', status: 'used' }
        : { source: 'intent', status: 'missing', reason: REASON.notDerived },
    );

    // description
    const description = pull.body && pull.body.trim() !== '' ? pull.body : null;
    note(
      description
        ? { source: 'description', status: 'used' }
        : { source: 'description', status: 'missing', reason: REASON.empty },
    );

    // linked issue — a closing keyword in this repo only (AC-53); any failure degrades (AC-54)
    const linkedIssue = await this.readLinkedIssue(pull, note);

    // blast — straight from the facade, in a try/catch (AC-57, AC-58)
    const blast = await this.readBlast(pull, storedFiles, note);

    // diff stats — path, role, numbers and ranges; never a hunk body (AC-50, AC-51, AC-59)
    const prFiles = fileStats(storedFiles);
    note(diffStatsInput(storedFiles.length, pull.filesCount));

    // specs (AC-55, AC-56)
    const specs = await this.readSpecs(workspaceId, pull, note);

    const facts: BriefFacts = {
      title: pull.title,
      description,
      linkedIssue,
      intent,
      blast: blast.facts,
      files: prFiles,
      filesTotal: Math.max(pull.filesCount, storedFiles.length),
      specs,
      unavailable,
      textLimits: {},
    };
    return {
      facts,
      records,
      prFiles,
      blast: blast.snapshot,
      blastCallers: blast.callers,
      intent,
    };
  }

  private async readLinkedIssue(
    pull: BriefPullRef,
    note: (r: InputRecord) => void,
  ): Promise<BriefFacts['linkedIssue']> {
    const number = linkedIssueNumber(pull.body, { owner: pull.owner, name: pull.name });
    if (number === null) {
      note({ source: 'linked_issue', status: 'missing', reason: REASON.noLinkedIssue });
      return null;
    }
    try {
      const github = await this.deps.github();
      const issue = await github.getIssue(this.ref(pull), number);
      note({ source: 'linked_issue', status: 'used' });
      return { number: issue.number, title: issue.title, body: issue.body ?? '' };
    } catch {
      // `ConfigError` (no token) or any GitHub failure — the brief goes on without it.
      note({ source: 'linked_issue', status: 'missing', reason: REASON.githubUnavailable });
      return null;
    }
  }

  private async readBlast(
    pull: BriefPullRef,
    storedFiles: ReadonlyArray<{ path: string }>,
    note: (r: InputRecord) => void,
  ): Promise<{
    facts: BriefFacts['blast'];
    snapshot: PrBrief['blast'];
    callers: Map<string, Set<number>> | null;
  }> {
    let result: BlastResult | null = null;
    try {
      result = await this.deps.repoIntel.getBlastRadius(
        pull.repoId,
        storedFiles.map((f) => f.path),
      );
    } catch {
      // Enrichment is best-effort: a throwing index is `missing/index_failed`.
    }
    const radius = result ? toBlastRadius(result) : null;
    const state: BlastInputState = blastInput(radius ?? 'threw');
    note({
      source: 'blast',
      status: state.status,
      ...(state.reason ? { reason: state.reason } : {}),
    });
    if (!state.usable || !result || !radius) return { facts: null, snapshot: null, callers: null };

    const callers = new Map<string, Set<number>>();
    for (const c of result.callers) {
      const lines = callers.get(c.file) ?? new Set<number>();
      lines.add(c.line);
      callers.set(c.file, lines);
    }
    return {
      facts: {
        summary: radius.summary,
        changedSymbols: radius.changed_symbols,
        callers: result.callers.map((c) => ({
          file: c.file,
          symbol: c.symbol,
          line: c.line,
          rank: c.rank,
        })),
      },
      snapshot: radius,
      callers,
    };
  }

  private async readSpecs(
    workspaceId: string,
    pull: BriefPullRef,
    note: (r: InputRecord) => void,
  ): Promise<SpecDoc[]> {
    const agents = await this.deps.enabledAgentDocs(workspaceId, pull.repoId);
    const paths = unionDocPaths(
      agents.map((a) => ({ agentName: a.agentName, paths: orderRunDocs(a.own, a.linked) })),
    );
    if (paths.length === 0) {
      note({ source: 'specs', status: 'missing', reason: REASON.noneAttached });
      return [];
    }

    const ref = this.ref(pull);
    // `currentBranch` rejects (ENOENT) when the clone directory is missing.
    let cloned = pull.clonePath !== null;
    if (cloned) {
      try {
        await this.deps.git.currentBranch(ref);
      } catch {
        cloned = false;
      }
    }
    const docs: SpecDoc[] = [];
    if (cloned) {
      for (const path of paths) {
        try {
          // The same gate as the project-context run path: the path is resolved inside the
          // clone (docs-only: no excluded dir, no symlink onto a non-markdown file) and the
          // bytes must be valid UTF-8 text (server INSIGHTS 2026-10-02 F7).
          const decoded = decodeDoc(await this.deps.git.readFileBytes(ref, path));
          if (decoded.ok) docs.push({ path, content: decoded.text });
        } catch {
          // An unreadable single document is skipped.
        }
      }
    }
    if (docs.length === 0) {
      note({ source: 'specs', status: 'missing', reason: REASON.cloneUnavailable });
      return [];
    }
    note({ source: 'specs', status: 'used' });
    return docs;
  }
}
