import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runReview } from '../app/run-review.js';
import { findingsResultToText } from '../core/mappers.js';
import { FindingsResult } from '../core/results.js';
import {
  AGENT_NAME_MAX_CHARS,
  POLL_MS,
  REPO_FULL_NAME_MAX_CHARS,
  REPO_FULL_NAME_REGEX,
} from '../core/limits.js';
import type { Clock } from '../ports/clock.js';
import type { DevDigestApi } from '../ports/devdigest-api.js';
import { PARAM_DESCRIPTIONS, TOOL_DESCRIPTIONS } from './descriptions.js';
import { registerTool } from './register.js';
import { type ErrorLogger, toErrorResult, toToolResult } from './result.js';

const InputShape = {
  repo: z.string().regex(REPO_FULL_NAME_REGEX).max(REPO_FULL_NAME_MAX_CHARS).describe(PARAM_DESCRIPTIONS.repo),
  pr: z.number().int().positive(),
  agent: z.string().min(1).max(AGENT_NAME_MAX_CHARS).describe(PARAM_DESCRIPTIONS.agent),
};
const Input = z.object(InputShape);
type Input = z.infer<typeof Input>;

export function registerRunAgentOnPr(
  server: McpServer,
  deps: { api: DevDigestApi; clock: Clock; webUrl: string; runDeadlineMs: number; log: ErrorLogger },
): void {
  registerTool<Input>(
    server,
    'run_agent_on_pr',
    {
      description: TOOL_DESCRIPTIONS.run_agent_on_pr,
      inputSchema: InputShape,
      outputSchema: FindingsResult.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      try {
        const progressToken = extra._meta?.progressToken;
        const onProgress =
          progressToken !== undefined
            ? (elapsedS: number, totalS: number) => {
                void extra.sendNotification({
                  method: 'notifications/progress',
                  params: { progressToken, progress: elapsedS, total: totalS, message: `review running (${elapsedS}s)` },
                } as never);
              }
            : undefined;

        const result = await runReview(
          { repo: args.repo, pr: args.pr, agent: args.agent },
          {
            api: deps.api,
            clock: deps.clock,
            webUrl: deps.webUrl,
            deadlineMs: deps.runDeadlineMs,
            pollMs: POLL_MS,
            signal: extra.signal,
            ...(onProgress !== undefined ? { onProgress } : {}),
          },
        );
        return toToolResult(result, findingsResultToText(result));
      } catch (err) {
        return toErrorResult(err, deps.log);
      }
    },
  );
}
