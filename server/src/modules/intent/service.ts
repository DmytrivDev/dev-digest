/**
 * Intent derivation (the intent layer).
 *
 * The shape of the class is load-bearing, same reasoning as
 * `ConventionsService` (`modules/conventions/service.ts`): it takes the PORTS
 * it uses, never the DI `Container`. A service that imports the composition
 * root trips `arch:check`'s `service-not-to-composition-root`, hides its real
 * dependencies from its own signature, and forces every test to build a
 * container.
 */
import type {
  ChatMessage,
  FeatureModelChoice,
  GitClient,
  GitHubClient,
  IntentSource,
  IntentSourceKind,
  LLMProvider,
  PrIntentRecord,
  Provider,
  StructuredResult,
} from '@devdigest/shared';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import {
  DERIVE_DEADLINE_MS,
  DERIVE_MAX_RETRIES,
  DERIVE_TIMEOUT_MS,
  MAX_BODY_CHARS,
  MAX_COMMITS,
  MAX_DOC_CHARS,
  MAX_PATHS,
} from './constants.js';
import {
  capDocRefs,
  confidenceTier,
  intentSourceKey,
  isProviderConfigError,
  isSubstantiveBody,
  parseReferences,
  providerConfigMessage,
  providerErrorStatus,
} from './helpers.js';
import { buildIntentMessages, IntentProposal, type IntentPromptInput } from './prompt.js';
import type { IntentRepository } from './repository.js';

export interface IntentDeps {
  repo: IntentRepository;
  git: GitClient;
  /** `container.github` — async because the client is built from a stored token. */
  github: () => Promise<GitHubClient>;
  /** `container.llm` — async because a provider is built from a stored secret. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /**
   * The workspace's model choice for the `review_intent` feature. A
   * function, not a value, so a Settings change takes effect on the next
   * derivation without restarting the API.
   */
  resolveModel: () => Promise<FeatureModelChoice>;
  /** Override the hard deadline — injected only by the test that proves it fires. */
  deadlineMs?: number;
}

export interface DeriveOptions {
  /** Re-derive even when the stored `source_key` still matches (§2.3). */
  force?: boolean;
}

export interface DeriveResult {
  record: PrIntentRecord;
  /** True when the stored derivation was reused rather than re-derived. */
  cached: boolean;
  /** False when derivation succeeded but the write failed — the caller
   *  (`run-executor`) still gets the in-memory record for the prompt. */
  persisted: boolean;
}

export class IntentService {
  constructor(private deps: IntentDeps) {}

  /**
   * Derive (or reuse) a PR's intent. `undefined` means "no such PR in this
   * workspace" — the route turns that into a 404.
   *
   * Every source is gathered with its OWN try/catch (§2.4): a missing
   * GitHub token, a 404 issue, an unindexed repo or a path that fails the
   * safety gate all degrade to `resolved: false` on that one source rather
   * than aborting the whole derivation. Only the model call itself and the
   * final persistence step can throw out of this method — everything else is
   * absorbed into the `sources` array.
   */
  async derive(
    workspaceId: string,
    prId: string,
    opts: DeriveOptions = {},
  ): Promise<DeriveResult | undefined> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) return undefined;
    const repo = await this.deps.repo.getRepo(pull.repoId);
    if (!repo) return undefined;

    const choice = await this.deps.resolveModel();
    const key = intentSourceKey({
      headSha: pull.headSha,
      body: pull.body,
      provider: choice.provider,
      model: choice.model,
    });

    if (!opts.force) {
      const existingKey = await this.deps.repo.getSourceKey(prId);
      if (existingKey !== undefined && existingKey === key) {
        const stored = await this.deps.repo.get(prId);
        if (stored) return { record: stored, cached: true, persisted: true };
      }
    }

    const bodyText = pull.body ?? '';
    const sources: IntentSource[] = [];
    const promptInput: IntentPromptInput = {
      fullName: repo.fullName,
      prNumber: pull.number,
      prTitle: pull.title,
      prBranch: pull.branch,
    };

    // ---- PR title / description (sources #3, #4) -------------------------
    sources.push({ kind: 'pr_title', ref: null, resolved: pull.title.trim().length > 0, detail: null });
    if (bodyText.trim().length > 0) {
      promptInput.prBody = bodyText.slice(0, MAX_BODY_CHARS);
    }
    sources.push({ kind: 'pr_body', ref: null, resolved: isSubstantiveBody(bodyText), detail: null });

    // ---- References parsed out of the body (§1.3, §1.4, §1.5) ------------
    const refs = parseReferences(bodyText);

    let linkedIssueAttached = false;
    for (const ref of refs.issues) {
      const crossRepo =
        (!!ref.owner && ref.owner !== repo.owner) || (!!ref.repo && ref.repo !== repo.name);
      const kind: IntentSourceKind = ref.linked ? 'linked_issue' : 'mentioned_issue';
      const label = `#${ref.number}`;
      if (crossRepo) {
        // The RepoRef we hold is THIS PR's repo — a cross-repo reference is
        // recorded but deliberately not fetched (§1.3).
        sources.push({
          kind,
          ref: `${ref.owner}/${ref.repo}#${ref.number}`,
          resolved: false,
          detail: 'cross-repo reference — not fetched',
        });
        continue;
      }
      try {
        const github = await this.deps.github();
        const issue = await github.getIssue({ owner: repo.owner, name: repo.name }, ref.number);
        sources.push({ kind, ref: label, resolved: true, detail: null });
        if (ref.linked && !linkedIssueAttached) {
          promptInput.linkedIssue = { number: issue.number, title: issue.title, body: issue.body };
          linkedIssueAttached = true;
        }
      } catch (err) {
        sources.push({ kind, ref: label, resolved: false, detail: (err as Error).message });
      }
    }

    for (const tk of refs.ticketKeys) {
      // Never fetched — there is no Jira adapter (§1.4) — always unresolved.
      sources.push({ kind: 'ticket_key', ref: tk, resolved: false, detail: null });
    }

    const safeDocPaths = new Set(capDocRefs(refs.specDocs));
    const specDocs: { path: string; content: string }[] = [];
    for (const path of refs.specDocs) {
      if (!safeDocPaths.has(path)) {
        sources.push({ kind: 'spec_doc', ref: path, resolved: false, detail: 'rejected by path safety gate' });
        continue;
      }
      if (!repo.clonePath) {
        sources.push({ kind: 'spec_doc', ref: path, resolved: false, detail: 'repository not cloned' });
        continue;
      }
      try {
        const content = await this.deps.git.readFile({ owner: repo.owner, name: repo.name }, path);
        sources.push({ kind: 'spec_doc', ref: path, resolved: true, detail: null });
        specDocs.push({ path, content: content.slice(0, MAX_DOC_CHARS) });
      } catch (err) {
        sources.push({ kind: 'spec_doc', ref: path, resolved: false, detail: (err as Error).message });
      }
    }
    if (specDocs.length > 0) promptInput.specDocs = specDocs;

    // ---- Indirect signals (§1, sources #5-7) ------------------------------
    sources.push({ kind: 'branch', ref: pull.branch, resolved: pull.branch.trim().length > 0, detail: null });

    const commits = await this.deps.repo.getCommitMessages(prId, MAX_COMMITS);
    sources.push({ kind: 'commits', ref: null, resolved: commits.length > 0, detail: null });
    if (commits.length > 0) promptInput.commits = commits;

    const paths = await this.deps.repo.getChangedPaths(prId, MAX_PATHS);
    sources.push({ kind: 'paths', ref: null, resolved: paths.length > 0, detail: null });
    if (paths.length > 0) promptInput.paths = paths;

    // ---- The one model call ------------------------------------------------
    const messages = buildIntentMessages(promptInput);
    const llm = await this.deps.llm(choice.provider);
    const result = await this.completeWithinDeadline(llm, choice.model, messages);

    const tier = confidenceTier(sources);
    const model = `${choice.provider}/${choice.model}`;

    try {
      const record = await this.deps.repo.upsert(prId, {
        intent: result.data.intent,
        inScope: result.data.in_scope,
        outOfScope: result.data.out_of_scope,
        confidence: tier,
        sources,
        model,
        sourceKey: key,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      });
      return { record, cached: false, persisted: true };
    } catch {
      // Best-effort means the review is not punished for a write failure —
      // the caller still gets the derived block for the prompt (§2.4).
      const record: PrIntentRecord = {
        pr_id: prId,
        intent: result.data.intent,
        in_scope: result.data.in_scope,
        out_of_scope: result.data.out_of_scope,
        confidence: tier,
        sources,
        model,
        derived_at: new Date().toISOString(),
        cost_usd: result.costUsd,
      };
      return { record, cached: false, persisted: false };
    }
  }

  /**
   * The one model call, under a deadline we enforce ourselves — same
   * reasoning as `ConventionsService.completeWithinDeadline`: OpenRouter
   * fixes its timeout at construction and ignores the per-request value
   * (`server/INSIGHTS.md`, 2026-09-19), so the bound has to be ours.
   */
  private async completeWithinDeadline(
    llm: LLMProvider,
    model: string,
    messages: ChatMessage[],
  ): Promise<StructuredResult<IntentProposal>> {
    try {
      return await withTimeout(
        llm.completeStructured({
          model,
          schema: IntentProposal,
          schemaName: 'PrIntent',
          messages,
          timeoutMs: DERIVE_TIMEOUT_MS,
          maxRetries: DERIVE_MAX_RETRIES,
        }),
        this.deps.deadlineMs ?? DERIVE_DEADLINE_MS,
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        const seconds = Math.round((this.deps.deadlineMs ?? DERIVE_DEADLINE_MS) / 1000);
        throw new ExternalServiceError(
          `The intent model did not answer within ${seconds}s — try again, or pick a faster model in Settings.`,
        );
      }
      // A rejected CONFIGURATION is not a server fault and not a transient one:
      // the model id in Settings is dead (or the key is refused), and no retry
      // will fix it. 422 says "fix this on your side" and carries the provider's
      // own wording, which usually names the replacement slug. Without this the
      // error left here raw, reached the generic handler as a 500, and read to
      // the user as "DevDigest is broken" rather than "your model is gone".
      if (isProviderConfigError(err)) {
        throw new ValidationError(providerConfigMessage(model, err));
      }
      // The provider answered, with a failure of its own (5xx, 429). That is a
      // bad gateway, not a bug here — same 502 the timeout above maps to, so the
      // two transient shapes report identically. An error with NO status never
      // reached the provider or came from our own code; it keeps its identity.
      const status = providerErrorStatus(err);
      if (status !== undefined) {
        throw new ExternalServiceError(
          `The intent provider failed with HTTP ${status}. This is usually transient — try again.`,
        );
      }
      throw err;
    }
  }
}
