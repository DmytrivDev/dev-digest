import { beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distEntry = path.join(root, 'dist', 'index.js');

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: unknown;
}

function send(child: import('node:child_process').ChildProcessWithoutNullStreams, msg: unknown): void {
  child.stdin.write(`${JSON.stringify(msg)}\n`);
}

beforeAll(async () => {
  await build();
}, 30_000);

describe('D7 — stdout hygiene & safety', () => {
  it('stdout carries ONLY JSON-RPC lines; list_agents errors naming the closed port; diagnostics go to stderr', async () => {
    const child = spawn(process.execPath, [distEntry], {
      env: { ...process.env, DEVDIGEST_API_URL: 'http://127.0.0.1:1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    send(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await new Promise((resolve) => setTimeout(resolve, 200));
    send(child, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_agents', arguments: {} } });
    await new Promise((resolve) => setTimeout(resolve, 500));

    child.kill();

    const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    const messages: JsonRpcMessage[] = lines.map((line) => {
      const parsed = JSON.parse(line) as JsonRpcMessage;
      expect(parsed.jsonrpc).toBe('2.0');
      return parsed;
    });

    const listAgentsResponse = messages.find((m) => m.id === 3);
    expect(listAgentsResponse).toBeDefined();
    const result = listAgentsResponse?.result as { isError?: boolean; content?: { type: string; text: string }[] } | undefined;
    expect(result?.isError).toBe(true);
    const text = result?.content?.[0]?.text ?? '';
    expect(text).toContain('127.0.0.1:1');

    // Something was logged (at minimum the "connected" info line) — and it went to stderr, not stdout.
    expect(stderr.length).toBeGreaterThan(0);
  }, 15_000);

  it('no file under src/ writes to stdout directly (console.log/console.info/process.stdout)', () => {
    const files = listTsFiles(path.join(root, 'src'));
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (content.includes('console.log(') || content.includes('console.info(') || content.includes('process.stdout')) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}
