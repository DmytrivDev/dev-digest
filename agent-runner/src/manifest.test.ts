import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadManifestFromEnv, loadAgentManifest } from './manifest.js';
import { RunnerError } from './errors.js';

const VALID_MANIFEST_YAML = `
name: "Security Reviewer"
provider: "openrouter"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review this PR for security issues."
skills: ["security-basics"]
strategy: "auto"
ci_fail_on: "critical"
agent_version: 3
`;

describe('manifest loading + validation (AC-20)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-manifest-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads and validates a well-formed manifest against the AgentManifest schema', () => {
    writeFileSync(path.join(dir, 'agents', 'security-reviewer.yaml'), VALID_MANIFEST_YAML);

    const manifest = loadManifestFromEnv('agents/security-reviewer.yaml', dir);

    expect(manifest.name).toBe('Security Reviewer');
    expect(manifest.model).toBe('deepseek/deepseek-v4-flash');
    expect(manifest.skills).toEqual(['security-basics']);
    expect(manifest.ci_fail_on).toBe('critical');
  });

  it('fails clearly when the manifest fails schema validation (bad ci_fail_on)', () => {
    writeFileSync(
      path.join(dir, 'agents', 'bad.yaml'),
      `
name: "Bad Agent"
model: "gpt-4.1"
system_prompt: "review"
ci_fail_on: "sometimes"
`,
    );

    expect(() => loadManifestFromEnv('agents/bad.yaml', dir)).toThrow(RunnerError);
    expect(() => loadManifestFromEnv('agents/bad.yaml', dir)).toThrow(/failed validation/i);
  });

  it('fails clearly when the manifest is missing required fields', () => {
    writeFileSync(path.join(dir, 'agents', 'incomplete.yaml'), 'name: "No model or prompt"\n');
    expect(() => loadManifestFromEnv('agents/incomplete.yaml', dir)).toThrow(RunnerError);
  });

  it('fails clearly when DEVDIGEST_MANIFEST is unset or empty (AC-27)', () => {
    expect(() => loadManifestFromEnv(undefined, dir)).toThrow(/DEVDIGEST_MANIFEST is required/);
    expect(() => loadManifestFromEnv('', dir)).toThrow(RunnerError);
  });

  it('fails clearly when the named manifest file does not exist', () => {
    expect(() => loadManifestFromEnv('agents/missing.yaml', dir)).toThrow(/Cannot read agent manifest/);
  });

  it('fails clearly on malformed YAML', () => {
    writeFileSync(path.join(dir, 'agents', 'broken.yaml'), 'name: "unterminated\n  bad: [1, 2\n');
    const manifestPath = path.join(dir, 'agents', 'broken.yaml');
    expect(() => loadAgentManifest(manifestPath)).toThrow(RunnerError);
  });
});
