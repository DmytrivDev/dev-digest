/**
 * Onboarding Tour (SPEC-02) — application layer.
 *
 * Like `ConventionsService`, the class takes the PORTS it uses, never the DI
 * `Container`: a service that imports the composition root trips `arch:check`'s
 * `service-not-to-composition-root`, hides its real dependencies from its own
 * signature and forces every test to build a container. `routes.ts` assembles them.
 *
 * Everything that is a rule lives in `helpers/*` (ring 1); this file reads the facts
 * (index snapshot, clone, git history), calls those rules, makes AT MOST ONE model
 * call, and stores the result.
 */
import {
  OnboardingTour as OnboardingTourSchema,
  type FeatureModelChoice,
  type GitClient,
  type LLMProvider,
  type OnboardingReason,
  type OnboardingTour,
  type OnboardingTourResponse,
  type Provider,
  type RepoRef,
  type StructuredResult,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import type { GraphSnapshot, IndexState, RepoIntel } from '../repo-intel/types.js';
import {
  CLONE_EXCLUDED_DIRS,
  COMPOSE_FILES,
  EXCERPT_MAX_CHARS,
  ERR_GENERATION_IN_PROGRESS,
  ERR_REPO_NOT_CLONED,
  ERR_REPO_NOT_INDEXED,
  HISTORY_MAX_COMMITS,
  HISTORY_TIMEOUT_MS,
  MODEL_DEADLINE_MS,
  MODEL_MAX_TOKENS,
  README_MAX_CHARS,
} from './constants.js';
import {
  buildNarrativeSections,
  buildSkeletonSections,
  callDecision,
  deriveReadiness,
  indexReasons,
  isStale,
  keepNarrative,
  logLine,
  sortReasons,
  usageFor,
  type SectionInput,
  type UsageInput,
} from './helpers/assemble.js';
import {
  architectureFacts,
  composeServiceNames,
  directoryTree,
  envKeyNames,
  existingScopes,
  howToRunEmptyReason,
  packageManagerOf,
  parseDependencyNames,
  primaryPackageManager,
  runCandidates,
  runTargets,
  skeletonSteps,
} from './helpers/clone-facts.js';
import { packageDiagram, pathSections } from './helpers/graph.js';
import {
  classifyModelError,
  groundCriticalPaths,
  groundReadingPath,
  groundSteps,
  groundTasks,
} from './helpers/ground.js';
import { buildPrompt } from './helpers/prompt.js';
import {
  commitCounts,
  hasControlChar,
  historyWindow,
  hotness,
  needsHistoryFetch,
  rankFiles,
} from './helpers/rank.js';
import type { OnboardingRepoRef, OnboardingRepository } from './repository.js';
import {
  TourModelOutput,
  type CloneFacts,
  type HistoryResult,
  type PromptFacts,
} from './types.js';

export interface OnboardingDeps {
  repo: OnboardingRepository;
  git: GitClient;
  repoIntel: RepoIntel;
  /** `config.repoIntelEnabled` — with the flag off nothing can be indexed (AC-6). */
  repoIntelEnabled: boolean;
  /**
   * The workspace's model choice for the `onboarding` feature (AC-27). A function, so
   * the choice is read per generation: a model picked in Settings applies to the next
   * tour without a restart.
   */
  resolveModel: () => Promise<FeatureModelChoice>;
  /** `container.llm`, with a missing API key mapped to `null` (AC-45). */
  llm: (provider: Provider) => Promise<LLMProvider | null>;
  systemPrompt: () => Promise<string>;
  /**
   * Where the AC-102 line goes. Injected because the app logger is silent under test,
   * so a test could never see a line written to it.
   */
  log: { info(msg: string): void };
  /**
   * Repo ids with a generation in flight. Owned by the route plugin (one set per app
   * instance) and shared by every per-request service.
   */
  inFlight: Set<string>;
  now?: () => Date;
  /** Override the history deadline — injected only by the test that proves it fires. */
  historyTimeoutMs?: number;
  /** Override the model deadline — injected only by the test that proves it fires. */
  modelDeadlineMs?: number;
}

interface Inspection {
  readiness: OnboardingTourResponse['readiness'];
  state: IndexState;
  /** The clone's checked-out branch (`HEAD` when detached); `null` when there is no clone. */
  branch: string | null;
}

const joinPath = (dir: string, name: string): string => (dir === '' ? name : `${dir}/${name}`);

export class OnboardingService {
  constructor(private deps: OnboardingDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private ref(repo: OnboardingRepoRef): RepoRef {
    return { owner: repo.owner, name: repo.name };
  }

  /** Clone and index facts every read and every generation starts from (AC-5, AC-6). */
  private async inspect(repo: OnboardingRepoRef): Promise<Inspection> {
    const [state, branch] = await Promise.all([
      this.deps.repoIntel.getIndexState(repo.id),
      // `currentBranch` rejects (ENOENT) when the directory is missing. No clone path → no I/O.
      repo.clonePath
        ? this.deps.git.currentBranch(this.ref(repo)).then(
            (b): string | null => b,
            (): string | null => null,
          )
        : Promise.resolve<string | null>(null),
    ]);
    return {
      readiness: deriveReadiness({
        clonePath: repo.clonePath,
        cloneExists: branch !== null,
        indexStatus: state.status,
        indexReason: state.reason ?? null,
        lastIndexedSha: state.lastIndexedSha,
        repoIntelEnabled: this.deps.repoIntelEnabled,
      }),
      state,
      branch,
    };
  }

  /**
   * `undefined` means "no such repo in this workspace" — the route turns it into a 404
   * and no tour content is read (AC-105). The stored tour is returned whatever the
   * readiness (AC-10).
   */
  async getTour(workspaceId: string, repoId: string): Promise<OnboardingTourResponse | undefined> {
    const repo = await this.deps.repo.repoInWorkspace(workspaceId, repoId);
    if (!repo) return undefined;
    const [{ readiness, state }, stored] = await Promise.all([
      this.inspect(repo),
      this.deps.repo.getTour(repo.id),
    ]);
    return {
      readiness,
      generating: this.deps.inFlight.has(repo.id),
      tour: stored ? { ...stored, stale: isStale(stored.indexed_sha, state.lastIndexedSha) } : null,
    };
  }

  /**
   * Generate and store this repo's tour (AC-12). `undefined` → 404 (not in the workspace
   * — AC-105 — or deleted while generating — AC-23). Refusals are 409s raised BEFORE any
   * model resolution or call (AC-13, AC-14, AC-15).
   */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingTourResponse | undefined> {
    const repo = await this.deps.repo.repoInWorkspace(workspaceId, repoId);
    if (!repo) return undefined;

    const inspection = await this.inspect(repo);
    if (inspection.readiness === 'not_cloned') {
      throw new AppError(
        ERR_REPO_NOT_CLONED,
        'This repository has no local clone — clone it first, then generate the tour.',
        409,
      );
    }
    if (inspection.readiness === 'not_indexed') {
      throw new AppError(
        ERR_REPO_NOT_INDEXED,
        'This repository is not indexed yet — wait for the index, then generate the tour.',
        409,
      );
    }
    // `has` + `add` with no await between them: two requests cannot both pass.
    if (this.deps.inFlight.has(repo.id)) {
      throw new AppError(
        ERR_GENERATION_IN_PROGRESS,
        'A tour is already being generated for this repository.',
        409,
      );
    }
    this.deps.inFlight.add(repo.id);
    // Released when THIS generation ends — never on the reply: a client that disconnects
    // does not stop the handler, so the tour is still stored (AC-18).
    try {
      return await this.run(repo, inspection);
    } finally {
      this.deps.inFlight.delete(repo.id);
    }
  }

  private async run(
    repo: OnboardingRepoRef,
    { state, branch }: Inspection,
  ): Promise<OnboardingTourResponse | undefined> {
    const started = this.now().getTime();
    const ref = this.ref(repo);
    const indexedSha = state.lastIndexedSha;
    const currentBranch = branch ?? 'HEAD';

    // ---- Facts: index snapshot at the latest indexed commit (AC-26), then the clone ----
    const snapshot = await this.deps.repoIntel.getGraphSnapshot(repo.id);
    const edges = snapshot.edges.filter(
      (e) => e.from !== e.to && !hasControlChar(e.from) && !hasControlChar(e.to),
    );
    const clone = await this.readCloneFacts(ref);

    // ---- History for the 180-day window (AC-56, AC-57) ----
    const history = await this.readHistory(ref, indexedSha, currentBranch);
    const hotnessByPath = history.ok
      ? hotness(
          commitCounts(
            history.touches,
            { start: history.windowStart, end: history.windowEnd },
            snapshot.files.map((f) => f.path),
          ),
        )
      : null;
    const ranked = rankFiles(snapshot.files, hotnessByPath);

    // ---- Pure rules ----
    const reasons = new Set<OnboardingReason>(
      indexReasons({
        status: state.status,
        filesIndexed: state.filesIndexed,
        walkTotal: state.walkTotal ?? null,
        edgeCount: edges.length,
      }),
    );
    if (!history.ok) reasons.add('no_history');

    const paths = pathSections({
      ranked,
      edges,
      unsupportedLanguage: reasons.has('unsupported_language'),
    });
    const candidates = runCandidates(clone.facts);
    const composeNames = clone.facts.compose ? composeServiceNames(clone.facts.compose.text) : [];
    const sectionInput: SectionInput = {
      facts: architectureFacts(
        clone.facts.files,
        snapshot.files.map((f) => f.path),
        primaryPackageManager(clone.facts.files),
        composeNames,
      ),
      packageDiagram: packageDiagram(snapshot.files, edges),
      critical: paths.critical,
      reading: { items: paths.reading.paths.map((path) => ({ path })), empty_reason: paths.reading.empty_reason },
      steps: { items: skeletonSteps(candidates), empty_reason: howToRunEmptyReason(candidates) },
    };

    // ---- At most ONE model call (AC-44, AC-45, AC-51) ----
    let sections: OnboardingTour['sections'];
    let usageInput: UsageInput;
    let failure: OnboardingTour['last_failure'] = null;

    const call = await this.callModel({
      repo,
      snapshot,
      decision: callDecision([...reasons]),
      clone,
      candidates,
      composeNames,
      packageDirs: sectionInput.facts.package_dirs,
      paths,
      reasons,
    });
    if (call.kind === 'narrative') {
      const out = call.output;
      sections = buildNarrativeSections(sectionInput, {
        architecture: out.architecture,
        critical: groundCriticalPaths(paths.critical.items, out.critical_paths),
        reading: groundReadingPath(sectionInput.reading.items, out.reading_path),
        steps: groundSteps(candidates, out.run_steps),
        tasks: groundTasks(out.first_tasks, existingScopes(clone.facts.files)),
      });
      usageInput = call.usage;
    } else {
      sections = buildSkeletonSections(sectionInput);
      usageInput = call.usage;
      if (call.failureReason) failure = { reason: call.failureReason, at: this.now().toISOString() };
    }

    const status: OnboardingTour['status'] = call.kind === 'narrative' ? 'narrative' : 'skeleton';
    const sortedReasons = sortReasons(reasons);
    const usage = usageFor({ ...usageInput, durationMs: this.now().getTime() - started });
    const generatedAt = this.now().toISOString();
    const tour: OnboardingTour = OnboardingTourSchema.parse({
      repo_id: repo.id,
      status,
      reasons: sortedReasons,
      generated_at: generatedAt,
      branch: currentBranch,
      indexed_sha: indexedSha,
      indexed_files: state.filesIndexed,
      walk_total: state.walkTotal ?? null,
      stale: false,
      last_failure: null,
      usage,
      sections,
    });

    // ---- Store (AC-20, AC-21, AC-23) ----
    let response: OnboardingTour | null;
    if (failure && keepNarrative(await this.deps.repo.getTour(repo.id), failure.reason)) {
      // A failed regeneration never replaces a narrative with a skeleton.
      response = await this.deps.repo.recordFailure(repo.id, failure);
    } else {
      response = (await this.deps.repo.saveTour(repo.id, tour)) ? tour : null;
    }

    this.deps.log.info(logLine(repo.id, usage, status, sortedReasons));

    if (!response) return undefined;
    return {
      readiness: 'ready',
      generating: false,
      tour: { ...response, stale: isStale(response.indexed_sha, state.lastIndexedSha) },
    };
  }

  /**
   * Decide whether, and with what, to call the model. Returns the grounded-ready model
   * output, or the skeleton's usage and (for a provider failure) its reason. Adds
   * `llm_not_configured` and `facts_truncated` to `reasons` itself.
   */
  private async callModel(input: {
    repo: OnboardingRepoRef;
    snapshot: GraphSnapshot;
    decision: 'call' | 'skip';
    clone: ReadClone;
    candidates: ReturnType<typeof runCandidates>;
    composeNames: string[];
    packageDirs: string[];
    paths: ReturnType<typeof pathSections>;
    reasons: Set<OnboardingReason>;
  }): Promise<
    | { kind: 'narrative'; output: TourModelOutput; usage: Extract<UsageInput, { kind: 'success' }> }
    | {
        kind: 'skeleton';
        usage: Exclude<UsageInput, { kind: 'success' }>;
        failureReason: 'llm_timeout' | 'llm_failed' | 'llm_invalid_output' | null;
      }
  > {
    const { reasons, clone, paths } = input;
    // AC-44: no ranked material and no graph — a call would only invent.
    if (input.decision === 'skip') {
      return { kind: 'skeleton', usage: { kind: 'no_call', provider: null, model: null, durationMs: 0 }, failureReason: null };
    }

    const choice = await this.deps.resolveModel();
    const llm = await this.deps.llm(choice.provider);
    if (llm === null) {
      reasons.add('llm_not_configured');
      return {
        kind: 'skeleton',
        usage: { kind: 'no_call', provider: choice.provider, model: choice.model, durationMs: 0 },
        failureReason: null,
      };
    }

    const excerpts = await this.readExcerpts(this.ref(input.repo), paths.reading.paths);
    const tree = directoryTree(clone.facts.files);
    const facts: PromptFacts = {
      stack: {
        packageManagers: [
          ...new Set(runTargets(clone.facts.files).map((d) => packageManagerOf(d, clone.facts.files))),
        ],
        packageDirs: input.packageDirs,
        dependencyNames: clone.dependencyNames,
        composeServices: input.composeNames,
        envKeyNames: clone.envKeys,
      },
      candidates: input.candidates,
      criticalPaths: paths.critical.items,
      readingPath: paths.reading.paths,
      readme: clone.facts.readme,
      tree: tree.entries,
      routes: input.snapshot.endpoints,
      excerpts,
    };
    const prompt = buildPrompt({ system: await this.deps.systemPrompt(), facts });
    // AC-100: anything capped or dropped, including what was already cut while reading.
    if (prompt.truncated.length > 0 || clone.dependenciesCapped || tree.capped) {
      reasons.add('facts_truncated');
    }

    let res: StructuredResult<TourModelOutput>;
    try {
      res = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: TourModelOutput,
          schemaName: 'OnboardingTour',
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: 0.2,
          maxTokens: MODEL_MAX_TOKENS,
          // Exactly one engine attempt, no schema-repair retry (AC-51). OpenRouter ignores a
          // per-request `timeoutMs`, so the bound is `withTimeout`, not a request field.
          maxRetries: 0,
          // A reasoning pass took 33–160 s and up to 2,600 extra output tokens per tour on
          // some OpenRouter upstreams; without it the same answer takes ~14–28 s.
          disableReasoning: true,
        }),
        this.deps.modelDeadlineMs ?? MODEL_DEADLINE_MS,
      );
    } catch (err) {
      const failureReason = classifyModelError(err);
      reasons.add(failureReason);
      return {
        kind: 'skeleton',
        usage: { kind: 'failure', provider: choice.provider, model: choice.model, durationMs: 0 },
        failureReason,
      };
    }
    return {
      kind: 'narrative',
      output: res.data,
      usage: {
        kind: 'success',
        provider: choice.provider,
        model: choice.model,
        attempts: res.attempts,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
        durationMs: 0,
      },
    };
  }

  /**
   * The clone's files and the few it is worth reading. A file that cannot be read is
   * skipped — a fact is never worth failing the tour. Every read goes through the git
   * port's `readFile`, which resolves the path inside the clone first. Nothing is
   * synced, fetched or enqueued here (AC-24, AC-25).
   */
  private async readCloneFacts(ref: RepoRef): Promise<ReadClone> {
    const files = await this.deps.git.listFiles(ref, { excludeDirs: CLONE_EXCLUDED_DIRS });
    const read = async (path: string, max: number): Promise<string | null> => {
      try {
        return (await this.deps.git.readFile(ref, path)).slice(0, max);
      } catch {
        return null;
      }
    };

    const packageJsons: Record<string, string> = {};
    const dependencyNames: Record<string, string[]> = {};
    let dependenciesCapped = false;
    for (const dir of runTargets(files)) {
      const text = await read(joinPath(dir, 'package.json'), Number.MAX_SAFE_INTEGER);
      if (text === null) continue;
      packageJsons[dir] = text;
      const deps = parseDependencyNames(text);
      if (deps.names.length > 0) dependencyNames[dir] = deps.names;
      if (deps.capped) dependenciesCapped = true;
    }

    // The env-copy candidates name every eligible directory holding `.env.example`.
    const envDirs = runCandidates({
      files,
      packageJsons: {},
      envExamples: {},
      compose: null,
      readme: null,
    })
      .filter((c) => c.kind === 'env')
      .map((c) => c.target);
    const envExamples: Record<string, string> = {};
    const envKeys: Record<string, string[]> = {};
    for (const dir of envDirs) {
      const text = await read(joinPath(dir, '.env.example'), Number.MAX_SAFE_INTEGER);
      if (text === null) continue;
      envExamples[dir] = text;
      const keys = envKeyNames(text);
      if (keys.length > 0) envKeys[dir] = keys;
    }

    const rootFiles = new Set(files.filter((f) => !f.includes('/')));
    const composeFile = COMPOSE_FILES.find((f) => rootFiles.has(f));
    const composeText = composeFile ? await read(composeFile, Number.MAX_SAFE_INTEGER) : null;
    const readmeFile = [...rootFiles]
      .filter((f) => f.toLowerCase() === 'readme.md')
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
    // One char over the cap, so the prompt can tell "exactly 8,000" from "longer" (AC-100).
    const readme = readmeFile ? await read(readmeFile, README_MAX_CHARS + 1) : null;

    return {
      facts: {
        files,
        packageJsons,
        envExamples,
        compose: composeFile && composeText !== null ? { file: composeFile, text: composeText } : null,
        readme,
      },
      dependencyNames,
      dependenciesCapped,
      envKeys,
    };
  }

  /** First characters of each reading-path file (AC-98); one over the cap marks it as cut. */
  private async readExcerpts(ref: RepoRef, paths: string[]): Promise<{ path: string; text: string }[]> {
    const out: { path: string; text: string }[] = [];
    for (const path of paths) {
      try {
        const text = (await this.deps.git.readFile(ref, path)).slice(0, EXCERPT_MAX_CHARS + 1);
        out.push({ path, text });
      } catch {
        // unreadable → no excerpt for it
      }
    }
    return out;
  }

  /**
   * The history the 180-day window needs, bounded as a whole by `withTimeout`. When the
   * clone is shallow inside the window the history is fetched once (AC-56). Any failure
   * or timeout is `{ ok: false }`: hotness 0 and reason `no_history` (AC-57) — never an error.
   */
  private async readHistory(ref: RepoRef, indexedSha: string, branch: string): Promise<HistoryResult> {
    const timeoutMs = this.deps.historyTimeoutMs ?? HISTORY_TIMEOUT_MS;
    const { git } = this.deps;
    try {
      return await withTimeout(
        (async (): Promise<HistoryResult> => {
          const window = historyWindow(await git.commitDate(ref, indexedSha));
          let touches = await git.commitTouches(ref, indexedSha, { maxCount: HISTORY_MAX_COMMITS });
          if (needsHistoryFetch(touches, window)) {
            await git.fetchHistorySince(ref, window.start, branch === 'HEAD' ? indexedSha : branch, {
              timeoutMs,
            });
            touches = await git.commitTouches(ref, indexedSha, { maxCount: HISTORY_MAX_COMMITS });
          }
          return { ok: true, touches, windowStart: window.start, windowEnd: window.end };
        })(),
        timeoutMs,
      );
    } catch {
      return { ok: false };
    }
  }
}

/** What `readCloneFacts` reads, beside the prompt-bound dependency and env key names. */
interface ReadClone {
  facts: CloneFacts;
  dependencyNames: Record<string, string[]>;
  dependenciesCapped: boolean;
  envKeys: Record<string, string[]>;
}
