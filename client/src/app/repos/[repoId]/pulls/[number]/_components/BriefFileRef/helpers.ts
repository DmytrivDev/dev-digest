import { githubBlobUrl } from "@/lib/github-urls";

/**
 * Split a risk reference (`path`, `path:N` or `path:N-M`, the server's validated
 * grammar) into the file and the line to open it on. A range opens on its start.
 */
export function splitRef(ref: string): { path: string; line: number | null } {
  const m = /^(.+?):(\d+)(?:-\d+)?$/.exec(ref);
  if (!m) return { path: ref, line: null };
  return { path: m[1] ?? ref, line: Number(m[2]) };
}

/**
 * github.com blob link for a file that is not part of the PR's diff. `sha` is the
 * brief's `blast.indexed_sha` or, without one, the PR head. Null when the repo's
 * full name or a sha is unknown — there is nothing to link to.
 */
export function blobHref(
  repoFullName: string | null | undefined,
  sha: string | null | undefined,
  path: string,
  line: number | null,
): string | null {
  if (!repoFullName || !sha) return null;
  return githubBlobUrl(repoFullName, sha, path, line ?? undefined);
}
