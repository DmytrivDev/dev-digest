/** Pure path / slug rules for the exported bundle (ring 1 — no I/O). */
import { MEMORY_PATH, RUNNER_DIR } from '../constants.js';

/**
 * kebab-case of a display name. An empty result (a name of only symbols)
 * becomes `<fallbackPrefix>-<first 8 id chars>` so a path is never empty.
 */
export function kebab(name: string, fallbackPrefix: 'agent' | 'skill', id: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  return `${fallbackPrefix}-${id.replace(/-/g, '').slice(0, 8)}`;
}

export const manifestPath = (slug: string): string => `.devdigest/agents/${slug}.yaml`;
export const skillPath = (slug: string): string => `.devdigest/skills/${slug}.md`;
export const workflowFileName = (slug: string): string => `devdigest-review-${slug}.yml`;
export const workflowPath = (slug: string): string => `.github/workflows/${workflowFileName(slug)}`;
export const memoryPath = (): string => MEMORY_PATH;
export const runnerPath = (rel: string): string => `${RUNNER_DIR}/${rel}`;
