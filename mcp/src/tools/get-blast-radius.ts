import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlastRadius } from '../app/queries.js';
import { blastResultToText } from '../core/mappers.js';
import { BlastRadiusResult } from '../core/results.js';
import { REPO_FULL_NAME_MAX_CHARS, REPO_FULL_NAME_REGEX } from '../core/limits.js';
import type { DevDigestApi } from '../ports/devdigest-api.js';
import { PARAM_DESCRIPTIONS, TOOL_DESCRIPTIONS } from './descriptions.js';
import { registerTool } from './register.js';
import { type ErrorLogger, toErrorResult, toToolResult } from './result.js';

const InputShape = {
  repo: z.string().regex(REPO_FULL_NAME_REGEX).max(REPO_FULL_NAME_MAX_CHARS).describe(PARAM_DESCRIPTIONS.repo),
  pr: z.number().int().positive(),
};
const Input = z.object(InputShape);
type Input = z.infer<typeof Input>;

/**
 * What a PR can affect, read straight from the DevDigest code index: symbols
 * declared in the changed files, their callers (`file:line`), and the HTTP
 * endpoints/crons behind them. No LLM call, no re-parse — one HTTP call to
 * `GET /pulls/:id/blast` (`app/queries.ts`'s `getBlastRadius`).
 */
export function registerGetBlastRadius(
  server: McpServer,
  deps: { api: DevDigestApi; webUrl: string; log: ErrorLogger },
): void {
  registerTool<Input>(
    server,
    'get_blast_radius',
    {
      description: TOOL_DESCRIPTIONS.get_blast_radius,
      inputSchema: InputShape,
      outputSchema: BlastRadiusResult.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const result = await getBlastRadius(deps.api, deps.webUrl, args.repo, args.pr);
        return toToolResult(result, blastResultToText(result));
      } catch (err) {
        return toErrorResult(err, deps.log);
      }
    },
  );
}
