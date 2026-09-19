/**
 * Conventions extractor (L02).
 *
 * The shape of the class is load-bearing: it takes the PORTS it uses, never the
 * DI `Container`. A service that imports the composition root trips
 * `arch:check`'s `service-not-to-composition-root`, hides its real dependencies
 * from its own signature, and forces every test to build a container.
 */
import type {
  ConventionCandidate,
  ConventionScanReport,
  ConventionScanResult,
  ConventionStatus,
  FeatureModelChoice,
  GitClient,
  LLMProvider,
  Provider,
  Skill,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { SkillsService } from '../skills/service.js';
import { SKILL_BODY_MAX } from '../skills/constants.js';
import {
  CODE_SAMPLE_COUNT,
  CONFIG_SAMPLE_PATHS,
  CONVENTIONS_SKILL_NAME,
  EXTRACT_MAX_RETRIES,
  EXTRACT_TIMEOUT_MS,
  MAX_CANDIDATES,
  MAX_CONFIG_SAMPLES,
} from './constants.js';
import {
  buildSkillBody,
  buildSkillDescription,
  configSearchDirs,
  fingerprintRule,
  toConventionDto,
  validateEvidence,
  type ProposedConvention,
} from './helpers.js';
import {
  ExtractedConventions,
  buildConventionsMessages,
  clipSample,
  type ConventionSample,
} from './prompt.js';
import type { ConventionRepoRef, ConventionsRepository, InsertConvention } from './repository.js';

export interface ConventionsDeps {
  repo: ConventionsRepository;
  git: GitClient;
  repoIntel: RepoIntel;
  /** `container.llm` — async because a provider is built from a stored secret. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /**
   * The workspace's model choice for the `conventions` feature. A function, not a
   * value, so the choice is read per scan: a model picked in Settings must take
   * effect on the next scan without restarting the API.
   */
  resolveModel: () => Promise<FeatureModelChoice>;
  skills: SkillsService;
}

export class ConventionsService {
  constructor(private deps: ConventionsDeps) {}

  /** `undefined` means "no such repo in this workspace" — the route turns it into a 404. */
  async list(
    workspaceId: string,
    repoId: string,
    status?: ConventionStatus,
  ): Promise<ConventionCandidate[] | undefined> {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    const rows = await this.deps.repo.listByRepo(workspaceId, repoId, status);
    return rows.map((row) => toConventionDto(row, repo));
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.deps.repo.setStatus(workspaceId, id, status);
    if (!row) return undefined;
    // The DTO carries an evidence permalink, which needs the repo's owner/name.
    const repo = row.repoId
      ? await this.deps.repo.getRepo(workspaceId, row.repoId)
      : undefined;
    return toConventionDto(row, repo ?? { owner: '', name: '' });
  }

  /**
   * Scan a repository for convention candidates.
   *
   * Synchronous on purpose: one cheap-model call, and the caller wants the
   * candidates, not a job id to poll.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScanResult | undefined> {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;

    const samples = await this.collectSamples(repo);
    const choice = await this.deps.resolveModel();
    const headSha = await this.deps.git.currentHead(repo).catch(() => null);

    const { messages, included } = buildConventionsMessages(repo.fullName, samples);
    const llm = await this.deps.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ExtractedConventions,
      schemaName: 'RepoConventions',
      messages,
      // `timeoutMs` binds the OpenAI and Anthropic adapters, but NOT OpenRouter:
      // that provider fixes its timeout in its constructor and ignores the
      // per-request value. `maxRetries` is the bound that works everywhere —
      // it caps the schema-repair loop, which is the real latency multiplier.
      timeoutMs: EXTRACT_TIMEOUT_MS,
      maxRetries: EXTRACT_MAX_RETRIES,
    });

    // Validate against what was actually SENT (clipped the same way), so a line
    // past the end of the sample is out of range rather than silently trusted.
    const sent = new Map(included.map((s) => [s.path, clipSample(s.content)]));
    const proposed = res.data.conventions.slice(0, MAX_CANDIDATES);

    const dropped: ConventionScanReport['dropped'] = [];
    const verified: Array<ProposedConvention & { fingerprint: string }> = [];
    const seen = new Set<string>();

    for (const raw of proposed) {
      const candidate: ProposedConvention = {
        ...raw,
        confidence: clamp01(raw.confidence),
      };
      const check = validateEvidence(candidate, sent);
      if (!check.ok) {
        dropped.push({ rule: candidate.rule, reason: check.reason });
        continue;
      }
      const fingerprint = fingerprintRule(candidate.rule);
      if (seen.has(fingerprint)) {
        dropped.push({ rule: candidate.rule, reason: 'duplicate_in_batch' });
        continue;
      }
      seen.add(fingerprint);
      verified.push({
        ...candidate,
        evidence_line: check.line,
        evidence_snippet: check.snippet,
        fingerprint,
      });
    }

    const created = await this.persist(workspaceId, repo, verified, headSha);
    const rows = await this.deps.repo.listByRepo(workspaceId, repoId);

    return {
      candidates: rows.map((row) => toConventionDto(row, repo)),
      scan: {
        head_sha: headSha,
        provider: choice.provider,
        model: choice.model,
        config_samples: included.filter((s) => s.kind === 'config').map((s) => s.path),
        code_samples: included.filter((s) => s.kind === 'code').map((s) => s.path),
        proposed: proposed.length,
        kept: verified.length,
        dropped,
        created,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
        cost_usd: res.costUsd,
      },
    };
  }

  /**
   * Assemble the accepted candidates into the `repo-conventions` skill.
   *
   * Goes through `SkillsService` rather than writing `skills` directly, so the
   * body snapshot and the version bump come from the one place that owns them —
   * and a rebuild that changes nothing burns no version, because `isBodyChange`
   * sees an identical body.
   */
  async buildSkill(workspaceId: string, repoId: string): Promise<Skill | undefined> {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;

    const rows = await this.deps.repo.listByRepo(workspaceId, repoId, 'accepted');
    if (rows.length === 0) {
      // A skill with no rules would link to an agent and contribute nothing while
      // looking like a working one.
      throw new ValidationError('No accepted conventions to assemble — accept at least one first.');
    }

    const accepted = rows.map((row) => toConventionDto(row, repo));
    const body = buildSkillBody(repo.fullName, accepted, SKILL_BODY_MAX);
    const description = buildSkillDescription(repo.fullName);

    const existing = (await this.deps.skills.list(workspaceId)).find(
      (s) => s.name === CONVENTIONS_SKILL_NAME,
    );
    if (!existing) {
      return this.deps.skills.create(workspaceId, {
        name: CONVENTIONS_SKILL_NAME,
        description,
        type: 'convention',
        source: 'extracted',
        body,
        enabled: true,
      });
    }

    const updated = await this.deps.skills.update(workspaceId, existing.id, { description, body });
    if (!updated) {
      // `SkillsRepository.update` holds an optimistic lock on `skills.version`.
      throw new ValidationError(
        `The '${CONVENTIONS_SKILL_NAME}' skill was edited concurrently — try again.`,
      );
    }
    return updated;
  }

  /**
   * Sample selection — entirely code, no model.
   *
   * Two halves, because they cannot come from one call: configs are read by exact
   * path (and `getConventionSamples` filters `eslint`/`prettier`/`.config.` out of
   * the ranked list on purpose), while the code half is the top-N ranked files.
   */
  private async collectSamples(repo: ConventionRepoRef): Promise<ConventionSample[]> {
    if (!repo.clonePath) {
      throw new ValidationError(
        'Repository has not been cloned yet — finish importing it before extracting conventions.',
      );
    }

    const codePaths = await this.deps.repoIntel.getConventionSamples(repo.id, CODE_SAMPLE_COUNT);
    if (codePaths.length === 0) {
      // getTopFilesByRank returns [] both when repo-intel is disabled and when the
      // repo was never indexed. Both look exactly like "the model found nothing",
      // so say so here instead of paying for a model call that cannot succeed.
      throw new ValidationError(
        'Repository has no code index yet — reindex it first (or repo-intel is disabled).',
      );
    }

    const samples: ConventionSample[] = [];
    let configCount = 0;
    for (const dir of configSearchDirs(codePaths)) {
      for (const name of CONFIG_SAMPLE_PATHS) {
        if (configCount >= MAX_CONFIG_SAMPLES) break;
        const path = `${dir}${name}`;
        const content = await this.readSample(repo, path);
        if (!content) continue;
        samples.push({ path, content, kind: 'config' });
        configCount += 1;
      }
    }
    for (const path of codePaths) {
      const content = await this.readSample(repo, path);
      if (content) samples.push({ path, content, kind: 'code' });
    }
    return samples;
  }

  /**
   * Read one file from the clone, treating "missing" and "empty" alike.
   *
   * Both cases must be absent: the real `SimpleGitClient` throws on a missing
   * path while `MockGitClient` returns `''`, and an empty config teaches the model
   * nothing anyway.
   */
  private async readSample(repo: ConventionRepoRef, path: string): Promise<string | null> {
    try {
      const content = await this.deps.git.readFile(repo, path);
      return content.trim() === '' ? null : content;
    } catch {
      return null;
    }
  }

  /**
   * Write the scan's result, preserving every triage decision.
   *
   * Done as an explicit read-then-write rather than an upsert: `repo_id` is
   * nullable, so Postgres treats NULLs as distinct and `ON CONFLICT (repo_id,
   * fingerprint)` would not reliably fire. The ordering is what makes the
   * "rejected stays rejected" criterion hold across a RE-SCAN and not merely
   * across a restart — an accepted or rejected row is never touched here.
   */
  private async persist(
    workspaceId: string,
    repo: ConventionRepoRef,
    verified: Array<ProposedConvention & { fingerprint: string }>,
    headSha: string | null,
  ): Promise<number> {
    const existing = await this.deps.repo.listByRepo(workspaceId, repo.id);
    const byFingerprint = new Map(existing.map((row) => [row.fingerprint, row]));

    await this.deps.repo.deletePendingExcept(
      workspaceId,
      repo.id,
      verified.map((v) => v.fingerprint),
    );

    const inserts: InsertConvention[] = [];
    for (const v of verified) {
      const prior = byFingerprint.get(v.fingerprint);
      if (prior) {
        if (prior.status === 'pending') {
          await this.deps.repo.refreshPending(workspaceId, {
            id: prior.id,
            category: v.category,
            rule: v.rule,
            evidencePath: v.evidence_path,
            evidenceLine: v.evidence_line,
            evidenceSnippet: v.evidence_snippet,
            evidenceSha: headSha,
            confidence: v.confidence,
          });
        }
        continue;
      }
      inserts.push({
        workspaceId,
        repoId: repo.id,
        category: v.category,
        rule: v.rule,
        evidencePath: v.evidence_path,
        evidenceLine: v.evidence_line,
        evidenceSnippet: v.evidence_snippet,
        evidenceSha: headSha,
        confidence: v.confidence,
        fingerprint: v.fingerprint,
      });
    }

    await this.deps.repo.insertMany(inserts);
    return inserts.length;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
