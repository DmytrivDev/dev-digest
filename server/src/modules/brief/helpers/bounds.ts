import { MAX_RUN_BYTES } from '../constants.js';

/**
 * Size bounds for attacker-controlled text — pure, ring 1 (F9, OWASP A06).
 *
 * js-tiktoken's BPE merge is super-linear in the UTF-8 BYTES of one regex piece, so the brief
 * bounds text in bytes (never in UTF-16 units or code points: an astral letter is 4 bytes, a
 * CJK letter 3) and counts it in a way that never re-tokenizes what it has already seen.
 */

/** UTF-8 length of `text` in bytes, without allocating the encoding. A lone surrogate is 3 (U+FFFD). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && isLowSurrogate(text.charCodeAt(i + 1))) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

const isLowSurrogate = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/** The longest prefix of `text` that is at most `maxBytes` of UTF-8 and never ends inside a character. */
export function clipBytes(text: string, maxBytes: number): string {
  // A UTF-16 unit is at most 3 bytes: a text this short cannot be over.
  if (text.length * 3 <= maxBytes) return text;
  let bytes = 0;
  let i = 0;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    let step = 1;
    let size: number;
    if (c < 0x80) size = 1;
    else if (c < 0x800) size = 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && isLowSurrogate(text.charCodeAt(i + 1))) {
      size = 4;
      step = 2;
    } else size = 3;
    if (bytes + size > maxBytes) return text.slice(0, i);
    bytes += size;
    i += step;
  }
  return text;
}

/** UTF-8 bytes of one code point. */
const codePointBytes = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** `run` cut into pieces of at most `maxBytes` bytes, on code point boundaries. */
function chunkBytes(run: string, maxBytes: number): string[] {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of run) {
    const size = codePointBytes(ch.codePointAt(0)!);
    if (bytes + size > maxBytes && cur !== '') {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += size;
  }
  if (cur !== '') out.push(cur);
  return out;
}

// The runs cl100k pre-splits text into (its pattern: a letter run, a punctuation run,
// whitespace); a digit run is already capped at 3. The BPE merge of one run is the cost.
const RUN = /\p{L}+|[^\s\p{L}\p{N}]+|\s+/gu;

/** Does `text` hold a run of letters, punctuation or whitespace longer than `maxBytes` bytes? */
export function hasRunOver(text: string, maxBytes: number): boolean {
  for (const m of text.matchAll(RUN)) {
    // `length * 4 <= maxBytes` ⇒ cannot be over: skip the byte count for the usual short run.
    if (m[0].length * 4 > maxBytes && utf8Length(m[0]) > maxBytes) return true;
  }
  return false;
}

// A run of fewer than this many code points cannot be longer than MAX_RUN_BYTES (4 bytes each).
const MIN_LONG = Math.floor(MAX_RUN_BYTES / 4) + 1;
const LONG_RUN = new RegExp(
  String.raw`(\p{L}{${MIN_LONG},})|([^\s\p{L}\p{N}]{${MIN_LONG},})|(\s{${MIN_LONG},})`,
  'gu',
);

/**
 * Bound the longest run the tokenizer will see in free text: a letter or punctuation run longer
 * than `MAX_RUN_BYTES` bytes is cut into pieces joined by a space, a whitespace run is shortened
 * to `MAX_RUN_BYTES` bytes. Linear time; text without such a run is returned unchanged. Never
 * applied to paths (they are elided instead — see `hasRunOver`).
 */
export function breakLongRuns(text: string): string {
  return text.replace(LONG_RUN, (run, letters: string | undefined, punct: string | undefined) => {
    if (utf8Length(run) <= MAX_RUN_BYTES) return run;
    return letters !== undefined || punct !== undefined
      ? chunkBytes(run, MAX_RUN_BYTES).join(' ')
      : clipBytes(run, MAX_RUN_BYTES);
  });
}

// Where a text can be cut into independently counted chunks. In cl100k's pre-split pattern no
// piece spans these points: (1) before a single space that sits between two non-space chars —
// a piece never swallows a trailing space and a space only ever LEADS the next piece; (2) after
// a newline when a non-space follows — a newline run is one piece that ends at its last newline.
// So the token count of a text is exactly the sum of the counts of its chunks.
const SPLIT = /(?<=\S)(?= \S)|(?<=\n)(?=\S)/;

/**
 * A token counter that tokenizes every distinct word / line once. Wrap a cl100k counter with
 * it and the many whole-prompt counts of the budget search cost a lookup per word instead of a
 * tokenization: only text never seen before is tokenized. The result equals the wrapped
 * counter's on the whole text for a counter that splits on cl100k's pattern (see the test); for
 * a counter that rounds per call it is an over-estimate, never an under-estimate.
 */
export function chunkMemoCounter(count: (text: string) => number, maxEntries = 100_000): (text: string) => number {
  const memo = new Map<string, number>();
  return (text) => {
    let total = 0;
    for (const chunk of text.split(SPLIT)) {
      let n = memo.get(chunk);
      if (n === undefined) {
        n = count(chunk);
        if (memo.size >= maxEntries) memo.clear();
        memo.set(chunk, n);
      }
      total += n;
    }
    return total;
  };
}
