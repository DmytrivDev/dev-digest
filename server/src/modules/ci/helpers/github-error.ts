import { AppError } from '../../../platform/errors.js';

/**
 * Map whatever a GitHub port call threw to the `github_error` envelope (502).
 * Duck-typed on purpose: ring 3 never imports Octokit's error classes. An
 * AppError (e.g. a missing token) keeps its own code and status.
 */
export function toGithubError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    status?: unknown;
    message?: unknown;
  };
  const status = typeof e.status === 'number' ? e.status : null;
  const message = typeof e.message === 'string' && e.message ? e.message : 'GitHub request failed';
  return new AppError('github_error', message, 502, { status, message });
}
