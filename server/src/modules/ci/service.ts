import type {
  CiExportInput,
  CiInstallation,
  CiInstallationList,
  CiPreview,
  CiPreviewInput,
  GitHubClient,
  RepoRef,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { CiInstalledFile } from '../../db/schema/ci.js';
import type { AgentsRepository } from '../agents/repository.js';
import {
  CI_BRANCH,
  CI_GENERATOR_VERSION,
  CI_PR_BODY,
  CI_PR_TITLE,
  PROVIDER_NOT_SUPPORTED_MESSAGE,
} from './constants.js';
import { assembleFiles, toPreviewFiles, zipFiles, type BundleFile } from './helpers/bundle.js';
import { toInstallationDto } from './helpers/dto.js';
import { toGithubError } from './helpers/github-error.js';
import { renderManifest } from './helpers/manifest.js';
import {
  kebab,
  manifestPath,
  memoryPath,
  runnerPath,
  skillPath,
  workflowPath,
} from './helpers/slug.js';
import { validateWorkflow } from './helpers/validate-workflow.js';
import { renderWorkflow } from './helpers/workflow.js';
import type { CiRepository } from './repository.js';
import type { RunnerBundleSource } from './types.js';

export interface CiServiceDeps {
  repo: CiRepository;
  agents: Pick<AgentsRepository, 'getById' | 'linkedSkills'>;
  github: () => Promise<GitHubClient>;
  bundle: RunnerBundleSource;
}

/** What an export hands back: zip bytes, or the installation + PR. */
export type ExportResult =
  | { kind: 'zip'; fileName: string; bytes: Uint8Array }
  | { kind: 'pr'; installation: CiInstallation; prUrl: string };

interface BuiltBundle {
  agentId: string;
  agentVersion: number;
  repoId: string;
  repoFullName: string;
  slug: string;
  files: BundleFile[];
}

function splitRepo(fullName: string): RepoRef {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
}

/**
 * Export-to-CI use cases: preview, export (PR / zip), installations. Depends on
 * ports and the repository only — never on the Container or a concrete adapter.
 */
export class CiService {
  constructor(private readonly deps: CiServiceDeps) {}

  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const built = await this.build(workspaceId, agentId, input, undefined);
    return { files: toPreviewFiles(built.files) };
  }

  async export(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
  ): Promise<ExportResult> {
    const built = await this.build(workspaceId, agentId, input, input.workflow_contents);
    const workflow = built.files.find((f) => f.kind === 'workflow')!;
    const verdict = validateWorkflow(workflow.contents);
    if (!verdict.ok) {
      throw new AppError(
        'workflow_invalid',
        `The workflow is not allowed: ${verdict.reason}.`,
        422,
        { reason: verdict.reason },
      );
    }

    let prUrl: string | null = null;
    if (input.action === 'open_pr') prUrl = await this.openPr(built);

    let row;
    try {
      row = await this.deps.repo.upsertInstallation({
      agentId: built.agentId,
      repoId: built.repoId,
      repoFullName: built.repoFullName,
      workflowPath: workflow.path,
      agentSlug: built.slug,
      generatorVersion: CI_GENERATOR_VERSION,
      agentVersion: built.agentVersion,
      triggers: input.triggers,
      postAs: input.post_as,
      prUrl,
      files: recordedFiles(built.files),
    });
    } catch (err) {
      // The PR is already open: keep its URL in the error so the user is not left without a trace.
      if (prUrl) {
        throw new AppError(
          'installation_save_failed',
          `The pull request was opened (${prUrl}) but the installation could not be saved. Refresh and re-export to record it.`,
          500,
          { pr_url: prUrl },
        );
      }
      throw err;
    }

    if (input.action === 'zip') {
      return {
        kind: 'zip',
        fileName: `devdigest-ci-${built.slug}.zip`,
        bytes: zipFiles(built.files),
      };
    }
    const all = await this.deps.repo.listInstallations(workspaceId, agentId);
    const found = all.find((i) => i.row.id === row.id);
    const installation = toInstallationDto(row, built.repoFullName, found?.lastRun ?? null);
    return { kind: 'pr', installation, prUrl: prUrl! };
  }

  async installations(workspaceId: string, agentId: string): Promise<CiInstallationList> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.deps.repo.listInstallations(workspaceId, agentId);
    return {
      installations: rows.map((r) => toInstallationDto(r.row, r.repoFullName, r.lastRun)),
    };
  }

  // ---------------------------------------------------------------- internals

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  /**
   * The single place the file set is built — preview and export both call it, so
   * what is exported is exactly what was previewed. Check order: 404 agent →
   * 404 repo → 422 provider → 409 conflicts → 500 missing runner bundle.
   */
  private async build(
    workspaceId: string,
    agentId: string,
    input: CiPreviewInput,
    workflowOverride: string | undefined,
  ): Promise<BuiltBundle> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const repo = await this.deps.repo.repoInWorkspace(workspaceId, input.repo_id);
    if (!repo) throw new NotFoundError('Repository not found');

    if (agent.provider !== 'openrouter') {
      throw new AppError('provider_not_supported', PROVIDER_NOT_SUPPORTED_MESSAGE, 422);
    }

    // The slug is frozen on the first export (AC-14); later renames keep it.
    const own = await this.deps.repo.installationFor(workspaceId, agentId, repo.id);
    const slug = own?.agentSlug || kebab(agent.name, 'agent', agent.id);

    const linked = await this.deps.agents.linkedSkills(agentId);
    const skills = linked
      .filter((l) => l.skill.enabled)
      .map((l) => ({
        skillId: l.skill.id,
        body: l.skill.body,
        slug: kebab(l.skill.name, 'skill', l.skill.id),
      }));

    const others = (await this.deps.repo.installationsInRepo(workspaceId, repo.id)).filter(
      (i) => i.agentId !== agentId,
    );
    const recorded = new Map<string, CiInstalledFile>();
    for (const inst of others) for (const f of inst.files) recorded.set(f.path, f);

    const manifestFile = manifestPath(slug);
    const workflowFile = workflowPath(slug);
    const conflict = (path: string): never => {
      throw new AppError(
        'slug_conflict',
        `${path} is already used by another agent or skill exported to ${repo.fullName}.`,
        409,
        { path },
      );
    };
    for (const path of [manifestFile, workflowFile]) if (recorded.has(path)) conflict(path);
    const seen = new Map<string, string>();
    for (const s of skills) {
      const path = skillPath(s.slug);
      const prior = recorded.get(path);
      if (prior && (prior.kind !== 'skill' || prior.skill_id !== s.skillId)) conflict(path);
      const dup = seen.get(path);
      if (dup !== undefined && dup !== s.skillId) conflict(path);
      seen.set(path, s.skillId);
    }

    const runner = await this.deps.bundle.list();
    if (!runner) {
      throw new AppError(
        'runner_bundle_missing',
        'The DevDigest runner bundle is not built — run `pnpm build` in agent-runner/.',
        500,
      );
    }

    const generated = renderWorkflow({ slug, triggers: input.triggers, postAs: input.post_as });
    const files = assembleFiles(
      {
        manifest: {
          path: manifestFile,
          contents: renderManifest(agent, skills.map((s) => s.slug)),
        },
        skills: skills.map((s) => ({
          path: skillPath(s.slug),
          contents: s.body,
          skillId: s.skillId,
        })),
        runner: runner.map((f) => ({ path: runnerPath(f.path), contents: f.contents })),
        workflow: { path: workflowFile, contents: workflowOverride ?? generated },
      },
      memoryPath(),
    );
    return {
      agentId,
      agentVersion: agent.version,
      repoId: repo.id,
      repoFullName: repo.fullName,
      slug,
      files,
    };
  }

  /**
   * One commit on `devdigest/ci`. With an open PR the branch is extended and that
   * PR's URL returned; otherwise the branch is recreated from the head of the
   * default branch GitHub reports and a PR is opened. The default branch itself
   * is never written.
   */
  private async openPr(built: BuiltBundle): Promise<string> {
    const gh = await this.deps.github();
    const ref = splitRepo(built.repoFullName);
    try {
      const info = await gh.getRepository(ref);
      const open = await gh.findOpenPr(ref, CI_BRANCH);
      await gh.commitFiles(ref, {
        branch: CI_BRANCH,
        base: info.default_branch,
        message: CI_PR_TITLE,
        files: built.files.map((f) => ({ path: f.path, contents: f.contents })),
        ...(open ? {} : { resetToBase: true }),
      });
      if (open) return open.url;
      const pr = await gh.openPullRequest(ref, {
        title: CI_PR_TITLE,
        head: CI_BRANCH,
        base: info.default_branch,
        body: CI_PR_BODY,
      });
      return pr.url;
    } catch (err) {
      throw toGithubError(err);
    }
  }
}

/** Only manifest / workflow / skill paths take part in slug-conflict checks. */
function recordedFiles(files: BundleFile[]): CiInstalledFile[] {
  const out: CiInstalledFile[] = [];
  for (const f of files) {
    if (f.kind === 'manifest' || f.kind === 'workflow') out.push({ path: f.path, kind: f.kind });
    else if (f.kind === 'skill') out.push({ path: f.path, kind: 'skill', skill_id: f.skillId! });
  }
  return out;
}
