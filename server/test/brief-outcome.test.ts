import { describe, expect, it } from 'vitest';
import {
  BriefOutputInvalidError,
  admitGenerate,
  classifyModelError,
  isStale,
  logLine,
  truncatedSources,
} from '../src/modules/brief/helpers/outcome.js';
import { ConfigError, ExternalServiceError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';

const CTX = { provider: 'openrouter', model: 'openai/gpt-4.1' };

describe('classifyModelError (AC-86 … AC-89, AC-70)', () => {
  it('a missing key -> 422 llm_not_configured naming the provider and Settings → Models', () => {
    const out = classifyModelError(new ConfigError('no key'), CTX);
    expect(out).toMatchObject({ status: 422, code: 'llm_not_configured' });
    expect(out.message).toContain('openrouter');
    expect(out.message).toContain('Settings → Models');
  });

  it('a TimeoutError -> 502 llm_timeout', () => {
    expect(classifyModelError(new TimeoutError(120_000), CTX)).toMatchObject({
      status: 502,
      code: 'llm_timeout',
    });
  });

  it('a provider schema failure -> 502 llm_invalid_output', () => {
    const adapter = new ExternalServiceError('OpenAI structured output failed schema validation');
    expect(classifyModelError(adapter, CTX)).toMatchObject({ status: 502, code: 'llm_invalid_output' });
    expect(classifyModelError(new Error('OpenRouter structured output failed schema validation for x'), CTX).code).toBe(
      'llm_invalid_output',
    );
  });

  it('our own re-parse failure -> 502 llm_invalid_output', () => {
    expect(classifyModelError(new BriefOutputInvalidError(), CTX)).toMatchObject({
      status: 502,
      code: 'llm_invalid_output',
    });
  });

  it('a provider 4xx (err.status) -> 422 llm_request_rejected naming the model', () => {
    const err = Object.assign(new Error('Bad request'), { status: 400 });
    const out = classifyModelError(err, CTX);
    expect(out).toMatchObject({ status: 422, code: 'llm_request_rejected' });
    expect(out.message).toContain('openrouter/openai/gpt-4.1');
    expect(out.message).toContain('400');
  });

  it('a provider 5xx -> 502 llm_failed', () => {
    const err = Object.assign(new Error('boom'), { status: 503 });
    expect(classifyModelError(err, CTX)).toMatchObject({ status: 502, code: 'llm_failed' });
  });

  it('reads status, never statusCode: an ExternalServiceError (statusCode 502) is llm_failed', () => {
    expect(classifyModelError(new ExternalServiceError('upstream'), CTX).code).toBe('llm_failed');
    const faked = Object.assign(new Error('x'), { statusCode: 400 });
    expect(classifyModelError(faked, CTX).code).toBe('llm_failed');
  });

  it('anything else, including a non-Error, -> 502 llm_failed without echoing the error text', () => {
    const out = classifyModelError(new Error('secret sk-123 leaked'), CTX);
    expect(out).toMatchObject({ status: 502, code: 'llm_failed' });
    expect(out.message).not.toContain('sk-123');
    expect(classifyModelError('string', CTX).code).toBe('llm_failed');
    expect(classifyModelError(undefined, CTX).code).toBe('llm_failed');
  });
});

describe('isStale (AC-45)', () => {
  it('differs from the live head -> stale', () => {
    expect(isStale('a', 'b')).toBe(true);
  });
  it('equal -> not stale', () => {
    expect(isStale('a', 'a')).toBe(false);
  });
  it('an unknown live head is never stale', () => {
    expect(isStale('a', null)).toBe(false);
    expect(isStale('a', undefined)).toBe(false);
    expect(isStale('a', '')).toBe(false);
  });
});

describe('admitGenerate (AC-92)', () => {
  it('admits 3 within 60 s and refuses the 4th, without recording it', () => {
    let history: number[] = [];
    for (const t of [0, 1_000, 2_000]) {
      const r = admitGenerate(history, t);
      expect(r.allowed).toBe(true);
      history = r.history;
    }
    const refused = admitGenerate(history, 3_000);
    expect(refused.allowed).toBe(false);
    expect(refused.history).toEqual([0, 1_000, 2_000]);
  });

  it('admits again once the window has passed', () => {
    const history = [0, 1_000, 2_000];
    expect(admitGenerate(history, 59_999).allowed).toBe(false);
    expect(admitGenerate(history, 60_000).allowed).toBe(true); // the 0 ms entry has aged out
  });
});

describe('logLine (AC-94)', () => {
  const usage = { llm_calls: 1, tokens_in: 7200, tokens_out: 900, cost_usd: 0.0123, duration_ms: 4321 };

  it('formats a success byte for byte', () => {
    expect(
      logLine({
        prId: 'pr-1',
        usage,
        model: 'openrouter/openai/gpt-4.1',
        status: 'ok',
        reason: null,
        dropped: { risks: 1, review_focus: 2 },
        truncated: ['specs', 'diff_stats'],
      }),
    ).toBe(
      'brief: pr=pr-1 llm_calls=1 model=openrouter/openai/gpt-4.1 prompt_tokens=unknown tokens_in=7200 tokens_out=900' +
        ' cost_usd=0.0123 duration_ms=4321 status=ok reason=none dropped_risks=1 dropped_focus=2' +
        ' truncated=specs,diff_stats',
    );
  });

  it('formats an llm_timeout failure with unknown usage', () => {
    expect(
      logLine({
        prId: 'pr-2',
        usage: { llm_calls: 1, tokens_in: null, tokens_out: null, cost_usd: null, duration_ms: 120_004 },
        model: 'openrouter/openai/gpt-4.1',
        status: 'failed',
        reason: 'llm_timeout',
        dropped: { risks: 0, review_focus: 0 },
        truncated: [],
      }),
    ).toBe(
      'brief: pr=pr-2 llm_calls=1 model=openrouter/openai/gpt-4.1 prompt_tokens=unknown tokens_in=unknown tokens_out=unknown' +
        ' cost_usd=unknown duration_ms=120004 status=failed reason=llm_timeout dropped_risks=0 dropped_focus=0' +
        ' truncated=none',
    );
  });
});

describe('logLine prompt_tokens', () => {
  it('logs the budget-measured prompt next to the provider count', () => {
    expect(
      logLine({
        prId: 'pr-3',
        usage: { llm_calls: 1, prompt_tokens: 7_900, tokens_in: 8_600, tokens_out: 1_000, cost_usd: 0.0003, duration_ms: 12_000 },
        model: 'openrouter/deepseek/deepseek-v4-flash',
        status: 'ok',
        reason: null,
        dropped: { risks: 0, review_focus: 0 },
        truncated: [],
      }),
    ).toContain('prompt_tokens=7900 tokens_in=8600 tokens_out=1000');
  });
});

describe('truncatedSources', () => {
  it('lists sources that are truncated or cut for budget', () => {
    expect(
      truncatedSources([
        { source: 'intent', status: 'used' },
        { source: 'diff_stats', status: 'truncated', reason: 'file_list_truncated' },
        { source: 'specs', status: 'missing', reason: 'over_budget' },
        { source: 'linked_issue', status: 'missing', reason: 'no_linked_issue' },
      ]),
    ).toEqual(['diff_stats', 'specs']);
  });

  it('is empty when nothing was cut', () => {
    expect(truncatedSources([{ source: 'intent', status: 'used' }])).toEqual([]);
  });
});
