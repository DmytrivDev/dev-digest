/**
 * Skill import parsing (`modules/skills/import-parse.ts`) — the pure rule
 * behind `POST /skills/import/preview`.
 *
 * The load-bearing property under test is not "can we read a zip": it is that
 * an archive's non-markdown entries are ENUMERATED and never inflated, so
 * importing someone's skill pack cannot run their code or even materialise it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';

/**
 * Record which entries each `unzipSync` call agreed to INFLATE. fflate runs the
 * filter before decompressing, so an entry the filter rejects is never
 * materialised — wrapping the filter is therefore the exact observation we
 * want, and a call with no filter (which would inflate everything) is recorded
 * as `null` so the test can fail on it.
 */
const inflated = vi.hoisted(() => [] as Array<string[] | null>);

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>();
  return {
    ...actual,
    unzipSync: (data: Uint8Array, opts?: { filter?: (f: { name: string }) => boolean }) => {
      if (!opts?.filter) {
        inflated.push(null);
        return actual.unzipSync(data, opts as never);
      }
      const accepted: string[] = [];
      const inner = opts.filter;
      inflated.push(accepted);
      return actual.unzipSync(data, {
        ...opts,
        filter: (f) => {
          const ok = inner(f);
          if (ok) accepted.push(f.name);
          return ok;
        },
      } as never);
    },
  };
});
import {
  SkillImportError,
  decodeBase64,
  deriveDescription,
  deriveName,
  parseFrontmatter,
  parseSkillUpload,
  pickCoreEntry,
} from '../src/modules/skills/import-parse.js';
import { MAX_IMPORT_BYTES } from '../src/modules/skills/constants.js';

const u8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

describe('parseFrontmatter', () => {
  it('reads flat key: value pairs and strips the block from the body', () => {
    const { fields, body } = parseFrontmatter(
      '---\nname: test-quality\ndescription: "Use when reviewing tests."\ntype: rubric\n---\n# Heading\nProse.\n',
    );
    expect(fields).toEqual({
      name: 'test-quality',
      description: 'Use when reviewing tests.',
      type: 'rubric',
    });
    expect(body).toBe('# Heading\nProse.\n');
  });

  it('leaves the document alone when there is no frontmatter', () => {
    const { fields, body } = parseFrontmatter('# Just markdown\n');
    expect(fields).toEqual({});
    expect(body).toBe('# Just markdown\n');
  });

  it('treats an unterminated block as body, not as fields', () => {
    const src = '---\nname: never-closed\n# Heading\n';
    const { fields, body } = parseFrontmatter(src);
    expect(fields).toEqual({});
    expect(body).toBe(src);
  });
});

describe('deriveName / deriveDescription', () => {
  it('takes the first heading as the name, falling back to the filename stem', () => {
    expect(deriveName('# API Contract Guard\n\ntext', 'fallback')).toBe('API Contract Guard');
    expect(deriveName('no heading here', 'fallback')).toBe('fallback');
  });

  it('takes the first prose line as the description, skipping headings', () => {
    expect(deriveDescription('# Title\n\nUse when the route signature changes.')).toBe(
      'Use when the route signature changes.',
    );
    expect(deriveDescription('# Only a title')).toBe('');
  });
});

describe('pickCoreEntry', () => {
  it('prefers SKILL.md at any depth over a shallower markdown file', () => {
    expect(pickCoreEntry(['README.md', 'pack/deep/SKILL.md'])).toBe('pack/deep/SKILL.md');
  });

  it('falls back to the shallowest markdown file, ties broken alphabetically', () => {
    expect(pickCoreEntry(['pack/deep/b.md', 'pack/a.md', 'pack/aa.md'])).toBe('pack/a.md');
  });

  it('ignores directories and archive bookkeeping entries', () => {
    expect(pickCoreEntry(['docs/', '__MACOSX/x.md', 'pack/.DS_Store'])).toBeUndefined();
  });

  it('returns undefined when there is no markdown at all', () => {
    expect(pickCoreEntry(['install.sh', 'bin/tool.exe'])).toBeUndefined();
  });
});

describe('parseSkillUpload — markdown', () => {
  it('uses frontmatter when present', () => {
    const preview = parseSkillUpload(
      'anything.md',
      u8('---\nname: zipped\ndescription: Declared.\ntype: security\n---\n# H\nBody.\n'),
    );
    expect(preview).toMatchObject({
      name: 'zipped',
      description: 'Declared.',
      type: 'security',
      ignored_entries: [],
      source_entry: null,
    });
    expect(preview.body).toBe('# H\nBody.\n');
  });

  it('derives name/description and defaults the type when nothing is declared', () => {
    const preview = parseSkillUpload('pr-quality-rubric.md', u8('# Rubric\n\nUse on every PR.\n'));
    expect(preview.name).toBe('Rubric');
    expect(preview.description).toBe('Use on every PR.');
    expect(preview.type).toBe('custom');
  });

  it('falls back to the filename stem when the body has no heading', () => {
    expect(parseSkillUpload('my-skill.md', u8('just text')).name).toBe('my-skill');
  });

  it('ignores a frontmatter type that is not a SkillType', () => {
    const preview = parseSkillUpload('x.md', u8('---\ntype: wat\n---\n# H\ntext\n'));
    expect(preview.type).toBe('custom');
  });

  it('rejects an empty body, an unknown extension and an oversized file', () => {
    expect(() => parseSkillUpload('x.md', u8('---\nname: n\n---\n'))).toThrow(SkillImportError);
    expect(() => parseSkillUpload('skill.txt', u8('text'))).toThrow(/Only \.md/);
    expect(() => parseSkillUpload('x.md', new Uint8Array(MAX_IMPORT_BYTES + 1))).toThrow(
      /the limit is/,
    );
  });
});

describe('parseSkillUpload — archive', () => {
  const archive = () =>
    zipSync({
      'my-skill/SKILL.md': strToU8('---\ntype: security\n---\n# Zipped Skill\n\nUse it.\n'),
      'my-skill/install.sh': strToU8('rm -rf /'),
      'my-skill/bin/tool.exe': new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
      'my-skill/README.md': strToU8('# Readme'),
      '__MACOSX/._SKILL.md': strToU8('junk'),
    });

  it('extracts the skill core and reports everything else as ignored', () => {
    const preview = parseSkillUpload('pack.zip', archive());
    expect(preview.name).toBe('Zipped Skill');
    expect(preview.type).toBe('security');
    expect(preview.source_entry).toBe('my-skill/SKILL.md');
    expect(preview.ignored_entries).toEqual([
      'my-skill/README.md',
      'my-skill/bin/tool.exe',
      'my-skill/install.sh',
    ]);
  });

  it('never inflates an entry other than the core', () => {
    inflated.length = 0;
    parseSkillUpload('pack.zip', archive());

    // Pass 1 enumerates and inflates nothing; pass 2 inflates exactly the core.
    // Crucially there is no unfiltered call — that would decompress install.sh
    // and tool.exe into memory, which is the thing this feature promises not to
    // do.
    expect(inflated).toEqual([[], ['my-skill/SKILL.md']]);
  });

  it('rejects an archive with no markdown in it', () => {
    const noMd = zipSync({ 'pack/install.sh': strToU8('#!/bin/sh') });
    expect(() => parseSkillUpload('pack.zip', noMd)).toThrow(/no markdown/);
  });

  it('rejects bytes that are not a zip', () => {
    expect(() => parseSkillUpload('pack.zip', u8('not a zip at all'))).toThrow(/valid \.zip/);
  });
});

describe('the shipped sample skill', () => {
  // `test/fixtures/skills/flaky-test-guard.md` is the file the L02 walkthrough
  // imports on camera (docs/visual-test-skills.md). Parsing it here means a
  // change that breaks the demo breaks CI first, instead of on camera.
  it('parses into a complete preview', () => {
    const file = readFileSync(
      new URL('./fixtures/skills/flaky-test-guard.md', import.meta.url),
    );
    const preview = parseSkillUpload('flaky-test-guard.md', new Uint8Array(file));
    expect(preview.name).toBe('flaky-test-guard');
    expect(preview.type).toBe('rubric');
    expect(preview.description).toMatch(/^Use whenever/);
    expect(preview.body.startsWith('---')).toBe(false);
    expect(preview.body).toContain('# Flaky test guard');
  });
});

describe('decodeBase64', () => {
  it('accepts a bare base64 string and a data: URL', () => {
    const encoded = Buffer.from('# Hi', 'utf8').toString('base64');
    expect(Buffer.from(decodeBase64(encoded)).toString('utf8')).toBe('# Hi');
    expect(Buffer.from(decodeBase64(`data:text/markdown;base64,${encoded}`)).toString('utf8')).toBe(
      '# Hi',
    );
  });

  it('rejects empty content', () => {
    expect(() => decodeBase64('   ')).toThrow(SkillImportError);
  });
});
