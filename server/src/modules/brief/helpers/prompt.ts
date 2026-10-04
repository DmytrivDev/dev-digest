import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Intent } from '@devdigest/shared';
import { INPUT_SOURCES, PATH_RUN_MAX_BYTES, UNTRUSTED_LABELS } from '../constants.js';
import type { BriefFacts, FileStat, LineRange, RenderedPrompt } from '../types.js';
import { breakLongRuns, hasRunOver, utf8Length } from './bounds.js';
import { stripControl } from './inputs.js';

/**
 * Prompt assembly for the PR brief (SPEC-03) — pure, ring 1.
 *
 * Every piece of PR / repo content goes through `wrapUntrusted` with a CONSTANT label
 * (AC-67: the label is not escaped, so it must never carry a path or any content) after
 * `stripControl` (AC-69). `wrapUntrusted` escapes a closing delimiter inside the content.
 * Headings and the changed-files header are trusted text and are never cut. The hunk bodies
 * never appear — only path, role, numbers and ranges (AC-51).
 */

/** `text.slice(0, n)` that never leaves half of a surrogate pair at the end. */
export function clip(text: string, limit: number | undefined): string {
  if (limit === undefined || text.length <= limit) return text;
  if (limit <= 0) return '';
  let end = limit;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/** Control characters gone and no over-long run — the form untrusted free text enters the prompt in. */
const clean = (text: string): string => breakLongRuns(stripControl(text));

/** One path / name on one line, control characters gone. */
const oneLine = (s: string): string => stripControl(s).replace(/[\t\n]/g, ' ');

/**
 * A path or symbol name as the model sees it. Verbatim — the model echoes paths back and
 * `validateBrief` matches them against the PR's files, so a path is never split — unless it
 * holds a run too long to tokenize cheaply (F12): then it is elided, and the model cannot
 * cite that one name (a real name does not have a 40-byte run of letters).
 */
function nameText(s: string): string {
  const one = oneLine(s);
  return hasRunOver(one, PATH_RUN_MAX_BYTES) ? `[name elided: ${utf8Length(one)} bytes]` : one;
}

const bullets = (items: readonly string[]): string =>
  items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '(none)';

/** The intent block's text: intent, in scope, out of scope. */
export function intentText(intent: Intent): string {
  return [
    `Intent: ${intent.intent}`,
    `In scope:\n${bullets(intent.in_scope)}`,
    `Out of scope:\n${bullets(intent.out_of_scope)}`,
  ].join('\n');
}

/** The blast block's cuttable text (AC-62 tier 6): the summary and the changed-symbol lines. */
export function blastText(blast: NonNullable<BriefFacts['blast']>): string {
  const symbols = blast.changedSymbols.map((s) => `${s.name} (${s.kind}) in ${s.file}`);
  return [`Summary: ${blast.summary}`, `Changed symbols:\n${bullets(symbols)}`].join('\n');
}

function formatRanges(f: FileStat): string {
  if (!f.hasPatch) return 'n/a';
  if (f.ranges.length === 0) return '-';
  return f.ranges.map((r: LineRange) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(', ');
}

/** One row per file — path, role and numbers only. */
function fileRow(f: FileStat): string {
  return `${nameText(f.path)} | ${f.role} | +${f.additions} | -${f.deletions} | ${formatRanges(f)}`;
}

/** A heading and an untrusted block. `body` must already be clean (control characters, long runs). */
const block = (heading: string, label: string, body: string): string =>
  `## ${heading}\n${wrapUntrusted(label, body)}`;

const section = (heading: string, label: string, text: string): string =>
  block(heading, label, clean(text));

/**
 * The trusted line naming the sources the model does not get, by reason code (never content).
 * Empty string when nothing is missing.
 */
function unavailableLine(unavailable: BriefFacts['unavailable']): string {
  const parts = INPUT_SOURCES.flatMap((source) => {
    const reason = unavailable[source];
    return reason ? [`${source} (${reason})`] : [];
  });
  return parts.length > 0 ? `Not provided: ${parts.join(', ')}.` : '';
}

/**
 * Build the `{system, user}` pair. Sections whose input is missing are left out and named in
 * one trusted line. `facts.textLimits` are the budget's last-tier ceilings (AC-62 tier 6).
 */
export function renderBriefPrompt(system: string, facts: BriefFacts): RenderedPrompt {
  const parts: string[] = [];

  parts.push(section('PR title', UNTRUSTED_LABELS.title, clip(facts.title, facts.textLimits.title)));

  if (facts.description) {
    parts.push(section('PR description', UNTRUSTED_LABELS.description, facts.description));
  }

  if (facts.linkedIssue) {
    const { number, title, body } = facts.linkedIssue;
    parts.push(
      section('Linked issue', UNTRUSTED_LABELS.linkedIssue, `#${number} ${title}\n\n${body}`),
    );
  }

  if (facts.intent) {
    parts.push(
      section('Intent', UNTRUSTED_LABELS.intent, clip(intentText(facts.intent), facts.textLimits.intent)),
    );
  }

  if (facts.blast) {
    const callers = facts.blast.callers.map((c) => `${nameText(c.file)}:${c.line} ${nameText(c.symbol)}`);
    const text = clip(blastText(facts.blast), facts.textLimits.blast);
    // Only the free text is run-broken: the caller lines hold paths the model echoes back, and
    // `nameText` has already kept them whole or elided them (F12).
    const free = clean(text);
    const body = callers.length > 0 ? `${free}\nCallers (file:line symbol):\n${bullets(callers)}` : free;
    parts.push(block('Blast radius', UNTRUSTED_LABELS.blast, body));
  }

  const header =
    `${facts.filesTotal} files (${facts.files.length} shown). ` +
    'Columns: path | role | +additions | -deletions | new-side changed ranges';
  const rows = facts.files.map(fileRow).join('\n');
  parts.push(
    `## Changed files\n${header}\n${wrapUntrusted(UNTRUSTED_LABELS.diffStats, rows === '' ? '(none)' : rows)}`,
  );

  facts.specs.forEach((doc, i) => {
    parts.push(
      `## Project spec ${i}\n${wrapUntrusted(
        `${UNTRUSTED_LABELS.specPrefix}${i}`,
        clean(`Path: ${oneLine(doc.path)}\n\n${doc.content}`),
      )}`,
    );
  });

  const missing = unavailableLine(facts.unavailable);
  if (missing) parts.push(missing);

  return { system, user: parts.join('\n\n') };
}
