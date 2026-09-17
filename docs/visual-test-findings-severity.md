# Visual test — findings severity (pills, filter, PR-list column)

Manual end-to-end check of the severity-counter feature on its two surfaces:
the per-run pill row in *Review runs*, and the `FINDINGS` column + hover preview
on the PR list. Unlike the run-cost check, this one **spends nothing** — every
step is a read over findings that already exist. Step 4 is the evidence for the
"no LLM call" criterion, so keep the API log visible throughout.

## 0. Preconditions

| Check | Command | Expected |
|---|---|---|
| API up | `curl localhost:3001/health` | `{"status":"ok"}` |
| Web up | open http://localhost:3000 | studio renders |
| Migrations applied | `cd server && pnpm db:migrate` | `✓ migrations applied` |
| Seeded findings present | `curl -s localhost:3001/repos/<repoId>/pulls \| jq '.[] \| {number, findings}'` | PR 482 → `{"critical":1,"warning":1,"suggestion":0}` |

No migration ships with this feature — the breakdown is computed on read — but
the dev DB still has to be migrated from the run-cost work.

**Do NOT press Refresh / Re-index on the seeded `acme/payments-api`.** That repo
does not exist on GitHub; the failed clone job takes the whole API process down
(see `server/INSIGHTS.md`). Reviews on its seeded PR are safe.

If a change seems to have no effect while `pnpm typecheck` / `pnpm test` agree
with your source, **restart `pnpm dev`** — on Windows a long-running Next dev
server can serve a stale compiled chunk indefinitely.

## 1. Pills appear, and only for severities that exist

1. Open PR #482 → **Agent runs** → **Review runs** → click the run card to expand it.
2. The pill row sits directly under the verdict banner, above the finding cards.

✅ **Pass:** with the seeded review you see exactly **two** pills — `CRITICAL 1`
and `WARNING 1`. There is **no** `SUGGESTION 0` pill: a level with nothing in it
renders nothing at all.

## 2. Every number equals the cards below it

Count the finding cards of each severity in that same card and compare.

✅ **Pass:** each pill's number equals the number of cards of that severity
rendered below it **in this run's card** — not the PR's total across runs. With
a second run expanded, its pills describe its own findings only.

## 3. Click to filter, click again to clear

1. Click `CRITICAL` → only critical cards remain; the pill reads as active.
2. Click `CRITICAL` again → the full list returns.
3. Click `CRITICAL`, then `WARNING` → the filter **swaps**; you never end up with
   an empty list from two stacked filters.

✅ **Pass:** all three behave as described, and filtering one run's card leaves
every other run's card untouched.

## 4. `Hide low confidence` — and the no-LLM evidence

1. With the API log / browser Network tab open, toggle `Hide low confidence` on.
2. Re-count: the pills must still match the cards. A severity whose findings
   were all low-confidence loses its pill entirely.
3. If that severity was the active filter, the filter clears itself — you are
   never stranded on an empty list with no pill to click back out of.

✅ **Pass (this is criterion 19):** across steps 1–4 — expanding the card,
clicking every pill, toggling `hideLow` — the log shows **no request to the
model provider**, and in fact no new API request at all: the findings were
already on the page.

## 5. Surface 2 — the PR-list FINDINGS column

Go to `/repos/<repoId>/pulls`.

✅ **Pass:**
- the header reads `PULL REQUEST · AUTHOR · SIZE · SCORE · FINDINGS · STATUS · COST · UPDATED`;
- `FINDINGS` sits between `SCORE` and `STATUS`;
- header and row cells line up in one grid — no drift at the right edge;
- PR 482 shows a red `1` and an amber `1`, and no suggestion icon;
- a PR nobody has reviewed shows `—`, never a row of zeros.

Cross-check the payload:
`curl -s localhost:3001/repos/<repoId>/pulls | jq '.[] | {number, score, findings}'`
must return exactly what the two columns render.

## 6. Surface 2 — the hover preview

Hover the FINDINGS icons of PR 482.

✅ **Pass:**
- a popup appears headed `2 FINDINGS IN THIS RUN`;
- each entry shows severity badge, title, category, `file:line`, `% confidence`
  and a two-line description;
- there are **no buttons of any kind** — no Accept, no Reject, nothing clickable;
- clicking inside the popup does **not** navigate to the PR;
- for a row in the lower half of the table the popup opens **upwards**, so it is
  never cut off at the bottom of the window.

## 7. Re-review replaces, it does not accumulate

Run a review on PR 482 again and reload the list.

✅ **Pass:** `FINDINGS` now describes the **newest** run — it does not add the
old run's findings to the new ones (that is COST's behaviour, not this column's).
The PR page still keeps every run with its own pills.

## Overall success criteria

The feature passes when all of the following hold:

1. Pills render only for severities that occur, and each number equals the cards
   below it in that same run card — with `hideLow` on or off.
2. A pill click filters, a second click clears, and the state is per run.
3. Nothing in steps 1–4 issues a model call.
4. The PR-list column matches the API payload and describes the same review as
   the SCORE ring next to it.
5. Missing (`—`) and clean (`{0,0,0}` → `—`) are never rendered as a fake `0` count.
6. The hover preview is text-only and contains zero interactive elements.
7. The list table stays aligned with the new column at desktop width.
