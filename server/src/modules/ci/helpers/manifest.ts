/** Pure manifest rendering (ring 1 — no I/O). */
import { stringify } from 'yaml';
import { AgentManifest } from '@devdigest/shared';

export interface ManifestAgent {
  name: string;
  model: string;
  systemPrompt: string;
  strategy: 'single-pass' | 'map-reduce' | 'auto';
  ciFailOn: 'never' | 'critical' | 'warning' | 'any';
  version: number;
}

/**
 * The `.devdigest/agents/<slug>.yaml` text. Built through the shared
 * `AgentManifest` schema, so what we write is by construction what the runner
 * accepts. CI runs through OpenRouter only, hence the fixed provider.
 */
export function renderManifest(agent: ManifestAgent, skillSlugs: string[]): string {
  const manifest = AgentManifest.parse({
    name: agent.name,
    provider: 'openrouter',
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
    agent_version: agent.version,
  });
  return stringify(manifest, { lineWidth: 0 });
}
