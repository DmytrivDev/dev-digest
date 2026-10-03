import type { BriefDropped, Risk, ReviewFocusItem } from '@devdigest/shared';
import {
  FOCUS_REASON_MAX,
  MAX_FOCUS,
  MAX_RISKS,
  RISK_EXPLANATION_MAX,
  RISK_KIND_FALLBACK,
  RISK_KIND_PATTERN,
  RISK_TITLE_MAX,
  SUMMARY_MAX,
} from '../constants.js';
import { BriefModelOutput, type FileStat, type LineRange } from '../types.js';

/**
 * Output validation for the brief — pure, ring 1. The model's answer is untrusted
 * (OWASP ASI09): every path and line it names is checked against the PR's own files and the
 * blast map before it is stored, and every text is cut to its limit.
 */

// ---- Parsing (AC-70) ---------------------------------------------------------------

export type ParsedModelOutput = { ok: true; data: BriefModelOutput } | { ok: false };

/** `BriefModelOutput.safeParse`. The service re-parses even provider-validated data. */
export function parseModelOutput(data: unknown): ParsedModelOutput {
  const parsed = BriefModelOutput.safeParse(data);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
}

// ---- Paths and references (AC-71, AC-74) -----------------------------------------------

/** Backslashes → `/`, then strip ONE leading `./` or `/` (AC-71). */
export function normalizePath(path: string): string {
  const p = path.replace(/\\/g, '/');
  if (p.startsWith('./')) return p.slice(2);
  if (p.startsWith('/')) return p.slice(1);
  return p;
}

export interface ParsedRef {
  /** Normalised path. */
  path: string;
  /** `null` for a bare path. */
  start: number | null;
  end: number | null;
}

const REF_RE = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/;

/**
 * `path` | `path:N` | `path:N-M` with N ≥ 1 and M ≥ N (AC-74). `null` when the text does not
 * follow the grammar (`a.ts:0`, `a.ts:9-3`, `a.ts:x`, an empty path).
 */
export function parseRef(ref: string): ParsedRef | null {
  const m = REF_RE.exec(ref);
  if (!m) return null;
  const rawPath = m[1]!;
  if (rawPath.includes(':')) return null; // `a.ts:x`, `a.ts:1:2`
  const path = normalizePath(rawPath);
  if (path === '') return null;
  if (m[2] === undefined) return { path, start: null, end: null };
  const start = Number(m[2]);
  const end = m[3] === undefined ? null : Number(m[3]);
  if (!Number.isSafeInteger(start) || start < 1) return null;
  if (end !== null && (!Number.isSafeInteger(end) || end < start)) return null;
  return { path, start, end };
}

// ---- Validation ----------------------------------------------------------------------------

export interface ValidateInput {
  output: BriefModelOutput;
  prFiles: readonly FileStat[];
  /** Caller lines per caller file from the FULL blast snapshot; `null` when blast is `missing`. */
  blastCallers: ReadonlyMap<string, ReadonlySet<number>> | null;
}

export interface ValidatedBrief {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  /** Items removed by the path / line checks only (AC-82). */
  dropped: BriefDropped;
}

/**
 * A risk `kind` is the model's free text (AC-25: not a closed enum), and the client may use it as
 * a lookup key. Keep it only as a short lowercase token that names no `Object.prototype` member
 * (`constructor`, `__proto__`); anything else becomes `other` (F10).
 */
export function normalizeKind(kind: string): string {
  const k = kind.trim().toLowerCase();
  return RISK_KIND_PATTERN.test(k) && !(k in Object.prototype) ? k : RISK_KIND_FALLBACK;
}

const SEVERITY_RANK: Record<Risk['severity'], number> = { high: 0, medium: 1, low: 2 };

const inRange = (line: number, ranges: readonly LineRange[]): boolean =>
  ranges.some((r) => line >= r.start && line <= r.end);

const intersects = (start: number, end: number, ranges: readonly LineRange[]): boolean =>
  ranges.some((r) => start <= r.end && end >= r.start);

export function validateBrief({ output, prFiles, blastCallers }: ValidateInput): ValidatedBrief {
  const byPath = new Map<string, FileStat>();
  for (const f of prFiles) byPath.set(normalizePath(f.path), f);

  const callerLines = new Map<string, ReadonlySet<number>>();
  if (blastCallers) for (const [file, lines] of blastCallers) callerLines.set(normalizePath(file), lines);

  let droppedFocus = 0;
  let droppedRisks = 0;

  // ---- Focus items (AC-72, AC-76, AC-77, AC-78) ----
  const focus: ReviewFocusItem[] = [];
  for (const item of output.review_focus) {
    const file = normalizePath(item.file);
    const pr = byPath.get(file);
    let keep: boolean;
    if (item.line < 1 || file === '') keep = false;
    else if (pr) keep = !pr.hasPatch || inRange(item.line, pr.ranges);
    else keep = callerLines.get(file)?.has(item.line) ?? false;
    if (!keep) {
      droppedFocus += 1;
      continue;
    }
    focus.push({ file, line: item.line, reason: item.reason });
  }

  // ---- Risk references (AC-73, AC-74, AC-75, AC-78, AC-97) ----
  const risks: Risk[] = [];
  for (const risk of output.risks) {
    const refs: string[] = [];
    for (const raw of risk.file_refs) {
      const ref = parseRef(raw);
      if (!ref) continue;
      const pr = byPath.get(ref.path);
      const callers = callerLines.get(ref.path);
      if (!pr && !callers) continue; // unknown file
      if (ref.start === null) {
        refs.push(ref.path);
        continue;
      }
      const end = ref.end ?? ref.start;
      const text = ref.end === null ? `${ref.path}:${ref.start}` : `${ref.path}:${ref.start}-${ref.end}`;
      if (pr) {
        // No patch → path check only; a patch → the range must touch a changed range.
        refs.push(!pr.hasPatch || intersects(ref.start, end, pr.ranges) ? text : ref.path);
      } else {
        const lines = [...callers!];
        refs.push(lines.some((l) => l >= ref.start! && l <= end) ? text : ref.path);
      }
    }
    if (refs.length === 0) {
      droppedRisks += 1;
      continue;
    }
    risks.push({ ...risk, kind: normalizeKind(risk.kind), file_refs: refs });
  }

  // ---- Caps (AC-79, AC-80) — not counted in `dropped` ----
  const cappedRisks = [...risks]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, MAX_RISKS)
    .map((r) => ({
      ...r,
      title: r.title.slice(0, RISK_TITLE_MAX),
      explanation: r.explanation.slice(0, RISK_EXPLANATION_MAX),
    }));

  const seen = new Set<string>();
  const cappedFocus: ReviewFocusItem[] = [];
  for (const item of focus) {
    const key = `${item.file}:${item.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cappedFocus.push({ ...item, reason: item.reason.slice(0, FOCUS_REASON_MAX) });
    if (cappedFocus.length === MAX_FOCUS) break;
  }

  return {
    summary: output.summary.slice(0, SUMMARY_MAX),
    risks: cappedRisks,
    review_focus: cappedFocus,
    dropped: { risks: droppedRisks, review_focus: droppedFocus },
  };
}
