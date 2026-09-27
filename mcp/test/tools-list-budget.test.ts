import { describe, expect, it } from 'vitest';
import { TOOLS_LIST_BUDGET_BYTES, DESCRIPTION_MAX_CHARS } from '../src/core/limits.js';
import { TOOL_DESCRIPTIONS } from '../src/tools/descriptions.js';
import { connectedClient } from './harness.js';
import { emptyState, FakeDevDigestApi } from './fake-api.js';
import { FakeClock } from './fake-clock.js';

const WEB_URL = 'http://localhost:3000';

/** Rough sentence count: split on `.`/`!`/`?` followed by whitespace or end. */
function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const matches = trimmed.match(/[^.!?]+[.!?]+(\s|$)/g);
  return matches ? matches.length : 1;
}

describe('D6 — session-start token economy', () => {
  it('exactly 5 tools; tools/list stays under budget; every description matches D9 verbatim', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await connectedClient({
      api,
      clock: new FakeClock(),
      config: { webUrl: WEB_URL, runDeadlineMs: 120_000 },
    });

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);

    const byteSize = Buffer.byteLength(JSON.stringify(tools), 'utf8');
    process.stderr.write(`[tools-list-budget] tools/list size: ${byteSize} bytes (budget ${TOOLS_LIST_BUDGET_BYTES})\n`);
    expect(byteSize).toBeLessThanOrEqual(TOOLS_LIST_BUDGET_BYTES);

    const expectedDescriptions = new Set<string>(Object.values(TOOL_DESCRIPTIONS));
    for (const tool of tools) {
      expect(tool.description).toBeDefined();
      const description = tool.description as string;
      // D9: copied VERBATIM.
      expect(expectedDescriptions.has(description)).toBe(true);
      expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX_CHARS);
      expect(sentenceCount(description)).toBeLessThanOrEqual(2);
      expect(description.toLowerCase()).not.toContain('e.g.');
      // No `title` field (Claude Code displays the name).
      expect((tool as { title?: string }).title).toBeUndefined();
    }

    for (const [name, expected] of Object.entries(TOOL_DESCRIPTIONS) as [string, string][]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.description).toBe(expected);
    }

    await close();
  });

  it('no inputSchema/outputSchema has a root anyOf/oneOf/allOf', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await connectedClient({
      api,
      clock: new FakeClock(),
      config: { webUrl: WEB_URL, runDeadlineMs: 120_000 },
    });
    const { tools } = await client.listTools();
    for (const tool of tools) {
      for (const schema of [tool.inputSchema, tool.outputSchema]) {
        if (!schema) continue;
        expect('anyOf' in schema).toBe(false);
        expect('oneOf' in schema).toBe(false);
        expect('allOf' in schema).toBe(false);
      }
    }
    await close();
  });

  it('initialize returns no instructions, or one <=2 sentences', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await connectedClient({
      api,
      clock: new FakeClock(),
      config: { webUrl: WEB_URL, runDeadlineMs: 120_000 },
    });
    const instructions = client.getInstructions();
    if (instructions !== undefined && instructions.length > 0) {
      expect(sentenceCount(instructions)).toBeLessThanOrEqual(2);
    }
    await close();
  });
});
