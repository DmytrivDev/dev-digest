/**
 * stderr-only logging (D7). Nothing in this package may write to stdout except
 * the SDK's own stdio transport — stdout is reserved for JSON-RPC.
 */

function line(level: string, msg: string, detail?: unknown): void {
  const suffix = detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  process.stderr.write(`[devdigest-mcp] ${level}: ${msg}${suffix}\n`);
}

export const log = {
  info: (msg: string, detail?: unknown) => line('info', msg, detail),
  warn: (msg: string, detail?: unknown) => line('warn', msg, detail),
  error: (msg: string, detail?: unknown) => line('error', msg, detail),
};
