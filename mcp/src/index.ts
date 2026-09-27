/**
 * Entry point (ring 4). The ONLY file that touches `StdioServerTransport`.
 * Never imported by tests — tests import `server.ts` directly (D7); this
 * sidesteps the `import.meta.url` vs `argv[1]` "am I main" trap entirely.
 *
 * Loads config → builds the real adapters → `createServer` → connects stdio.
 * Any fatal problem is written to stderr and exits 1 — nothing may reach stdout
 * except the SDK transport itself.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, ConfigError } from './adapters/config.js';
import { SystemClock } from './adapters/system-clock.js';
import { HttpDevDigestApi } from './adapters/http-client.js';
import { log } from './adapters/log.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    const message = err instanceof ConfigError ? err.message : String(err);
    log.error(message);
    process.exit(1);
  }

  const api = new HttpDevDigestApi(config);
  const clock = new SystemClock();
  const server = createServer({ api, clock, config });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`devdigest-mcp connected — API ${config.apiUrl}`);
}

main().catch((err) => {
  log.error('fatal error during startup', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
