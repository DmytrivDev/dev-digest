/**
 * Project Context use cases: the document list of a repository's local clone,
 * one document's text, and the documents attached to an agent / a skill.
 *
 * The shape of the class is load-bearing, same reasoning as `IntentService`:
 * it takes the PORTS it uses (the repository and `GitClient`), never the DI
 * `Container`, and imports no concrete adapter (ban 2). It deliberately has NO
 * GitHub dependency — the list is built from the local clone alone (AC-9) —
 * and never fetches, syncs or clones (AC-75).
 *
 * Every public method resolves the owning repo / agent / skill INSIDE the
 * workspace before reading anything; `undefined` is how a route learns to 404
 * without revealing whether the id exists elsewhere (AC-69).
 */
import type {
  AgentContextDocs,
  ContextAttachment,
  ContextDoc,
  ContextDocContent,
  ContextDocList,
  GitClient,
  RepoRef,
  SaveContextDocsInput,
  SkillContextDocs,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import {
  ERR_DOC_NOT_FOUND,
  ERR_INVALID_PATH,
  ERR_REPO_NOT_CLONED,
  ERR_UNREADABLE,
  EXCLUDED_DIRS,
} from './constants.js';
import {
  approxTokens,
  categoryOf,
  decodeDoc,
  orderRunDocs,
  pcBaseMismatchLine,
  pcCheckoutLine,
  pcNotClonedLine,
  pcSkipLine,
  pcSummaryLine,
  selectDocs,
  selectInherited,
  splitPath,
  validateDocPath,
} from './helpers.js';
import type { ContextRepoRef, ProjectContextRepository } from './repository.js';

export interface ProjectContextDeps {
  repo: ProjectContextRepository;
  git: GitClient;
}

/** One document handed to the review engine (structurally the engine's `ProjectContextDoc`). */
export interface RunContextDoc {
  path: string;
  content: string;
}

/** What `resolveForRun` hands the run executor: the documents to inject and the Run Log lines. */
export interface RunContext {
  docs: RunContextDoc[];
  lines: string[];
}

export interface ResolveForRunInput {
  workspaceId: string;
  agentId: string;
  repo: ContextRepoRef;
  /** The PR's base branch name — compared with the clone's checked-out branch (AC-74). */
  prBase: string;
}

/** Outcome of reading one file of the clone as a document. */
type DocRead =
  | { kind: 'ok'; text: string }
  | { kind: 'missing' }
  | { kind: 'outside_clone' }
  | { kind: 'unreadable' };

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

function repoRefOf(repo: ContextRepoRef): RepoRef {
  return { owner: repo.owner, name: repo.name };
}

function notCloned(repo: ContextRepoRef): AppError {
  return new AppError(
    ERR_REPO_NOT_CLONED,
    `Repository ${repo.owner}/${repo.name} has no local clone`,
    409,
  );
}

export class ProjectContextService {
  constructor(private deps: ProjectContextDeps) {}

  // ------------------------------------------------------------ document list

  /** GET /repos/:id/context. `undefined` when the repo is not in the workspace. */
  async listDocs(workspaceId: string, repoId: string): Promise<ContextDocList | undefined> {
    const repo = await this.deps.repo.repoInWorkspace(workspaceId, repoId);
    if (!repo) return undefined;
    if (!repo.clonePath) throw notCloned(repo);

    const ref = repoRefOf(repo);
    let files: string[];
    let branch: string;
    try {
      files = await this.deps.git.listFiles(ref, { excludeDirs: EXCLUDED_DIRS });
      branch = await this.deps.git.currentBranch(ref);
    } catch (err) {
      if (errorCode(err) === 'ENOENT') throw notCloned(repo);
      throw err;
    }

    const { docs: paths, total, truncated } = selectDocs(files);
    // A document that cannot be decoded still lists, with 0 tokens (A-4).
    const docs: ContextDoc[] = await Promise.all(
      paths.map(async (path) => {
        const read = await this.readText(ref, path);
        return {
          path,
          ...splitPath(path),
          category: categoryOf(path),
          approx_tokens: read.kind === 'ok' ? approxTokens(read.text) : 0,
        };
      }),
    );
    return { repo_id: repo.id, branch, total, truncated, docs };
  }

  // ------------------------------------------------------------ one document

  /** GET /repos/:id/context/doc?path=. `undefined` when the repo is not in the workspace. */
  async readDoc(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<ContextDocContent | undefined> {
    const repo = await this.deps.repo.repoInWorkspace(workspaceId, repoId);
    if (!repo) return undefined;
    if (!validateDocPath(path)) {
      throw new AppError(ERR_INVALID_PATH, 'Not a valid document path', 422);
    }
    if (!repo.clonePath) throw notCloned(repo);

    const ref = repoRefOf(repo);
    const read = await this.readText(ref, path);
    if (read.kind === 'missing') {
      // `ENOENT` is also what a clone that is gone looks like; tell them apart.
      if (await this.cloneIsGone(ref)) throw notCloned(repo);
      throw new AppError(ERR_DOC_NOT_FOUND, 'Document not found', 404);
    }
    if (read.kind === 'outside_clone') {
      throw new AppError(ERR_DOC_NOT_FOUND, 'Document not found', 404);
    }
    if (read.kind === 'unreadable') {
      throw new AppError(ERR_UNREADABLE, 'Document is not readable text', 422);
    }
    return {
      path,
      content: read.text,
      used_by_agents: await this.deps.repo.usedByAgents(workspaceId, repo.id, path),
    };
  }

  // ------------------------------------------------------------ attachments

  /** GET /agents/:id/context-docs. `undefined` when the agent or the repo is not in the workspace. */
  async getAgentDocs(
    workspaceId: string,
    agentId: string,
    repoId: string,
  ): Promise<AgentContextDocs | undefined> {
    const resolved = await this.resolveOwner(workspaceId, repoId, () =>
      this.deps.repo.agentInWorkspace(workspaceId, agentId),
    );
    if (!resolved) return undefined;
    const { repo } = resolved;

    const own = await this.deps.repo.agentPaths(agentId, repo.id);
    const linked = await this.deps.repo.linkedSkillPaths(agentId, repo.id);
    const inherited = selectInherited(own, linked);

    const state = this.attachmentReader(repo);
    return {
      repo_id: repo.id,
      attached: await Promise.all(own.map((p) => state(p))),
      inherited: await Promise.all(
        inherited.map(async (i) => ({ ...(await state(i.path)), ...i })),
      ),
    };
  }

  /** POST /agents/:id/context-docs — replaces the agent's whole ordered set for one repo. */
  async saveAgentDocs(
    workspaceId: string,
    agentId: string,
    input: SaveContextDocsInput,
  ): Promise<AgentContextDocs | undefined> {
    const resolved = await this.resolveOwner(workspaceId, input.repo_id, () =>
      this.deps.repo.agentInWorkspace(workspaceId, agentId),
    );
    if (!resolved) return undefined;
    this.assertSavablePaths(input.paths);
    await this.deps.repo.replaceAgentPaths(agentId, resolved.repo.id, input.paths);
    return this.getAgentDocs(workspaceId, agentId, resolved.repo.id);
  }

  /** GET /skills/:id/context-docs. */
  async getSkillDocs(
    workspaceId: string,
    skillId: string,
    repoId: string,
  ): Promise<SkillContextDocs | undefined> {
    const resolved = await this.resolveOwner(workspaceId, repoId, () =>
      this.deps.repo.skillInWorkspace(workspaceId, skillId),
    );
    if (!resolved) return undefined;
    const { repo } = resolved;

    const own = await this.deps.repo.skillPaths(skillId, repo.id);
    const state = this.attachmentReader(repo);
    return { repo_id: repo.id, attached: await Promise.all(own.map((p) => state(p))) };
  }

  /** POST /skills/:id/context-docs. */
  async saveSkillDocs(
    workspaceId: string,
    skillId: string,
    input: SaveContextDocsInput,
  ): Promise<SkillContextDocs | undefined> {
    const resolved = await this.resolveOwner(workspaceId, input.repo_id, () =>
      this.deps.repo.skillInWorkspace(workspaceId, skillId),
    );
    if (!resolved) return undefined;
    this.assertSavablePaths(input.paths);
    await this.deps.repo.replaceSkillPaths(skillId, resolved.repo.id, input.paths);
    return this.getSkillDocs(workspaceId, skillId, resolved.repo.id);
  }

  // ------------------------------------------------------------ run-time injection

  /**
   * The documents one agent run injects, plus the Run Log lines that explain
   * them (AC-46..AC-61, AC-74). Best-effort by contract: NEVER throws — any
   * failure degrades to "nothing injected" with one explanatory line (AC-60).
   *
   * Reads only: no `sync`, `clone` or `fetch*` (AC-75), so what a run sees is
   * the clone's CURRENT checkout whatever the PR's base is (AC-50); the PR base
   * is compared with the clone's checked-out branch, never `repos.default_branch`
   * (AC-74). An agent with nothing attached touches nothing and logs nothing (A-1).
   */
  async resolveForRun(input: ResolveForRunInput): Promise<RunContext> {
    try {
      return await this.resolveRunDocs(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { docs: [], lines: [`project context: skipped — ${message}`] };
    }
  }

  private async resolveRunDocs(input: ResolveForRunInput): Promise<RunContext> {
    const { workspaceId, agentId, repo, prBase } = input;

    // The link tables carry no workspace id: resolve the agent inside the
    // workspace before touching them (AC-69).
    if (!(await this.deps.repo.agentInWorkspace(workspaceId, agentId))) {
      return { docs: [], lines: [] };
    }
    // Attachments of the PR's repository only (AC-46).
    const [own, linked] = await Promise.all([
      this.deps.repo.agentPaths(agentId, repo.id),
      this.deps.repo.linkedSkillPaths(agentId, repo.id),
    ]);
    const paths = orderRunDocs(own, linked);
    if (paths.length === 0) return { docs: [], lines: [] };

    const notClonedResult: RunContext = {
      docs: [],
      lines: [pcNotClonedLine(), pcSummaryLine(0, paths.length)],
    };
    if (!repo.clonePath) return notClonedResult;

    const ref = repoRefOf(repo);
    let branch: string | undefined;
    try {
      branch = await this.deps.git.currentBranch(ref);
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return notClonedResult;
      // Branch unknown (A-6): keep reading, make no AC-74 comparison.
    }
    let sha = 'unknown';
    try {
      sha = await this.deps.git.currentHead(ref);
    } catch {
      /* the checkout line carries `unknown` (A-6) */
    }

    const lines = [pcCheckoutLine(branch ?? 'unknown', sha)];
    if (branch !== undefined && prBase !== branch) lines.push(pcBaseMismatchLine(prBase, branch));

    const docs: RunContextDoc[] = [];
    let skipped = 0;
    for (const path of paths) {
      const read = await this.readText(ref, path);
      if (read.kind === 'ok') {
        docs.push({ path, content: read.text });
      } else {
        skipped += 1;
        lines.push(pcSkipLine(path, read.kind));
      }
    }
    lines.push(pcSummaryLine(docs.length, skipped));
    return { docs, lines };
  }

  // ------------------------------------------------------------ internals

  /**
   * Resolve the repo AND the owner (agent / skill) inside the workspace; either
   * missing yields `undefined`, so the route 404s identically for both.
   */
  private async resolveOwner(
    workspaceId: string,
    repoId: string,
    findOwner: () => Promise<unknown>,
  ): Promise<{ repo: ContextRepoRef } | undefined> {
    const [repo, owner] = await Promise.all([
      this.deps.repo.repoInWorkspace(workspaceId, repoId),
      findOwner(),
    ]);
    return repo && owner ? { repo } : undefined;
  }

  /** Every path is validated BEFORE any write, so a bad save leaves the set untouched (AC-32, AC-70). */
  private assertSavablePaths(paths: readonly string[]): void {
    if (!paths.every(validateDocPath)) {
      throw new AppError(ERR_INVALID_PATH, 'One or more paths are not valid document paths', 422);
    }
  }

  /**
   * Presence + size of one attached path, memoised per request (a path may be
   * both direct and inherited). Absent clone / file / escape → `present: false`;
   * undecodable → `present: true` with no estimate (A-4).
   */
  private attachmentReader(repo: ContextRepoRef): (path: string) => Promise<ContextAttachment> {
    const ref = repoRefOf(repo);
    const cache = new Map<string, Promise<ContextAttachment>>();
    return (path) => {
      let hit = cache.get(path);
      if (!hit) {
        hit = (async (): Promise<ContextAttachment> => {
          if (!repo.clonePath) return { path, present: false, approx_tokens: null };
          const read = await this.readText(ref, path);
          if (read.kind === 'missing' || read.kind === 'outside_clone') {
            return { path, present: false, approx_tokens: null };
          }
          return {
            path,
            present: true,
            approx_tokens: read.kind === 'ok' ? approxTokens(read.text) : null,
          };
        })();
        cache.set(path, hit);
      }
      return hit;
    };
  }

  /** Read one file of the clone as text, classifying every failure instead of throwing. */
  private async readText(ref: RepoRef, path: string): Promise<DocRead> {
    try {
      const decoded = decodeDoc(await this.deps.git.readFileBytes(ref, path));
      return decoded.ok ? { kind: 'ok', text: decoded.text } : { kind: 'unreadable' };
    } catch (err) {
      const code = errorCode(err);
      if (code === 'ENOENT') return { kind: 'missing' };
      if (code === 'EOUTSIDECLONE') return { kind: 'outside_clone' };
      return { kind: 'unreadable' };
    }
  }

  /** True when the clone directory itself does not exist. */
  private async cloneIsGone(ref: RepoRef): Promise<boolean> {
    try {
      await this.deps.git.currentBranch(ref);
      return false;
    } catch (err) {
      return errorCode(err) === 'ENOENT';
    }
  }
}
