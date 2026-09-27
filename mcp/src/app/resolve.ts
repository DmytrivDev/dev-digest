/**
 * Ring 3 — D1: `owner/name` → repo, `repo + #N` → PR. Uses the port only, no
 * HTTP/SDK import (onion §D8 app-no-outward).
 */
import type { PrMeta, Repo } from '@devdigest/shared';
import { ToolError } from '../core/errors.js';
import type { DevDigestApi } from '../ports/devdigest-api.js';

const MAX_LISTED_REPOS = 5;

/**
 * Case-insensitive `full_name` match (D1 step 1). A miss means the repo is not
 * imported — names up to 5 imported repos so the model can suggest the right one.
 */
export async function resolveRepo(api: DevDigestApi, webUrl: string, repoFullName: string): Promise<Repo> {
  const repos = await api.listRepos();
  const needle = repoFullName.toLowerCase();
  const match = repos.find((r) => r.full_name.toLowerCase() === needle);
  if (match) return match;

  const known = repos.slice(0, MAX_LISTED_REPOS).map((r) => r.full_name);
  const knownText = known.length > 0 ? ` Imported repos: ${known.join(', ')}.` : '';
  throw new ToolError(
    'not_found',
    `Repository "${repoFullName}" is not imported in DevDigest.${knownText} Import it in DevDigest (${webUrl}) first.`,
  );
}

/**
 * `number` → `PrMeta` for an already-resolved repo (D1 step 2). This call syncs
 * from GitHub when a token exists, so it doubles as the "import PRs" step.
 */
export async function resolvePr(
  api: DevDigestApi,
  repoId: string,
  repoFullName: string,
  number: number,
): Promise<PrMeta> {
  const pulls = await api.listPulls(repoId);
  const match = pulls.find((p) => p.number === number);
  if (match) return match;
  throw new ToolError(
    'not_found',
    `PR #${number} not found in ${repoFullName} — open the repo's PR list in DevDigest to sync pull requests, then retry.`,
  );
}

/** D1 combined: `owner/name` + `#N` → the PR's `id` and its resolved `Repo`. */
export async function resolveRepoAndPr(
  api: DevDigestApi,
  webUrl: string,
  repoFullName: string,
  number: number,
): Promise<{ repo: Repo; pr: PrMeta }> {
  const repo = await resolveRepo(api, webUrl, repoFullName);
  const pr = await resolvePr(api, repo.id, repo.full_name, number);
  return { repo, pr };
}
