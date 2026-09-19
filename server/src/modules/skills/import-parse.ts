import { unzipSync } from 'fflate';
import { SkillType } from '@devdigest/shared';
import {
  DEFAULT_SKILL_TYPE,
  DERIVED_DESCRIPTION_MAX,
  IMPORT_NAME_MAX,
  MAX_ENTRY_BYTES,
  MAX_IMPORT_BYTES,
} from './constants.js';

/**
 * Skill import parsing — PURE. No fs, no network, no db.
 *
 * Turns an uploaded markdown file or archive into a *preview*: the skill core
 * and nothing else. The caller persists it only after the user confirms.
 *
 * The rule that shapes this file: an archive is somebody else's code. We read
 * the central directory to learn the entry NAMES, pick exactly one markdown
 * entry, and decompress ONLY that one (`unzipSync`'s `filter` runs before
 * inflation). Every other entry — scripts, binaries, nested archives — is
 * reported by name and never decompressed, never decoded, never executed.
 */

/** Thrown for a malformed / unsupported / oversized upload → 422 at the route. */
export class SkillImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillImportError';
  }
}

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Archive entries we deliberately did NOT read. Empty for a bare .md. */
  ignored_entries: string[];
  /** Which archive entry the body came from; null for a bare .md. */
  source_entry: string | null;
}

const MARKDOWN_EXT = /\.(md|markdown)$/i;
const ARCHIVE_EXT = /\.zip$/i;

/** Entries a zip carries for bookkeeping, never part of a skill. */
function isNoise(name: string): boolean {
  return name.endsWith('/') || name.startsWith('__MACOSX/') || basename(name) === '.DS_Store';
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

function depth(path: string): number {
  return path.split('/').length;
}

/**
 * Pick the skill core out of an archive's entry names.
 *
 * `SKILL.md` wins at any depth (that is the agent-skill convention), otherwise
 * the shallowest markdown file; ties break alphabetically so the same archive
 * always yields the same skill.
 */
export function pickCoreEntry(names: string[]): string | undefined {
  const markdown = names.filter((n) => !isNoise(n) && MARKDOWN_EXT.test(n));
  if (markdown.length === 0) return undefined;
  const ranked = [...markdown].sort((a, b) => {
    const aSkill = basename(a).toLowerCase() === 'skill.md' ? 0 : 1;
    const bSkill = basename(b).toLowerCase() === 'skill.md' ? 0 : 1;
    if (aSkill !== bSkill) return aSkill - bSkill;
    if (depth(a) !== depth(b)) return depth(a) - depth(b);
    return a.localeCompare(b);
  });
  return ranked[0];
}

export interface Frontmatter {
  fields: Record<string, string>;
  /** The document with the frontmatter block removed. */
  body: string;
}

/**
 * Read a leading `---` fenced block as flat `key: value` pairs.
 *
 * Deliberately NOT a YAML parser: skill frontmatter in the wild is a handful of
 * scalars, and pulling in a YAML engine to read three strings would add a
 * parser (and its own attack surface) to an untrusted-input path. Nested
 * structures, lists and anchors are ignored rather than half-supported.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/^﻿/, '');
  if (!/^---[ \t]*\r?\n/.test(normalized)) return { fields: {}, body: normalized };

  const lines = normalized.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---[ \t]*$/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  if (end < 0) return { fields: {}, body: normalized };

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    const value = (m[2] ?? '').trim().replace(/^["']|["']$/g, '');
    if (value.length > 0) fields[key] = value;
  }
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '');
  return { fields, body };
}

/** First `# …` heading, used when nothing declares a name. */
export function deriveName(body: string, fallback: string): string {
  const m = /^#{1,3}[ \t]+(.+)$/m.exec(body);
  const heading = m?.[1]?.trim();
  return heading && heading.length > 0 ? heading : fallback;
}

/** First prose line, used when nothing declares a description. */
export function deriveDescription(body: string): string {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith('#') || line.startsWith('---')) continue;
    return line.length > DERIVED_DESCRIPTION_MAX
      ? `${line.slice(0, DERIVED_DESCRIPTION_MAX - 1).trimEnd()}…`
      : line;
  }
  return '';
}

/** Trim a one-line field to `max` characters, marking that it was cut. */
function clamp(text: string, max: number): string {
  const line = text.trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

function stem(filename: string): string {
  const base = basename(filename);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function toPreview(
  text: string,
  fallbackName: string,
  ignored: string[],
  sourceEntry: string | null,
): SkillImportPreview {
  const { fields, body } = parseFrontmatter(text);
  if (body.trim().length === 0) throw new SkillImportError('The skill body is empty.');

  const parsedType = SkillType.safeParse(fields.type);
  // Frontmatter values are capped exactly like derived ones: both end up in the
  // review prompt, and a declared field is the easier of the two to abuse.
  return {
    name: clamp(fields.name ?? deriveName(body, fallbackName), IMPORT_NAME_MAX),
    description: clamp(fields.description ?? deriveDescription(body), DERIVED_DESCRIPTION_MAX),
    type: parsedType.success ? parsedType.data : DEFAULT_SKILL_TYPE,
    body,
    ignored_entries: ignored,
    source_entry: sourceEntry,
  };
}

/**
 * Parse an uploaded skill into a preview. `bytes` is the DECODED upload.
 *
 * Throws `SkillImportError` for anything we will not handle — the route maps it
 * to a 422 so the user sees why instead of a generic failure.
 */
export function parseSkillUpload(filename: string, bytes: Uint8Array): SkillImportPreview {
  if (bytes.length === 0) throw new SkillImportError('The uploaded file is empty.');
  if (bytes.length > MAX_IMPORT_BYTES) {
    throw new SkillImportError(
      `The file is ${Math.round(bytes.length / 1024)} KB; the limit is ${MAX_IMPORT_BYTES / 1024} KB.`,
    );
  }

  if (MARKDOWN_EXT.test(filename)) {
    return toPreview(decodeUtf8(bytes), stem(filename), [], null);
  }

  if (!ARCHIVE_EXT.test(filename)) {
    throw new SkillImportError('Only .md, .markdown and .zip files can be imported.');
  }

  // Pass 1 — enumerate WITHOUT inflating anything. Returning false from the
  // filter means fflate skips decompression entirely for that entry.
  const names: string[] = [];
  const sizes = new Map<string, number>();
  try {
    unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        sizes.set(file.name, file.originalSize ?? 0);
        return false;
      },
    });
  } catch {
    throw new SkillImportError('The archive could not be read — is it a valid .zip?');
  }

  const core = pickCoreEntry(names);
  if (!core) throw new SkillImportError('The archive contains no markdown file.');

  const declared = sizes.get(core) ?? 0;
  if (declared > MAX_ENTRY_BYTES) {
    throw new SkillImportError(
      `"${core}" expands to ${Math.round(declared / 1024)} KB; the limit is ${MAX_ENTRY_BYTES / 1024} KB.`,
    );
  }

  // Pass 2 — inflate exactly one entry. Everything else stays compressed bytes
  // we never look at.
  const unpacked = unzipSync(bytes, { filter: (file) => file.name === core });
  const content = unpacked[core];
  if (!content) throw new SkillImportError(`"${core}" could not be extracted.`);

  const ignored = names.filter((n) => n !== core && !isNoise(n)).sort();
  return toPreview(decodeUtf8(content), stem(core), ignored, core);
}

/** Decode the base64 envelope the client posts, rejecting empty input. */
export function decodeBase64(content: string): Uint8Array {
  const cleaned = content.replace(/^data:[^;]*;base64,/, '').trim();
  const buf = Buffer.from(cleaned, 'base64');
  if (buf.length === 0) throw new SkillImportError('The uploaded file is empty.');
  return new Uint8Array(buf);
}
