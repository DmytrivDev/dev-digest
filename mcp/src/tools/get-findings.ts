import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getRunFindings } from '../app/queries.js';
import { findingsResultToText } from '../core/mappers.js';
import { FindingsResult } from '../core/results.js';
import type { DevDigestApi } from '../ports/devdigest-api.js';
import { PARAM_DESCRIPTIONS, TOOL_DESCRIPTIONS } from './descriptions.js';
import { registerTool } from './register.js';
import { type ErrorLogger, toErrorResult, toToolResult } from './result.js';

const InputShape = {
  run_id: z.string().uuid().describe(PARAM_DESCRIPTIONS.run_id),
};
const Input = z.object(InputShape);
type Input = z.infer<typeof Input>;

export function registerGetFindings(
  server: McpServer,
  deps: { api: DevDigestApi; webUrl: string; log: ErrorLogger },
): void {
  registerTool<Input>(
    server,
    'get_findings',
    {
      description: TOOL_DESCRIPTIONS.get_findings,
      inputSchema: InputShape,
      outputSchema: FindingsResult.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const result = await getRunFindings(deps.api, deps.webUrl, args.run_id);
        return toToolResult(result, findingsResultToText(result));
      } catch (err) {
        return toErrorResult(err, deps.log);
      }
    },
  );
}
