/**
 * Ring 4 — the MCP envelope (D5's "response envelope"). May import ring 1 and
 * SDK types; nothing else may build a `CallToolResult` by hand.
 *
 * `toErrorResult` takes its logger as a PARAMETER rather than importing
 * `adapters/log.ts` directly — `tools/**` must not import `adapters/**`
 * (onion §D8 ban "tools-no-driven-adapters"), so the concrete logger is
 * injected from the composition root (`server.ts`) the same way `api` and
 * `clock` are.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolError, UNKNOWN_ERROR_TEXT } from '../core/errors.js';

export interface ErrorLogger {
  error(msg: string, detail?: unknown): void;
}

/** A success result: `structuredContent` (matching `outputSchema`) plus a short text duplicate. */
export function toToolResult(structuredContent: Record<string, unknown>, text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
  };
}

/**
 * Every failure path funnels through here. Errors are TOOL results
 * (`isError:true`), never protocol errors — never a stack trace, env value, or
 * raw API body. A `ToolError`'s `message` IS the onward text; anything else is
 * logged to stderr (via the injected `log`) and replaced with the generic
 * unknown-error text.
 */
export function toErrorResult(err: unknown, log: ErrorLogger): CallToolResult {
  if (err instanceof ToolError) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  const detail = err instanceof Error ? err.message : String(err);
  log.error('unhandled tool error', detail);
  return { isError: true, content: [{ type: 'text', text: UNKNOWN_ERROR_TEXT }] };
}
