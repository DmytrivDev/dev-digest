import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConventions } from '../app/queries.js';
import { conventionsToText } from '../core/mappers.js';
import { ConventionsResult } from '../core/results.js';
import { REPO_FULL_NAME_MAX_CHARS, REPO_FULL_NAME_REGEX } from '../core/limits.js';
import type { DevDigestApi } from '../ports/devdigest-api.js';
import { PARAM_DESCRIPTIONS, TOOL_DESCRIPTIONS } from './descriptions.js';
import { registerTool } from './register.js';
import { type ErrorLogger, toErrorResult, toToolResult } from './result.js';

const InputShape = {
  repo: z.string().regex(REPO_FULL_NAME_REGEX).max(REPO_FULL_NAME_MAX_CHARS).describe(PARAM_DESCRIPTIONS.repo),
};
const Input = z.object(InputShape);
type Input = z.infer<typeof Input>;

export function registerGetConventions(
  server: McpServer,
  deps: { api: DevDigestApi; webUrl: string; log: ErrorLogger },
): void {
  registerTool<Input>(
    server,
    'get_conventions',
    {
      description: TOOL_DESCRIPTIONS.get_conventions,
      inputSchema: InputShape,
      outputSchema: ConventionsResult.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const result = await getConventions(deps.api, deps.webUrl, args.repo);
        return toToolResult(result, conventionsToText(result));
      } catch (err) {
        return toErrorResult(err, deps.log);
      }
    },
  );
}
