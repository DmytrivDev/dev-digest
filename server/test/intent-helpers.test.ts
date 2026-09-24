/**
 * Intent-layer pure rules (`modules/intent/helpers.ts`) — reference parsing,
 * the path-traversal gate (R4), the confidence tier (R5) and the cache key
 * (R3). All pure; no Docker. See `docs/plans/intent-layer.plan.md`.
 */
import { describe, it, expect } from 'vitest';
import type { IntentSource } from '@devdigest/shared';
import {
  capDocRefs,
  capReferences,
  githubErrorDetail,
  overflowSource,
  prioritizeIssueRefs,
  readErrorDetail,
  confidenceTier,
  estimatePromptTokens,
  intentSourceKey,
  isProviderConfigError,
  isSafeDocPath,
  isSubstantiveBody,
  providerConfigMessage,
  providerErrorStatus,
  parseIssueRefs,
  parseReferences,
  parseSpecDocRefs,
  parseTicketKeys,
  renderIntentBlock,
  stripBodyBoilerplate,
  toIntentDto,
} from '../src/modules/intent/helpers.js';

describe('parseIssueRefs — the nine closing keywords, linked vs mentioned', () => {
  const KEYWORDS = ['close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved'];

  it.each(KEYWORDS)('"%s #N" is linked', (kw) => {
    const refs = parseIssueRefs(`${kw[0]!.toUpperCase()}${kw.slice(1)} #10`);
    expect(refs).toEqual([{ number: 10, linked: true }]);
  });

  it('a keyword with a colon still links', () => {
    expect(parseIssueRefs('Fixes: #10')).toEqual([{ number: 10, linked: true }]);
  });

  it('a bare #N with no keyword is a mention, not a link', () => {
    expect(parseIssueRefs('See #10 for background')).toEqual([{ number: 10, linked: false }]);
  });

  it('recognises owner/repo#N (cross-repo) and records the owner/repo', () => {
    expect(parseIssueRefs('Fixes acme/other-repo#42')).toEqual([
      { number: 42, linked: true, owner: 'acme', repo: 'other-repo' },
    ]);
  });

  it('recognises a full GitHub issue URL', () => {
    expect(parseIssueRefs('Closes https://github.com/acme/repo/issues/99')).toEqual([
      { number: 99, linked: true, owner: 'acme', repo: 'repo' },
    ]);
  });

  it('a same-repo owner/repo#N does not falsely report cross-repo fields when absent', () => {
    const refs = parseIssueRefs('mentions #7');
    expect(refs[0]!.owner).toBeUndefined();
    expect(refs[0]!.repo).toBeUndefined();
  });

  it('merges duplicate references to the same issue, keeping linked=true if any occurrence had the keyword', () => {
    const refs = parseIssueRefs('See #5 for context. Closes #5.');
    expect(refs).toEqual([{ number: 5, linked: true }]);
  });

  it('does NOT reuse the old optional-keyword, first-match-only, wrong-repo regex behaviour', () => {
    // The old adapter regex `/(?:closes|fixes|resolves)?\s*#(\d+)/i` would match
    // "#42" from "acme/other-repo#42" and fetch issue 42 from the CURRENT repo.
    // This parser instead records the cross-repo owner/repo so the caller can
    // tell it apart and never fetch it from the wrong repo.
    const refs = parseIssueRefs('Fixes acme/other-repo#42');
    expect(refs[0]!.owner).toBe('acme');
    expect(refs[0]!.repo).toBe('other-repo');
  });
});

describe('parseTicketKeys', () => {
  it('matches an admin-configurable (non-pure-alpha) project key', () => {
    expect(parseTicketKeys('See PROJ2-14 for the ticket.')).toEqual(['PROJ2-14']);
  });

  it('does not match a lowercase key', () => {
    expect(parseTicketKeys('see proj-14')).toEqual([]);
  });

  it('requires at least two leading letters/digits before the dash', () => {
    expect(parseTicketKeys('X-1 is not a ticket key')).toEqual([]);
  });

  it('dedupes repeated keys', () => {
    expect(parseTicketKeys('PROJ2-14 ... later PROJ2-14 again')).toEqual(['PROJ2-14']);
  });
});

describe('parseSpecDocRefs', () => {
  it('parses an explicit "Spec:" line', () => {
    expect(parseSpecDocRefs('Spec: docs/plans/x.plan.md\n\nmore text')).toContain(
      'docs/plans/x.plan.md',
    );
  });

  it('parses "Plan:" and "Design doc:" lines too', () => {
    expect(parseSpecDocRefs('Plan: docs/plans/y.plan.md')).toContain('docs/plans/y.plan.md');
    expect(parseSpecDocRefs('Design doc: specs/L03-intent.md')).toContain('specs/L03-intent.md');
  });

  it('parses an inline markdown link and a bare token', () => {
    const refs = parseSpecDocRefs(
      'See [the plan](docs/plans/y.plan.md) and also specs/L03-intent.md directly.',
    );
    expect(refs).toContain('docs/plans/y.plan.md');
    expect(refs).toContain('specs/L03-intent.md');
  });

  it('ignores a body with no doc reference', () => {
    expect(parseSpecDocRefs('Just a plain PR body with no references.')).toEqual([]);
  });
});

describe('isSafeDocPath (R4) — path-traversal gate', () => {
  const LEGAL = ['docs/plans/x.plan.md', 'specs/L03-intent.md', 'docs/agent-prompts/foo.md'];
  const HOSTILE = [
    '../../../.ssh/id_rsa',
    '../../../etc/passwd.md',
    '/etc/passwd.md',
    'docs/../../../secrets.md',
    'C:\\Users\\x\\secret.md',
    'https://evil.com/x.md',
    'file:///etc/passwd.md',
    '//evil.com/x.md',
    'docs/plans/x.txt',
    'docs/plans/x.plan.md.exe',
    '',
    '   ',
  ];

  it.each(LEGAL)('accepts %s', (p) => {
    expect(isSafeDocPath(p)).toBe(true);
  });

  it.each(HOSTILE)('rejects %s', (p) => {
    expect(isSafeDocPath(p)).toBe(false);
  });

  it('caps reads at MAX_DOCS and drops anything unsafe first', () => {
    const capped = capDocRefs([
      'docs/plans/a.md',
      '../../../etc/passwd.md',
      'docs/plans/b.md',
      'docs/plans/c.md',
    ]);
    expect(capped).toEqual(['docs/plans/a.md', 'docs/plans/b.md']);
  });
});

describe('confidenceTier (§2.7, R5) — a discrete tier, never a model self-report', () => {
  const src = (over: Partial<IntentSource>): IntentSource => ({
    kind: 'pr_title',
    resolved: false,
    ...over,
  });

  it('high — a resolved linked_issue', () => {
    expect(confidenceTier([src({ kind: 'linked_issue', resolved: true, ref: '#482' })])).toBe(
      'high',
    );
  });

  it('high — a resolved spec_doc', () => {
    expect(
      confidenceTier([src({ kind: 'spec_doc', resolved: true, ref: 'docs/plans/x.plan.md' })]),
    ).toBe('high');
  });

  it('medium — an unresolved reference (404 / not cloned / bad path / cross-repo / ticket_key)', () => {
    expect(confidenceTier([src({ kind: 'linked_issue', resolved: false })])).toBe('medium');
    expect(confidenceTier([src({ kind: 'spec_doc', resolved: false })])).toBe('medium');
    expect(confidenceTier([src({ kind: 'ticket_key', resolved: false })])).toBe('medium');
    expect(confidenceTier([src({ kind: 'mentioned_issue', resolved: false })])).toBe('medium');
  });

  it('medium — a substantive PR body with no reference at all', () => {
    expect(confidenceTier([src({ kind: 'pr_body', resolved: true })])).toBe('medium');
  });

  it('low — no body and no reference, indirect signals only', () => {
    expect(
      confidenceTier([
        src({ kind: 'pr_title' }),
        src({ kind: 'branch' }),
        src({ kind: 'commits' }),
        src({ kind: 'paths' }),
      ]),
    ).toBe('low');
  });

  it('low — an unresolved pr_body (not substantive) with nothing else', () => {
    expect(confidenceTier([src({ kind: 'pr_body', resolved: false })])).toBe('low');
  });

  it('high wins even when a medium-qualifying signal is also present', () => {
    expect(
      confidenceTier([
        src({ kind: 'linked_issue', resolved: true, ref: '#1' }),
        src({ kind: 'ticket_key', resolved: false }),
      ]),
    ).toBe('high');
  });
});

describe('stripBodyBoilerplate / isSubstantiveBody', () => {
  it('strips HTML comments, checklist items and headings', () => {
    const body = [
      '<!-- PR template instructions -->',
      '## Description',
      '- [ ] I have tested this',
      '- [x] I read the guidelines',
      'This change adds rate limiting to the public API endpoints so abusive clients get throttled.',
    ].join('\n');
    const stripped = stripBodyBoilerplate(body);
    expect(stripped).not.toContain('<!--');
    expect(stripped).not.toContain('[ ]');
    expect(stripped).not.toContain('## Description');
    expect(stripped).toContain('rate limiting');
  });

  it('a thin templated body (checklist + headings only) is not substantive', () => {
    const body = ['## Description', '- [ ] tested', '- [ ] documented'].join('\n');
    expect(isSubstantiveBody(body)).toBe(false);
  });

  it('a null/empty body is not substantive', () => {
    expect(isSubstantiveBody(null)).toBe(false);
    expect(isSubstantiveBody('')).toBe(false);
  });

  it('real prose past the threshold is substantive', () => {
    const body =
      'Adds a token-bucket rate limiter to every public API endpoint so a single client ' +
      'cannot exhaust upstream capacity during a burst.';
    expect(isSubstantiveBody(body)).toBe(true);
  });
});

describe('intentSourceKey (§2.3, R3) — cache key', () => {
  const base = { headSha: 'sha1', body: 'body text', provider: 'openrouter', model: 'x' };

  it('changes when only the body changes', () => {
    expect(intentSourceKey(base)).not.toBe(intentSourceKey({ ...base, body: 'different body' }));
  });

  it('changes when only the sha changes', () => {
    expect(intentSourceKey(base)).not.toBe(intentSourceKey({ ...base, headSha: 'sha2' }));
  });

  it('changes when only the model changes', () => {
    expect(intentSourceKey(base)).not.toBe(intentSourceKey({ ...base, model: 'y' }));
  });

  it('changes when only the provider changes', () => {
    expect(intentSourceKey(base)).not.toBe(intentSourceKey({ ...base, provider: 'openai' }));
  });

  it('is stable for identical inputs', () => {
    expect(intentSourceKey(base)).toBe(intentSourceKey({ ...base }));
  });

  it('treats a null/undefined body the same as an empty string', () => {
    expect(intentSourceKey({ ...base, body: null })).toBe(intentSourceKey({ ...base, body: '' }));
    expect(intentSourceKey({ ...base, body: undefined })).toBe(intentSourceKey({ ...base, body: '' }));
  });
});

describe('parseReferences — one pass over every kind', () => {
  it('returns issues, ticketKeys and specDocs together', () => {
    const body = [
      'Closes #482.',
      'See also PROJ2-14.',
      'Spec: docs/plans/x.plan.md',
    ].join('\n');
    const parsed = parseReferences(body);
    expect(parsed.issues).toEqual([{ number: 482, linked: true }]);
    expect(parsed.ticketKeys).toEqual(['PROJ2-14']);
    expect(parsed.specDocs).toContain('docs/plans/x.plan.md');
  });
});

describe('renderIntentBlock (§5.2)', () => {
  it('renders Intent/Confidence/Sources/In scope/Out of scope', () => {
    const block = renderIntentBlock({
      intent: 'Adds rate limiting to the public API.',
      in_scope: ['Add a token-bucket limiter'],
      out_of_scope: ['Changing the auth model'],
      confidence: 'high',
      sources: [{ kind: 'linked_issue', ref: '#482', resolved: true, detail: null }],
    });
    expect(block).toContain('Intent: Adds rate limiting to the public API.');
    expect(block).toContain('Confidence: high');
    expect(block).toContain('Sources: linked_issue #482 (resolved)');
    expect(block).toContain('In scope:');
    expect(block).toContain('- Add a token-bucket limiter');
    expect(block).toContain('Out of scope:');
    expect(block).toContain('- Changing the auth model');
  });
});

describe('toIntentDto — row -> wire DTO', () => {
  it('maps camelCase row fields to the snake_case contract', () => {
    const derivedAt = new Date('2026-09-22T00:00:00Z');
    const dto = toIntentDto({
      prId: 'pr-1',
      intent: 'Adds X.',
      inScope: ['a'],
      outOfScope: ['b'],
      confidence: 'medium',
      sources: [],
      model: 'openrouter/openai/gpt-4.1-nano',
      derivedAt,
      costUsd: 0.001,
    });
    expect(dto).toEqual({
      pr_id: 'pr-1',
      intent: 'Adds X.',
      in_scope: ['a'],
      out_of_scope: ['b'],
      confidence: 'medium',
      sources: [],
      model: 'openrouter/openai/gpt-4.1-nano',
      derived_at: derivedAt.toISOString(),
      cost_usd: 0.001,
    });
  });
});

describe('estimatePromptTokens', () => {
  it('sums the injected counter over every message', () => {
    const calls: string[] = [];
    const count = (text: string) => {
      calls.push(text);
      return text.length;
    };
    const total = estimatePromptTokens(
      [
        { role: 'system', content: 'abc' },
        { role: 'user', content: 'defgh' },
      ],
      count,
    );
    expect(total).toBe(8);
    expect(calls).toEqual(['abc', 'defgh']);
  });

  it('is 0 for no messages, and never calls the counter', () => {
    const count = () => {
      throw new Error('must not be called');
    };
    expect(estimatePromptTokens([], count)).toBe(0);
  });
});

describe("provider error classification", () => {
  /** What the OpenAI SDK actually throws: a message already prefixed by the status. */
  const apiError = (status: number, message: string) =>
    Object.assign(new Error(`${status} ${message}`), { status });

  const DEAD_MODEL = apiError(
    404,
    "This model is unavailable for free. The paid version is available now - use this slug instead: deepseek/deepseek-v4-flash-0731",
  );

  it("reads the status off a provider SDK error and nothing else", () => {
    expect(providerErrorStatus(DEAD_MODEL)).toBe(404);
    expect(providerErrorStatus(new Error("boom"))).toBeUndefined();
    expect(providerErrorStatus({ status: "404" })).toBeUndefined();
    expect(providerErrorStatus(null)).toBeUndefined();
    expect(providerErrorStatus(undefined)).toBeUndefined();
    expect(providerErrorStatus({ status: Number.NaN })).toBeUndefined();
  });

  it("treats a rejected configuration as ours to fix", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(isProviderConfigError(apiError(status, "nope"))).toBe(true);
    }
  });

  it("leaves transient failures to the best-effort path", () => {
    // 429 is the one that looks like a config error and is not: rate limiting
    // means the model IS real and we asked too often.
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isProviderConfigError(apiError(status, "later"))).toBe(false);
    }
    // No status at all — a timeout, a socket reset, or one of reviewer-core's
    // own thrown Errors. We cannot say we were rejected, so we do not.
    expect(isProviderConfigError(new Error("fetch failed"))).toBe(false);
    expect(isProviderConfigError(new Error("OpenRouter returned no choices for PrIntent"))).toBe(false);
  });

  it("classifies by status, never by matching words in the message", () => {
    // Same wording, transient status: the phrasing must not sway it, because a
    // provider's wording differs per vendor and changes without notice.
    expect(isProviderConfigError(apiError(503, "This model is unavailable for free"))).toBe(false);
  });

  it("quotes the provider back, because that is what names the replacement", () => {
    const msg = providerConfigMessage("deepseek/deepseek-v4-flash-0731:free", DEAD_MODEL);
    expect(msg).toContain("deepseek/deepseek-v4-flash-0731:free");
    expect(msg).toContain("HTTP 404");
    expect(msg).toContain("Settings");
    expect(msg).toContain("deepseek/deepseek-v4-flash-0731");
  });

  it("caps a long provider message instead of pasting it whole", () => {
    const msg = providerConfigMessage("m", apiError(400, "x".repeat(900)));
    expect(msg).toContain("…");
    expect(msg.length).toBeLessThan(500);
  });
});

describe("reference caps — an attacker-written body cannot fan out", () => {
  it("keeps the first N and counts the rest", () => {
    expect(capReferences([1, 2, 3, 4], 2)).toEqual({ kept: [1, 2], overflow: 2 });
    expect(capReferences([1], 5)).toEqual({ kept: [1], overflow: 0 });
  });

  it("puts linked issues first so a cap never drops the high-confidence one", () => {
    const refs = parseIssueRefs("See #1 #2 #3. Fixes #9.");
    expect(prioritizeIssueRefs(refs).map((r) => r.number)).toEqual([9, 1, 2, 3]);
  });

  it("collapses the overflow into one unresolved +N source", () => {
    expect(overflowSource("mentioned_issue", 7, 5)).toEqual({
      kind: "mentioned_issue",
      ref: "+7 more",
      resolved: false,
      detail: "over the cap of 5 — not read",
    });
  });
});

describe("source error details — fixed phrases, never raw error text", () => {
  const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });

  it("maps a missing doc to a phrase without the absolute clone path", () => {
    const err = Object.assign(new Error("ENOENT: no such file, open '/home/me/.devdigest/repos/acme/x/docs/x.md'"), { code: "ENOENT" });
    expect(readErrorDetail(err)).toBe("not found on the default branch");
    expect(readErrorDetail(Object.assign(new Error("x"), { code: "EOUTSIDECLONE" }))).toBe(
      "resolves outside the repository — not read",
    );
    expect(readErrorDetail(new Error("EACCES /home/me/secret"))).toBe("unreadable");
  });

  it("reports GitHub failures by status, and keeps our own config error", () => {
    expect(githubErrorDetail(apiError(404, "Not Found - https://docs.github.com/x"))).toBe("issue not found (HTTP 404)");
    expect(githubErrorDetail(apiError(401, "Bad credentials"))).toBe("GitHub request failed (HTTP 401)");
    expect(githubErrorDetail(new Error("socket hang up"))).toBe("GitHub request failed");
    const config = Object.assign(new Error("GITHUB_TOKEN is not configured"), { code: "config_error" });
    expect(githubErrorDetail(config)).toBe("GITHUB_TOKEN is not configured");
  });

  it("does not quote a 401/403 provider message — it can echo a masked key", () => {
    const msg = providerConfigMessage("m", apiError(401, "Incorrect API key provided: sk-abc***wxyz"));
    expect(msg).toContain("HTTP 401");
    expect(msg).not.toContain("sk-abc");
  });
});
