import { SKILL_LIMITS } from '@devdigest/shared';

/** Version a freshly created skill starts at (mirrors INITIAL_AGENT_VERSION). */
export const INITIAL_SKILL_VERSION = 1;

/**
 * Window the Stats tab covers by default, in days.
 *
 * Matches the mock's "FINDINGS (30D)". A window rather than all-time on
 * purpose: a skill edited last week should not be judged on runs that used a
 * body it no longer has.
 */
export const DEFAULT_STATS_WINDOW_DAYS = 30;

/** Widest window the stats endpoint will accept, in days. */
export const MAX_STATS_WINDOW_DAYS = 365;

/** Type a skill falls back to when an import declares none we recognise. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/**
 * Largest DECODED upload the importer will look at, in bytes.
 *
 * The app's global `bodyLimit` is 1 MB (app.ts) and base64 inflates by 4/3, so
 * anything above ~750 KB decoded could never have reached us anyway. Capping at
 * 512 KB keeps a comfortable margin for the JSON envelope and gives the user a
 * clear 422 instead of Fastify's opaque payload-too-large.
 */
export const MAX_IMPORT_BYTES = 512 * 1024;

/**
 * Largest single archive entry we will decompress. A zip can claim a tiny
 * compressed size and expand to gigabytes; we read exactly one entry, and only
 * when its declared uncompressed size is sane.
 */
export const MAX_ENTRY_BYTES = MAX_IMPORT_BYTES;

/**
 * Longest description an import may produce, whether it was DERIVED from the
 * body or declared in frontmatter.
 *
 * It applies to both on purpose: the description is rendered into the review
 * prompt, so an uncapped frontmatter field is an uncapped attacker-controlled
 * string in the model's context. Capping only the derived one would leave the
 * easier path wide open.
 *
 * The NUMBER comes from `@devdigest/shared` so the editor can warn before the
 * round trip instead of only learning the cap from a 422. Anything that writes
 * a skill WITHOUT going through the routes — the seed does, straight through
 * Drizzle — must respect it too; `test/seed-skills.test.ts` is what enforces
 * that, after a 220-character seeded description made one skill permanently
 * unsaveable from the editor.
 */
export const DERIVED_DESCRIPTION_MAX = SKILL_LIMITS.description;

/** Longest name an import may produce. Also prompt-rendered, also capped. */
export const IMPORT_NAME_MAX = SKILL_LIMITS.name;

/**
 * Longest body a skill may carry, in characters.
 *
 * Mirrors the import size cap so a skill created straight through the API
 * cannot grow the review prompt beyond what an imported one is allowed to. The
 * route schemas enforce this, not just the importer: `POST /skills` and
 * `PUT /skills/:id` are the real persistence boundary, and a limit that lives
 * only in the parser is a limit anyone can skip by calling the API directly.
 */
export const SKILL_BODY_MAX = MAX_IMPORT_BYTES;
