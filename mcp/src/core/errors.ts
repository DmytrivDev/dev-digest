/**
 * Ring 1 — pure error type + onward-text builders (D5, D8). `ToolError` is the
 * ONE type every tool maps to an `isError` result (`tools/result.ts`, ring 4).
 * Never carries a stack trace or an env value — `text` is what a model sees.
 */

export type ToolErrorKind =
  | 'api_unreachable'
  | 'not_found'
  | 'rate_limited'
  | 'api_error'
  | 'bad_response'
  | 'not_implemented'
  | 'unknown';

export class ToolError extends Error {
  readonly kind: ToolErrorKind;

  constructor(kind: ToolErrorKind, text: string) {
    super(text);
    this.name = 'ToolError';
    this.kind = kind;
  }
}

/** `DevDigest API not reachable at <url> — start it with ./scripts/dev.sh, then retry.` */
export function apiUnreachableText(url: string): string {
  return `DevDigest API not reachable at ${url} — start it with ./scripts/dev.sh, then retry.`;
}

/** `DevDigest rate limit hit — wait a minute (or call get_findings for a running review).` */
export function rateLimitedText(): string {
  return 'DevDigest rate limit hit — wait a minute (or call get_findings for a running review).';
}

/** `DevDigest API error <status> <code>: <message ≤200ch>` */
export function apiErrorText(status: number, code: string, message: string, clip: number): string {
  const clipped = message.length > clip ? `${message.slice(0, clip)}…` : message;
  return `DevDigest API error ${status} ${code}: ${clipped}`;
}

/** `DevDigest API returned an unexpected shape for <endpoint> — mcp and server are out of sync; rebuild mcp (pnpm build)` */
export function badResponseText(endpoint: string): string {
  return `DevDigest API returned an unexpected shape for ${endpoint} — mcp and server are out of sync; rebuild mcp (pnpm build)`;
}

/** Generic fallback for an unclassified `Error` — detail goes to stderr, never into the tool text. */
export const UNKNOWN_ERROR_TEXT = 'Unexpected error in devdigest-mcp — see the MCP server log (stderr)';
