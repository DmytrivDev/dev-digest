/**
 * Grounding of the model's tour answer (SPEC-02) — pure, ring 1.
 *
 * The model's output is untrusted (security ASI09): file lists and their order come
 * from the ranking alone (AC-66), commands must equal a deterministic candidate
 * (AC-72), task scopes must exist in the clone (AC-85), and every text is bounded
 * (AC-77, AC-89) before anything is stored. No I/O, no clock.
 */
import type {
  OnboardingCriticalPathsSection,
  OnboardingEmptyReason,
  OnboardingFailureReason,
  OnboardingFirstTasksSection,
  OnboardingGuidedReadingSection,
  OnboardingHowToRunSection,
} from '@devdigest/shared';
import {
  ARCH_WORDS_MAX,
  CONTROL_CHAR_RE,
  DIAGRAM_NODES_MAX,
  DIAGRAM_ROLES,
  FIRST_TASKS_MAX,
  HOW_TO_RUN_MAX,
  ROW_TEXT_MAX,
} from '../constants.js';
import type { TourModelOutput } from '../types.js';

const ELLIPSIS = '…';

/** `text.slice(0, n)` that never leaves half of a surrogate pair at the end. */
function sliceChars(text: string, n: number): string {
  if (n <= 0) return '';
  let end = n;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/**
 * Cut `text` after its `max`-th whitespace-separated word and append "…" directly
 * to that word (AC-77). Text with `max` words or fewer is returned unchanged;
 * everything up to the cut — line breaks included — is kept as written.
 */
export function cutWords(text: string, max: number = ARCH_WORDS_MAX): string {
  const word = /\S+/g;
  let count = 0;
  let end = 0;
  let m: RegExpExecArray | null;
  while ((m = word.exec(text)) !== null) {
    count += 1;
    if (count === max) end = m.index + m[0].length;
    else if (count > max) return text.slice(0, end) + ELLIPSIS;
  }
  return text;
}

/** Cut a model-written row text to `max - 1` characters + "…" when it is longer than `max` (AC-89). */
export function cutRowText(text: string, max: number = ROW_TEXT_MAX): string {
  const t = text.trim();
  return t.length > max ? sliceChars(t, max - 1) + ELLIPSIS : t;
}

/** Blank → null, so an empty model string is shown as "no text", not as an empty row note. */
function rowTextOrNull(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const cut = cutRowText(text);
  return cut === '' ? null : cut;
}

// ---- Diagram (AC-78) --------------------------------------------------------

const DIAGRAM_START = /^(?:flowchart|graph)(?=\s|$)/;
/** Lines that style or group nodes; they introduce no node of their own. */
const DIAGRAM_NON_NODE_LINE = /^(?:%%|style\b|classDef\b|class\b|linkStyle\b|click\b|subgraph\b|end\b|direction\b)/;

/** Replace every bracket group (`[..]`, `(..)`, `{..}`, nested, quoted text inside) and `|edge label|` with a space. */
function stripLabels(line: string): string {
  let out = '';
  let depth = 0;
  let quoted = false;
  let pipe = false;
  for (const ch of line) {
    if (quoted) {
      if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (depth > 0) {
      if (ch === '[' || ch === '(' || ch === '{') depth += 1;
      else if (ch === ']' || ch === ')' || ch === '}') {
        depth -= 1;
        if (depth === 0) out += ' ';
      }
      continue;
    }
    if (pipe) {
      if (ch === '|') {
        pipe = false;
        out += ' ';
      }
      continue;
    }
    if (ch === '|') {
      pipe = true;
      continue;
    }
    if (ch === '[' || ch === '(' || ch === '{') {
      depth = 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Distinct node ids of a flowchart body — a lexical count (A-15), never an over-count by design. */
function diagramNodeIds(src: string): Set<string> {
  const ids = new Set<string>();
  const body = src.replace(/^(?:flowchart|graph)(?:[ \t]+(?:TB|TD|BT|RL|LR))?/, '');
  for (const rawStatement of body.split(/[\n;]/)) {
    const statement = rawStatement.trim();
    if (statement === '' || DIAGRAM_NON_NODE_LINE.test(statement)) continue;
    const bare = stripLabels(statement)
      .replace(/:::\w+/g, ' ')
      .replace(/[-=.~<>&]+/g, ' ');
    for (const id of bare.match(/[A-Za-z0-9_]+/g) ?? []) ids.add(id);
  }
  return ids;
}

/** Lines that would restyle the diagram — only the page decides how a node looks. */
const DIAGRAM_STYLE_LINE = /^(?:style|classDef|class|linkStyle|click)\b/;
const ROLE_SET: ReadonlySet<string> = new Set(DIAGRAM_ROLES);

/**
 * The model's diagram with every styling line removed and every `:::class` tag that is
 * not a known role (`DIAGRAM_ROLES`) dropped. The page colours nodes by role itself, so
 * model-written colours, fills or click handlers never reach the SVG.
 */
export function sanitizeDiagram(src: string): string {
  return src
    .split('\n')
    .filter((line) => !DIAGRAM_STYLE_LINE.test(line.trim()))
    .map((line) => line.replace(/:::(\w+)/g, (tag, role: string) => (ROLE_SET.has(role) ? tag : '')))
    .join('\n');
}

/**
 * The model's diagram when it is a Mermaid `flowchart`/`graph` with at most 12 nodes,
 * else `null` (AC-78). Returns the trimmed, sanitised source (`sanitizeDiagram`).
 */
export function validDiagram(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null;
  const trimmed = sanitizeDiagram(src.trim()).trim();
  if (!DIAGRAM_START.test(trimmed)) return null;
  return diagramNodeIds(trimmed).size <= DIAGRAM_NODES_MAX ? trimmed : null;
}

// ---- File lists: rows and order from the ranking alone (AC-66) ---------------

function isSafePath(path: string): boolean {
  return !CONTROL_CHAR_RE.test(path);
}

/** First model row per exact path wins; paths the ranking did not list are never looked up. */
function firstByPath<T extends { path: string }>(rows: ReadonlyArray<T>): Map<string, T> {
  const byPath = new Map<string, T>();
  for (const r of rows) if (!byPath.has(r.path)) byPath.set(r.path, r);
  return byPath;
}

/** Critical-path rows in ranking order; the model contributes only a cut `reason` per exact path. */
export function groundCriticalPaths(
  rows: ReadonlyArray<{ path: string; imported_by: number }>,
  modelRows: ReadonlyArray<TourModelOutput['critical_paths'][number]>,
): OnboardingCriticalPathsSection['items'] {
  const model = firstByPath(modelRows);
  return rows
    .filter((r) => isSafePath(r.path))
    .map((r) => ({
      path: r.path,
      imported_by: r.imported_by,
      reason: rowTextOrNull(model.get(r.path)?.reason),
    }));
}

/** Guided-reading rows in ranking order; the model contributes only a cut `why` per exact path. */
export function groundReadingPath(
  rows: ReadonlyArray<{ path: string }>,
  modelRows: ReadonlyArray<TourModelOutput['reading_path'][number]>,
): OnboardingGuidedReadingSection['items'] {
  const model = firstByPath(modelRows);
  return rows
    .filter((r) => isSafePath(r.path))
    .map((r) => ({ path: r.path, why: rowTextOrNull(model.get(r.path)?.why) }));
}

// ---- How to run (AC-72, AC-73) ----------------------------------------------

/**
 * Model order; a step survives only when its `command` is byte-identical (`===`) to a
 * candidate command. Duplicates are dropped, at most 8 are kept, notes are cut to 120.
 */
export function groundSteps(
  candidates: ReadonlyArray<{ command: string }>,
  modelSteps: ReadonlyArray<TourModelOutput['run_steps'][number]>,
): OnboardingHowToRunSection['steps'] {
  const allowed = new Set(candidates.map((c) => c.command));
  const seen = new Set<string>();
  const steps: OnboardingHowToRunSection['steps'] = [];
  for (const s of modelSteps) {
    if (steps.length >= HOW_TO_RUN_MAX) break;
    if (!allowed.has(s.command) || seen.has(s.command)) continue;
    seen.add(s.command);
    steps.push({ command: s.command, note: rowTextOrNull(s.note) });
  }
  return steps;
}

// ---- First tasks (AC-84, AC-85, AC-88) ---------------------------------------

export interface GroundedTasks {
  items: OnboardingFirstTasksSection['items'];
  /** `no_valid_tasks` when none survived, else `null`. */
  empty_reason: Extract<OnboardingEmptyReason, 'no_valid_tasks'> | null;
}

/**
 * Keep the tasks whose `scope` — also tried with trailing `/` stripped — is in
 * `existingScopes` (every file and directory of the clone), first 3.
 */
export function groundTasks(
  tasks: ReadonlyArray<TourModelOutput['first_tasks'][number]>,
  existingScopes: ReadonlySet<string>,
): GroundedTasks {
  const items: OnboardingFirstTasksSection['items'] = [];
  for (const t of tasks) {
    if (items.length >= FIRST_TASKS_MAX) break;
    const stripped = t.scope.replace(/\/+$/, '');
    const exists = existingScopes.has(t.scope) || (stripped !== '' && existingScopes.has(stripped));
    if (!exists) continue;
    items.push({ title: t.title.trim(), scope: t.scope, complexity: t.complexity });
  }
  return { items, empty_reason: items.length === 0 ? 'no_valid_tasks' : null };
}

// ---- Failure classification (AC-48, AC-49, AC-50) -----------------------------

/**
 * `llm_timeout` for the app's `TimeoutError` (`platform/resilience.ts`, matched by name),
 * `llm_invalid_output` when a provider adapter reports "failed schema validation",
 * `llm_failed` for every other provider error.
 */
export function classifyModelError(err: unknown): OnboardingFailureReason {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  if (name === 'TimeoutError') return 'llm_timeout';
  const message = (err as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message.includes('failed schema validation')) {
    return 'llm_invalid_output';
  }
  return 'llm_failed';
}
