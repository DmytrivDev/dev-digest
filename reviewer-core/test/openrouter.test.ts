import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Capture what OpenRouterProvider sends: the SDK client is built inside the constructor,
// so the module is mocked rather than injected.
const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const { OpenRouterProvider } = await import('../src/llm/openrouter.js');

const Answer = z.object({ ok: z.boolean() });

function reply() {
  return {
    choices: [{ message: { content: '{"ok":true}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0001 },
  };
}

describe('OpenRouterProvider request body', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue(reply());
  });

  const base = {
    model: 'deepseek/deepseek-v4-flash',
    schema: Answer,
    schemaName: 'Answer',
    messages: [{ role: 'user' as const, content: 'hi' }],
    maxRetries: 0,
  };

  it('asks OpenRouter to skip reasoning when the request says so', async () => {
    const provider = new OpenRouterProvider('k');
    await provider.completeStructured({ ...base, disableReasoning: true });
    expect(create.mock.calls[0]![0].reasoning).toEqual({ enabled: false });
  });

  it('sends no reasoning field by default', async () => {
    const provider = new OpenRouterProvider('k');
    const res = await provider.completeStructured(base);
    expect(create.mock.calls[0]![0]).not.toHaveProperty('reasoning');
    expect(res.data).toEqual({ ok: true });
  });
});
