import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { REPO_FULL_NAME_MAX_CHARS, REPO_FULL_NAME_REGEX } from '../core/limits.js';
import { PARAM_DESCRIPTIONS, TOOL_DESCRIPTIONS } from './descriptions.js';
import { registerTool } from './register.js';

// FINAL input schema (D5) even though the tool is a stub — this is what the
// real implementation (L04 homework) will accept.
const InputShape = {
  repo: z.string().regex(REPO_FULL_NAME_REGEX).max(REPO_FULL_NAME_MAX_CHARS).describe(PARAM_DESCRIPTIONS.repo),
  pr: z.number().int().positive(),
};
const Input = z.object(InputShape);
type Input = z.infer<typeof Input>;

const NOT_IMPLEMENTED_TEXT =
  'get_blast_radius is not implemented yet — coming in L04 homework. Use run_agent_on_pr / get_findings meanwhile.';

export function registerGetBlastRadius(server: McpServer): void {
  registerTool<Input>(
    server,
    'get_blast_radius',
    {
      description: TOOL_DESCRIPTIONS.get_blast_radius,
      inputSchema: InputShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      return { isError: true, content: [{ type: 'text', text: NOT_IMPLEMENTED_TEXT }] };
    },
  );
}
