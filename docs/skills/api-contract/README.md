# API Contract Reviewer skills

The four skills the **API Contract Reviewer** agent carries. Each file is one
skill: a frontmatter block the importer reads, and a body that is appended
verbatim to the agent's prompt under `## Skills / rules`.

- [`breaking-change.md`](./breaking-change.md) — the request side: path, method,
  params, required-ness, accepted types, status codes.
- [`response-schema.md`](./response-schema.md) — the response side: contracts in
  `vendor/shared/contracts`, DTO mappers, nullability, enums, wrappers.
- [`semver-discipline.md`](./semver-discipline.md) — which `package.json` bump
  the diff earns, and whether it is there.
- [`deprecation-policy.md`](./deprecation-policy.md) — what a removal must show
  to be legitimate instead of silent.

All four are **seeded**: `server/src/db/seed-skills.ts` carries these bodies and
`seed.ts` links them to the API Contract Reviewer in the order above, which is
the order their blocks appear in the prompt. A fresh checkout therefore comes up
with the agent already carrying them — a skill that exists only as a file here,
or only in one developer's database, does not exist for the product.

> The DB is the source of truth at run time: a skill lives in the `skills`
> table (`body` versioned into `skill_versions`). These files are the
> human-readable originals — the same relationship `docs/agent-prompts/` has to
> `agents.system_prompt`. When you change a rule, edit the file here, mirror it
> into `seed-skills.ts` (so a fresh checkout agrees), **and** push it to the
> already-seeded skill — the seed never overwrites a row that exists, by design,
> so editing the literal does not heal a database that already ran it.

## Getting one into the app

Every file here is import-ready as is: `Skills → Import` accepts the `.md`
directly, and `server/src/modules/skills/import-parse.ts` reads the frontmatter
as flat `key: value` pairs. The others are created through the skill form by
pasting the same three fields and the body.

Limits the write path enforces (`SKILL_LIMITS` in
`vendor/shared/contracts/knowledge.ts`): `name` ≤ 120 chars, `description`
≤ 200 chars, `type` ∈ `rubric | convention | security | custom`. A description
over 200 is not a warning — the editor can never save the skill again.

## Writing rules for these files

- `description` is the skill's interface: it tells the model WHEN the block
  applies. Write it as an instruction ("Use when the diff…"), not a summary.
- Every rule is about something visible in a diff, with a short bad/good pair
  in this repository's own shapes: a Fastify route with `schema: { body,
  params, querystring }`, a Zod contract, a DTO mapper, snake_case on the wire.
- No output format, no severity scale, no "return findings" instructions. The
  response schema is enforced out of band and the agent prompt owns severity —
  see `docs/agent-prompts/README.md`, "The output schema is NOT in the prompt".
- Keep each body around 4 KB. Skill bodies are pasted into the prompt, and the
  run trace shows what each block costs in tokens.
- The agent prompt (`docs/agent-prompts/api-contract-reviewer.md`) deliberately
  contains NONE of these rules. That is what makes the control run meaningful:
  the same agent without the skills must miss the breaking change.
