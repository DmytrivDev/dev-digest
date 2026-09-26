/**
 * Ring 4 — thin wrapper around `McpServer#registerTool` (W2 spike finding, not
 * anticipated by the plan: recorded here rather than in every tool file).
 *
 * `@modelcontextprotocol/sdk@1.30.1`'s `registerTool` infers two generic
 * parameters from the config object against a union type
 * (`ZodRawShapeCompat | AnySchema`) that itself spans BOTH zod's v3 and v4
 * type surfaces (`zod-compat.d.ts`). Checking our concrete raw-shape schemas
 * against that union sends `tsc` into `TS2589: Type instantiation is
 * excessively deep and possibly infinite` — reproduced with a single-field
 * `{ a: z.string() }` shape, so it is not specific to this package's larger
 * schemas. Casting the SDK call's arguments to `any` at this ONE boundary
 * avoids it; every caller of THIS function stays fully typed via `ToolConfig`
 * and the handler's own parameter type — only the SDK call itself is opaque.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ServerNotification, ServerRequest, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { z } from 'zod';

export interface ToolConfig {
  description: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
  outputSchema?: Record<string, z.ZodTypeAny>;
  annotations?: ToolAnnotations;
}

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export type ToolHandler<Args> = (args: Args, extra: ToolExtra) => Promise<CallToolResult>;

export function registerTool<Args = Record<string, never>>(
  server: McpServer,
  name: string,
  config: ToolConfig,
  handler: ToolHandler<Args>,
): void {
  (server.registerTool as (n: string, c: unknown, h: unknown) => unknown)(name, config, handler);
}
