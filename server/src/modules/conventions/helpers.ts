/**
 * Conventions rules and mappers — pure (no DB, no clock, no `this`), so the two
 * parts that decide whether the feature is honest get unit coverage without
 * Docker: EVIDENCE VALIDATION (which candidates survive) and the FINGERPRINT
 * (which candidates count as already-seen). Same split as `pulls/cost.ts`.
 */
import { createHash } from 'node:crypto';
import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionDropReason,
} from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';
import {
  CONVENTIONS_SKILL_NAME,
  EVIDENCE_LINE_TOLERANCE,
  MAX_CONFIG_DIRS,
  PACKAGE_CONTAINER_DIRS,
} from './constants.js';

export type { ConventionRow };

/**
 * Where to look for config files, derived from the code samples themselves.
 *
 * The repo root alone is not enough and this was measured, not guessed: a real
 * scan of this very repository returned ZERO configs, because `tsconfig.json`
 * lives under `server/` and `client/` and nothing sits at the root. Rather than
 * hardcode a layout, take the package directories the RANKED FILES are already
 * in — whatever the repo's shape, that is where its configs are.
 *
 * `packages/api/src/x.ts` yields `packages/api/`, not `packages/`, because a
 * container directory holds no config of its own. Ordered by how many ranked
 * files each directory contributed, so the busiest package wins the budget;
 * ties break alphabetically so a scan is reproducible.
 */
export function configSearchDirs(codePaths: string[]): string[] {
  const counts = new Map<string, number>();
  for (const path of codePaths) {
    const parts = path.split('/').filter((p) => p !== '');
    if (parts.length < 2) continue;
    const head = parts[0]!;
    const isContainer = (PACKAGE_CONTAINER_DIRS as readonly string[]).includes(head);
    if (isContainer && parts.length < 3) continue;
    const dir = isContainer ? `${head}/${parts[1]!}/` : `${head}/`;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CONFIG_DIRS)
    .map(([dir]) => dir);

  // The root is always probed first — a single-package repo has nothing else.
  return ['', ...ranked];
}

/** One candidate exactly as the model proposed it — nothing verified yet. */
export interface ProposedConvention {
  category: ConventionCategory;
  rule: string;
  evidence_path: string;
  evidence_line: number;
  evidence_snippet: string;
  confidence: number;
}

/** A candidate whose evidence has been re-read and confirmed against the file. */
export interface VerifiedConvention extends ProposedConvention {
  fingerprint: string;
}

export type EvidenceCheck =
  | { ok: true; line: number; snippet: string }
  | { ok: false; reason: ConventionDropReason };

/**
 * Collapse a rule to its identity. Lowercased, punctuation dropped, whitespace
 * collapsed — so "Handlers MUST validate via Zod." and "handlers must validate
 * via zod" are one rule and therefore one triage decision.
 */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The re-scan identity key: sha256 of the normalized RULE TEXT and nothing else.
 *
 * Evidence is deliberately excluded. A model re-proposing the same rule almost
 * never cites the same file twice, so keying on evidence would hand every
 * rejected rule a fresh row and a fresh `pending` status on the next scan —
 * exactly the resurrection the status column exists to prevent.
 */
export function fingerprintRule(rule: string): string {
  return createHash('sha256').update(normalizeRule(rule), 'utf8').digest('hex');
}

/** Whitespace-insensitive, case-SENSITIVE: code differs by case, indentation does not. */
function normalizeCode(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/**
 * Re-read the cited evidence and decide whether the candidate survives.
 *
 * `samples` is what we actually SENT the model, keyed by path. Checking
 * membership there rather than "does this file exist" is what kills an invented
 * path: a model that names a real file it was never shown did not derive a rule
 * from it.
 *
 * A snippet found within `EVIDENCE_LINE_TOLERANCE` of the cited line is accepted
 * and the line is CORRECTED — off-by-one between 0- and 1-indexing is a counting
 * slip, not a fabrication, and rejecting it throws away good rules. Anything
 * further away is a miss.
 */
export function validateEvidence(
  candidate: ProposedConvention,
  samples: Map<string, string>,
): EvidenceCheck {
  if (candidate.rule.trim() === '') return { ok: false, reason: 'empty_rule' };

  const content = samples.get(candidate.evidence_path);
  if (content === undefined) return { ok: false, reason: 'unknown_file' };

  const lines = content.split('\n');
  const cited = candidate.evidence_line;
  if (!Number.isInteger(cited) || cited < 1 || cited > lines.length) {
    return { ok: false, reason: 'line_out_of_range' };
  }

  const needle = normalizeCode(candidate.evidence_snippet);
  if (needle === '') return { ok: false, reason: 'snippet_mismatch' };

  // Cited line first, then outwards — so a snippet that appears on several lines
  // resolves to the one nearest what the model claimed.
  for (let delta = 0; delta <= EVIDENCE_LINE_TOLERANCE; delta += 1) {
    const probes = delta === 0 ? [cited] : [cited - delta, cited + delta];
    for (const line of probes) {
      if (line < 1 || line > lines.length) continue;
      const actual = lines[line - 1];
      if (actual === undefined) continue;
      if (normalizeCode(actual).includes(needle)) {
        return { ok: true, line, snippet: actual.trim() };
      }
    }
  }
  return { ok: false, reason: 'snippet_mismatch' };
}

/**
 * A GitHub blob permalink with a line anchor.
 *
 * Pinned to the scan's sha, never to the default branch: a branch URL keeps
 * resolving after the file moves and quietly points the reviewer at unrelated
 * code. Returns null when there was no head to pin to.
 */
export function buildGithubBlobUrl(
  repo: { owner: string; name: string },
  sha: string | null,
  path: string,
  line: number,
): string | null {
  if (!sha) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${repo.owner}/${repo.name}/blob/${sha}/${encoded}#L${line}`;
}

/**
 * Row → wire DTO. The nullish coalescing covers columns that predate this
 * module; nothing it writes can produce a row without evidence, because a
 * candidate whose evidence did not verify is dropped before the insert.
 */
export function toConventionDto(
  row: ConventionRow,
  repo: { owner: string; name: string },
): ConventionCandidate {
  const path = row.evidencePath ?? '';
  const line = row.evidenceLine ?? 1;
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: path,
    evidence_line: line,
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_url:
      path === '' ? null : buildGithubBlobUrl(repo, row.evidenceSha ?? null, path, line),
    confidence: row.confidence ?? 0,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

const CATEGORY_LABELS: Record<ConventionCategory, string> = {
  naming: 'Naming',
  structure: 'Structure',
  typing: 'Typing',
  validation: 'Validation',
  error_handling: 'Error handling',
  testing: 'Testing',
  imports: 'Imports',
  formatting: 'Formatting',
  other: 'Other',
};

/** Kept under `SKILL_LIMITS.description` (200) even with a long `owner/name`. */
export function buildSkillDescription(fullName: string): string {
  const text =
    `Apply the coding conventions extracted from ${fullName} and accepted in the studio. ` +
    'Use them when reviewing any change to that repository.';
  return text.length <= 200 ? text : `${text.slice(0, 197)}...`;
}

/**
 * Assemble the accepted rules into one skill body.
 *
 * Grouped by category in the contract's own enum order, so re-assembling the
 * same set of rules produces a byte-identical body — which is what lets
 * `isBodyChange` decline to burn a skill version on a no-op rebuild.
 *
 * Each rule carries its `path:line`. That is not decoration: it is the only
 * claim to authority the rule has when a reviewer model reads it.
 */
/**
 * The whole `repo-conventions` skill as it would be saved, assembled in ONE place.
 *
 * `GET .../skill/draft` and `POST .../skill` both call this, which is the only
 * reason a draft shown in the modal and then saved untouched produces a
 * byte-identical body — and therefore burns no skill version. Two call sites each
 * assembling "the same" body is exactly how that guarantee rots.
 *
 * Assembly stays on the server for the same reason: if the client re-rendered the
 * markdown, determinism would depend on its formatter matching ours.
 */
export function buildSkillDraft(
  fullName: string,
  candidates: ConventionCandidate[],
  maxChars: number,
): { name: string; description: string; body: string } {
  return {
    name: CONVENTIONS_SKILL_NAME,
    description: buildSkillDescription(fullName),
    body: buildSkillBody(fullName, candidates, maxChars),
  };
}

export function buildSkillBody(
  fullName: string,
  candidates: ConventionCandidate[],
  maxChars: number,
): string {
  const header = [
    `# Repo conventions — ${fullName}`,
    '',
    'Conventions observed in this repository and accepted by a human reviewer.',
    'Each rule names the file and line it was derived from; flag a change that',
    'contradicts one, and cite the same evidence when you do.',
    '',
  ];

  const sections: string[] = [];
  for (const category of ConventionCategory.options) {
    const inCategory = candidates.filter((c) => c.category === category);
    if (inCategory.length === 0) continue;
    sections.push(`## ${CATEGORY_LABELS[category]}`);
    for (const c of inCategory) {
      sections.push(`- ${c.rule.trim()} (evidence: \`${c.evidence_path}:${c.evidence_line}\`)`);
    }
    sections.push('');
  }

  if (sections.length === 0) sections.push('_No conventions have been accepted yet._');

  const body = [...header, ...sections].join('\n').trimEnd();
  return body.length <= maxChars ? body : `${body.slice(0, maxChars - 4).trimEnd()}\n...`;
}
