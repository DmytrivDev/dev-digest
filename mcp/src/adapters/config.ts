/**
 * Ring 4 (driven adapter) — reads `process.env` once at boot and produces a
 * validated, immutable `Config`. Security-sensitive: this is the ONE place
 * `process.env` is read (security skill, trust-boundary rule).
 */
import { z } from 'zod';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_RUN_DEADLINE_MS,
  RUN_DEADLINE_MAX_MS,
  RUN_DEADLINE_MIN_MS,
  SYNC_FETCH_TIMEOUT_MS,
} from '../core/limits.js';

/** A boot-time config problem — never a stack trace on stdout, always fatal. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface Config {
  apiUrl: string;
  webUrl: string;
  runDeadlineMs: number;
  fetchTimeoutMs: number;
  syncFetchTimeoutMs: number;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const EnvSchema = z.object({
  DEVDIGEST_API_URL: z.string().url().default('http://localhost:3001'),
  DEVDIGEST_WEB_URL: z.string().url().default('http://localhost:3000'),
  DEVDIGEST_MCP_RUN_DEADLINE_MS: z.coerce.number().int().positive().default(DEFAULT_RUN_DEADLINE_MS),
});

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * Rejects a non-loopback `DEVDIGEST_API_URL` — this package only ever talks to
 * a LOCAL DevDigest instance, and a remote host would ship repo/finding text
 * (D5's "untrusted content") to an address nobody chose (D7).
 */
function assertLoopback(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ConfigError(`DEVDIGEST_API_URL is not a valid URL: "${rawUrl}"`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new ConfigError(
      `DEVDIGEST_API_URL must point at localhost/127.0.0.1/::1, got "${parsed.hostname}" — refusing to talk to a non-loopback host.`,
    );
  }
}

/** Parses and validates env once at boot. Throws `ConfigError` on any problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  assertLoopback(parsed.data.DEVDIGEST_API_URL);

  return {
    apiUrl: parsed.data.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    webUrl: parsed.data.DEVDIGEST_WEB_URL.replace(/\/+$/, ''),
    runDeadlineMs: clamp(parsed.data.DEVDIGEST_MCP_RUN_DEADLINE_MS, RUN_DEADLINE_MIN_MS, RUN_DEADLINE_MAX_MS),
    fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    syncFetchTimeoutMs: SYNC_FETCH_TIMEOUT_MS,
  };
}
