/**
 * Ring 4 (driving adapter) — thin: parse (nothing here), call ONE app
 * function, map the result. Onion §D8 ban-1 analogue: no orchestration here.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listAgents } from '../app/queries.js';
import { agentListToText } from '../core/mappers.js';
import { AgentListOutput } from '../core/results.js';
import type { DevDigestApi } from '../ports/devdigest-api.js';
import { TOOL_DESCRIPTIONS } from './descriptions.js';
import { registerTool } from './register.js';
import { type ErrorLogger, toErrorResult, toToolResult } from './result.js';

export function registerListAgents(server: McpServer, deps: { api: DevDigestApi; log: ErrorLogger }): void {
  registerTool(
    server,
    'list_agents',
    {
      description: TOOL_DESCRIPTIONS.list_agents,
      outputSchema: AgentListOutput.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const result = await listAgents(deps.api);
        return toToolResult(result, agentListToText(result));
      } catch (err) {
        return toErrorResult(err, deps.log);
      }
    },
  );
}
