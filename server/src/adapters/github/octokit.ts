import { Octokit } from 'octokit';
import { unzipSync } from 'fflate';
import type {
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  PathPullRequest,
  RepositoryInfo,
  WorkflowRunMeta,
  RunArtifactResult,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';

const TIMEOUT = 30_000;
/** A zipped artifact bigger than this is never downloaded. */
const MAX_ZIPPED_ARTIFACT_BYTES = 1_048_576;

function httpStatus(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}

function mapStatus(state: string, merged: boolean | undefined): PrStatus {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/**
 * GitHubClient over Octokit REST — thin. PAT auth (fine-grained).
 * Reads PR list/detail/files/commits/issue; posts reviews; opens PRs.
 */
export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          // Fetch open + recently merged/closed (most-recently-updated first) so
          // the list shows which PRs are merged vs still open — not just open.
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: 0,
            deletions: 0,
            files_count: 0, // not present on the list payload; populated by getPullRequest
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: pr } = await this.octokit.rest.pulls.get({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
          });
          // Every page, not just the first 100: a large PR otherwise hides most of its
          // files from Files changed, Smart Diff and the PR Brief. GitHub itself stops
          // listing at 3,000 files.
          const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const { data: commits } = await this.octokit.rest.pulls.listCommits({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const linkedIssue = await this.resolveLinkedIssue(repo, pr.body ?? '');
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            files_count: pr.changed_files,
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
            body: pr.body,
            files: files.map((f) => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })),
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
              committed_at: c.commit.author?.date,
            })),
            linked_issue: linkedIssue,
          };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** linked issue via regex on PR body (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.createReview({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            body: review.body,
            event: review.event,
            comments: review.comments?.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return { id: String(res.data.id) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** Shape an Octokit review-comment payload into our DTO. */
  private mapReviewComment(c: {
    id: number;
    path: string;
    line?: number | null;
    original_line?: number | null;
    side?: string | null;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    in_reply_to_id?: number;
  }): PrReviewComment {
    return {
      id: c.id,
      path: c.path,
      line: c.line ?? null,
      original_line: c.original_line ?? null,
      side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: c.body,
      user: c.user?.login ?? 'unknown',
      created_at: c.created_at,
      html_url: c.html_url,
      in_reply_to_id: c.in_reply_to_id ?? null,
      // GitHub drops `line` when the comment can no longer be placed on the diff.
      is_outdated: c.line == null,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          return res.data.map((c) => this.mapReviewComment(c));
        })(),
        TIMEOUT,
      ),
    );
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          if (input.inReplyTo != null) {
            const res = await this.octokit.rest.pulls.createReplyForReviewComment({
              owner: repo.owner,
              repo: repo.name,
              pull_number: n,
              comment_id: input.inReplyTo,
              body: input.body,
            });
            return this.mapReviewComment(res.data);
          }
          const res = await this.octokit.rest.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side ?? 'RIGHT',
            body: input.body,
          });
          return this.mapReviewComment(res.data);
        })(),
        TIMEOUT,
      ),
    );
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.create({
            owner: repo.owner,
            repo: repo.name,
            title: payload.title,
            head: payload.head,
            base: payload.base,
            body: payload.body,
          });
          return { url: res.data.html_url };
        })(),
        TIMEOUT,
      ),
    );
  }

  async commitFiles(
    repo: RepoRef,
    payload: CommitFilesPayload,
  ): Promise<{ branch: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const owner = repo.owner;
          const name = repo.name;
          const g = this.octokit.rest.git;

          // The ONLY ref this method ever writes is `heads/${payload.branch}`
          // (never the base / default branch).
          const branchRef = `heads/${payload.branch}`;
          let branchExists = false;
          try {
            await g.getRef({ owner, repo: name, ref: branchRef });
            branchExists = true;
          } catch (err) {
            if (httpStatus(err) !== 404) throw err;
          }

          // Parent commit: the base head on a clean re-install (`resetToBase`) or
          // when the branch is new, else the branch's own head.
          const parentRefName =
            branchExists && !payload.resetToBase ? branchRef : `heads/${payload.base}`;
          const parentRef = await g.getRef({ owner, repo: name, ref: parentRefName });
          const parentSha = parentRef.data.object.sha;

          // New tree layered on the parent's tree (so unrelated files are kept).
          // Each file goes through a blob so large files do not bloat the tree request.
          const parentCommit = await g.getCommit({ owner, repo: name, commit_sha: parentSha });
          const blobs = await Promise.all(
            payload.files.map(async (file) => {
              const blob = await g.createBlob({
                owner,
                repo: name,
                content: file.contents,
                encoding: 'utf-8',
              });
              return { path: file.path, sha: blob.data.sha };
            }),
          );
          const tree = await g.createTree({
            owner,
            repo: name,
            base_tree: parentCommit.data.tree.sha,
            tree: blobs.map((b) => ({
              path: b.path,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: b.sha,
            })),
          });

          const commit = await g.createCommit({
            owner,
            repo: name,
            message: payload.message,
            tree: tree.data.sha,
            parents: [parentSha],
          });

          if (branchExists) {
            await g.updateRef({
              owner,
              repo: name,
              ref: branchRef,
              sha: commit.data.sha,
              force: true,
            });
          } else {
            await g.createRef({
              owner,
              repo: name,
              ref: `refs/${branchRef}`,
              sha: commit.data.sha,
            });
          }
          return { branch: payload.branch };
        })(),
        TIMEOUT,
      ),
    );
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'open',
            head: `${repo.owner}:${branch}`,
            per_page: 1,
          });
          const pr = res.data[0];
          return pr ? { url: pr.html_url } : null;
        })(),
        TIMEOUT,
      ),
    );
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: n }),
        TIMEOUT,
      ),
    );
    return {
      number: res.data.number,
      title: res.data.title,
      body: res.data.body,
      state: res.data.state,
    };
  }

  async currentLogin(): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.users.getAuthenticated(), TIMEOUT),
    );
    return res.data.login;
  }

  async getRepository(repo: RepoRef): Promise<RepositoryInfo> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.repos.get({ owner: repo.owner, repo: repo.name }), TIMEOUT),
    );
    return { id: res.data.id, default_branch: res.data.default_branch };
  }

  async listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    opts: { perPage: number },
  ): Promise<WorkflowRunMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          try {
            const res = await this.octokit.rest.actions.listWorkflowRuns({
              owner: repo.owner,
              repo: repo.name,
              workflow_id: workflowFile,
              per_page: opts.perPage,
            });
            return res.data.workflow_runs.map((r) => ({
              id: r.id,
              run_attempt: r.run_attempt ?? 1,
              status: r.status ?? null,
              conclusion: r.conclusion ?? null,
              head_sha: r.head_sha,
              html_url: r.html_url,
              repository_id: r.repository?.id ?? r.head_repository?.id ?? 0,
              head_repository_id: r.head_repository?.id ?? null,
              pr_numbers: (r.pull_requests ?? []).map((p) => p.number),
              created_at: r.created_at,
              run_started_at: r.run_started_at ?? null,
            }));
          } catch (err) {
            // The workflow file is not on the default branch (yet) — no runs.
            if (httpStatus(err) === 404) return [];
            throw err;
          }
        })(),
        TIMEOUT,
      ),
    );
  }

  async findPullNumberForCommit(repo: RepoRef, sha: string): Promise<number | null> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          owner: repo.owner,
          repo: repo.name,
          commit_sha: sha,
        }),
        TIMEOUT,
      ),
    );
    return res.data[0]?.number ?? null;
  }

  async getPullRequestTitle(repo: RepoRef, n: number): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.pulls.get({ owner: repo.owner, repo: repo.name, pull_number: n }),
        TIMEOUT,
      ),
    );
    return res.data.title;
  }

  async downloadRunArtifact(
    repo: RepoRef,
    runId: number,
    opts: { artifactName: string; fileName: string; maxBytes: number },
  ): Promise<RunArtifactResult> {
    return withRetry(() =>
      withTimeout(
        (async (): Promise<RunArtifactResult> => {
          const list = await this.octokit.rest.actions.listWorkflowRunArtifacts({
            owner: repo.owner,
            repo: repo.name,
            run_id: runId,
            name: opts.artifactName,
          });
          const artifact = list.data.artifacts.find((a) => !a.expired);
          if (!artifact) return { status: 'absent' };
          if (artifact.size_in_bytes > MAX_ZIPPED_ARTIFACT_BYTES) return { status: 'too_large' };

          let data: unknown;
          try {
            const dl = await this.octokit.rest.actions.downloadArtifact({
              owner: repo.owner,
              repo: repo.name,
              artifact_id: artifact.id,
              archive_format: 'zip',
            });
            data = dl.data;
          } catch (err) {
            if (httpStatus(err) === 404 || httpStatus(err) === 410) return { status: 'absent' };
            throw err;
          }
          const bytes =
            data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : ArrayBuffer.isView(data)
                ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
                : null;
          if (!bytes) return { status: 'absent' };

          // The filter runs BEFORE inflation, so an oversized entry is never expanded.
          let tooLarge = false;
          let files: Record<string, Uint8Array>;
          try {
            files = unzipSync(bytes, {
              filter: (entry) => {
                if (entry.name !== opts.fileName) return false;
                if (entry.originalSize > opts.maxBytes) {
                  tooLarge = true;
                  return false;
                }
                return true;
              },
            });
          } catch {
            return { status: 'absent' };
          }
          if (tooLarge) return { status: 'too_large' };
          const entry = files[opts.fileName];
          if (!entry) return { status: 'absent' };
          return { status: 'ok', text: new TextDecoder().decode(entry) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /**
   * Two-step walk: commits touching `path` on the default branch, then the
   * merged PR associated with each commit. 1 + up to `opts.maxCommits` calls
   * (docs/plans/blast-radius.plan.md Key decision 8). De-duplicates by PR
   * number and sorts by `merged_at` desc.
   */
  async listMergedPullsForPath(
    repo: RepoRef,
    path: string,
    opts: { maxCommits: number },
  ): Promise<PathPullRequest[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: commits } = await this.octokit.rest.repos.listCommits({
            owner: repo.owner,
            repo: repo.name,
            path,
            per_page: opts.maxCommits,
          });

          const byNumber = new Map<number, PathPullRequest>();
          for (const commit of commits) {
            const { data: pulls } = await this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
              owner: repo.owner,
              repo: repo.name,
              commit_sha: commit.sha,
            });
            for (const pr of pulls) {
              if (!pr.merged_at) continue;
              if (byNumber.has(pr.number)) continue;
              byNumber.set(pr.number, {
                number: pr.number,
                title: pr.title,
                author: pr.user?.login ?? 'unknown',
                merged_at: pr.merged_at,
              });
            }
          }

          return [...byNumber.values()].sort((a, b) => b.merged_at.localeCompare(a.merged_at));
        })(),
        TIMEOUT,
      ),
    );
  }
}
