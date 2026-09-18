import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SkillType, SKILL_LIMITS } from '@devdigest/shared';
import { SEED_SKILLS } from '../src/db/seed-skills.js';
import {
  DERIVED_DESCRIPTION_MAX,
  IMPORT_NAME_MAX,
  SKILL_BODY_MAX,
} from '../src/modules/skills/constants.js';

/**
 * The seed writes skills with `db.insert`, straight past the route schemas that
 * cap `name`, `description` and `body`. That asymmetry is not theoretical: the
 * seeded `api-contract-guard` shipped a 220-character description against a
 * 200-character cap, so the row existed, rendered fine, and was PERMANENTLY
 * unsaveable from the editor — the Config form posts every field in one patch,
 * so editing the body re-sent the over-long description and got a 422 that
 * mentioned a field the user had not touched.
 *
 * This test is the enforcement the seed path lacks. It is a unit test on
 * purpose: a database would only prove the insert succeeds, which was never in
 * doubt — the bug is that the API refuses to take the row back.
 */

/** The write contract, mirroring `CreateSkillBody` in the skills routes. */
const WritableSkill = z.object({
  name: z.string().min(1).max(IMPORT_NAME_MAX),
  description: z.string().max(DERIVED_DESCRIPTION_MAX),
  type: SkillType,
  body: z.string().min(1).max(SKILL_BODY_MAX),
});

describe('seeded skills', () => {
  it.each(SEED_SKILLS.map((s) => [s.name, s] as const))(
    '%s round-trips through the API write schema',
    (_name, skill) => {
      const parsed = WritableSkill.safeParse(skill);
      // Name the offending field in the failure — "invalid" alone sends the
      // next reader back to the route schema to work out which cap was hit.
      expect(parsed.success ? null : parsed.error.issues).toBeNull();
    },
  );

  it('keeps the route caps tied to the shared contract, so the editor agrees', () => {
    expect(IMPORT_NAME_MAX).toBe(SKILL_LIMITS.name);
    expect(DERIVED_DESCRIPTION_MAX).toBe(SKILL_LIMITS.description);
  });
});
