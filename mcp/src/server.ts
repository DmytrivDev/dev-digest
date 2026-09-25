/**
 * Composition root (D8). The only place tools are registered. No `instructions`
 * (D6 — session-start token economy).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './adapters/config.js';
import { log } from './adapters/log.js';
import type { DevDigestApi } from './ports/devdigest-api.js';
import type { Clock } from './ports/clock.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

// Not read from package.json: importing JSON here would need a bundler-JSON
// loader on a path esbuild otherwise never touches, for a version string no
// caller reads. Bumped by hand alongside package.json's own version.
const SERVER_VERSION = '0.0.0';

export interface ServerDeps {
  api: DevDigestApi;
  clock: Clock;
  config: Pick<Config, 'webUrl' | 'runDeadlineMs'>;
}

/** Builds an `McpServer` with all tools registered. Nothing else constructs one. */
export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'devdigest', version: SERVER_VERSION });

  registerListAgents(server, { api: deps.api, log });
  registerGetFindings(server, { api: deps.api, webUrl: deps.config.webUrl, log });
  registerGetConventions(server, { api: deps.api, webUrl: deps.config.webUrl, log });
  registerGetBlastRadius(server);
  registerRunAgentOnPr(server, {
    api: deps.api,
    clock: deps.clock,
    webUrl: deps.config.webUrl,
    runDeadlineMs: deps.config.runDeadlineMs,
    log,
  });

  return server;
}
