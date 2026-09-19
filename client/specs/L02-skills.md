# L02 — Skills: the Skills page, the editor, and the agent's Skills tab

Three surfaces over the same object: a list you browse, an editor you write in,
and a picker that decides which skills an agent carries and in what order. The
body is the whole skill — the editor makes that obvious, and the preview shows
it exactly as the reviewing agent receives it. **Nothing here is saved
implicitly**, and an imported skill is never enabled by the act of importing it.

## Requirements

### R1 — `/skills` is a grid of cards
The list mirrors the agents list: the same page chrome (title, subtitle, search
box, `Add Skill` dropdown) and the same responsive `SkillCard` grid, with
`Skeleton` / `ErrorState` / `EmptyState` for the three empty states. A card
shows the type-tinted icon, the mono name, the description, the type and source
chips, the version, the number of agents carrying it, an **enabled** toggle and
a delete button. Toggle and delete stop propagation so they never open the card.
Disabled cards are dimmed.

The agent count comes from the list endpoint, which counts every link in one
grouped query. A single-skill read does not count, and the contract lets the
field be absent for exactly that case — the card then shows **no badge**, since
a 0 that was never counted is a claim the data did not make.

Deleting asks first, in the app's own `ConfirmDialog` rather than
`window.confirm`: a browser dialog cannot be styled, cannot be dismissed any
way but its own two buttons, and forces every test that touches delete to stub
a global. The first click only opens the dialog; nothing is deleted until its
`Delete skill` button is pressed, and neither click may open the card beneath.

An imported skill that is still disabled carries a `needs vetting` badge. Once
enabled it does not — the badge means "you have not read this yet", and a badge
that never goes away is a badge nobody reads.

### R2 — A card click opens the body beside the list
Clicking a card opens a **read-only side panel** showing the skill's body
rendered exactly as the Preview tab renders it, with the type and source chips,
the version, the agent count, and one button — `Open editor` — that navigates
to `/skills/:id`.

**This reverses the first revision of R2**, which navigated on click and argued
against any drawer. That argument was aimed at a drawer that duplicated the
Preview tab *and* offered a way to edit: two steps and two renderings for one
destination. The panel specified here is not that. Browsing skills is a reading
task — you open several in a row to find the one that says what you meant — and
a navigation per skill makes you find your place in the list again each time.
The duplication objection is answered by the panel being **read-only**:
`/skills/:id` remains the single place a body can be written, so there is never
a second editor to keep in step.

The panel holds the skill's **id**, not a copy of the row: the list refetches
underneath it (a toggle elsewhere, a window focus), and a panel rendering the
snapshot it opened with would quietly show a stale body.

A skill with an empty body says so rather than rendering a blank panel, and an
imported one carries the notice explaining that its text goes into an agent's
prompt verbatim.

### R3 — `/skills/:id` mirrors the agent editor
A 280px rail of `SkillCard`s on the left, the editor on the right, tab state in
`?tab=`, and `Tabs` = **Preview · Config · Stats · Versions**. Switching skills
remounts the form via `key={skill.id}` rather than mirroring props into state
with an effect.

Preview is first because it is also the landing tab, and the default is derived
from the list (`DEFAULT_TAB = TABS[0].key`) so the two cannot drift: opening a
skill from the list is a request to read it, and a strip whose first tab is not
the one that opened reads as a wrong turn. The mock's **Evals** tab belongs to a
later lesson and is not rendered as a placeholder — a tab that shows nothing is
worse than no tab.

### R4 — Config makes the body the point
Name (mono), Description, Type and the body, plus the enabled toggle and the
current version. The body sits in a bar-topped editor showing `<name>.md`, an
`unsaved` marker while it differs from the saved text, and a `~N tokens`
estimate so a skill's cost is visible while writing it — labelled `~` because
the authoritative count is the tokenizer's, in the run trace.

The description field carries the hint that it is the skill's **interface** and
must be phrased as an instruction, because that is what tells the agent when the
rules apply.

`Save` is disabled until something actually changed and sends every field in one
patch; `Revert` restores all of them. The "saving snapshots the body as v{n+1}"
note appears only when the **body** changed, because only a body change is
versioned. A delete danger zone sits below, behind a confirm, and returns to
`/skills`.

### R5 — Preview renders what the agent gets
A single card with the body as markdown under "Rendered as the reviewing agent
receives it", preceded by the untrusted-source notice when the skill was
imported and is still disabled.

### R6 — Import is preview-then-confirm
`Add Skill → Import from a file` opens a drawer with a file picker limited to
`.md`, `.markdown` and `.zip`. The file is read in the browser
(`FileReader.readAsDataURL`) and posted as JSON to the server's preview
endpoint — `lib/api.ts` has no multipart branch and does not grow one.

Until a preview comes back, **Save is disabled**. The preview shows the derived
name, type, the archive entry the body came from, the body rendered as markdown,
and the full list of entries the server refused to open, under wording that says
they are never opened and never run. Confirming saves with
`source: "imported_url"` and `enabled: false`, and a toast says so. A rejected
file (unsupported type, no markdown, too large) is shown inline in the drawer,
not as a system toast, because it is expected input rather than a failure.

Oversized files are rejected client-side before the round trip.

### R7 — The agent editor gains a Skills tab
`/agents/:id?tab=skills` lists every workspace skill with the **linked ones
first, in prompt order, numbered**, then the rest. A checkbox attaches or
detaches; attaching appends, so a new skill lands last in the prompt.

Reordering is a **drag on a handle** (`Icon.Menu`, `cursor: grab`) present on
every linked row. Dragging a row onto another moves it into that row's place;
the list reorders live under the pointer, so the drop indicator is the list
itself rather than a separate line. An unlinked row is not draggable — it has no
position in the prompt — and dropping onto one is a no-op by construction, not
by a guard.

The handle is a `<button>`, and `↑` / `↓` on it performs the same move. HTML5
drag-and-drop is pointer-only, so without that the feature would trade one group
of users for another.

Only the drag **in flight** is React state. The order stays server-owned — the
displayed list is `reorderLink(saved, dragged, hovered)` computed during render,
because a local copy of the saved order is a second source of truth that drifts
the moment a save fails.

Every change posts the whole ordered set to `POST /agents/:id/skills`, which
replaces it in one transaction — attach, detach and reorder cannot leave an
agent halfway. A linked skill that is globally disabled stays listed and marked
`disabled`, because it is attached but left out of the prompt. The header shows
`{linked} of {total} enabled` and a filter box.

### R8 — Skills are reachable and the trace shows their cost
A `SKILLS LAB` sidebar section links `/skills` with the `g s` shortcut, and it
appears in the command palette through the same `NAV` entry. In the run trace's
prompt-assembly section, each block that reported a token count renders it
(`1,234 tokens`, grouped with the app locale, never a bare `toLocaleString()`);
a slot with no reported count renders no badge rather than `0 tokens`.

### R9 — The run trace names the skills it carried
The Trace tab carries a **Skills used** section directly above *Prompt
assembly*: that section shows the assembled text, this one says where the text
came from. One row per linked skill, in prompt order — position, mono name
linking to `/skills/:id`, type chip, source icon, `v{n}`, and the tokens that
skill's block contributed.

Two states must stay distinguishable, because they are different facts:

- a skill **attached but disabled** shows a `skipped` badge and **no** token
  count — it contributed no block, which is what the toggle means;
- an **imported** skill shows an `untrusted` badge, because its body was
  delimiter-wrapped before the model saw it.

The section reads the trace's own `skills_used` snapshot, never the agent's
current links, so a skill edited or detached since the run still reports what
that run actually used. A trace written before the field existed renders **no
section at all** — absent is not the same as none, and claiming zero would
invent a fact.

### R10 — The editor's Versions tab is the body's history
`?tab=versions` lists every body snapshot, newest first: the `v{n}` chip, the
timestamp, a `Current` badge on the version the skill row is on, and
`Diff` / `Restore` on the others.

`Current` tracks `skill.version`, not "the newest snapshot" — a metadata-only
edit writes no snapshot, so the two are only comparable by number.

`Diff` opens the snapshot against the body in the editor as a line diff, and
says so plainly when they are identical rather than showing an empty panel.
`Restore` confirms first and then writes the old text **forward** as a new
version; the history is never rewound, because a run that cited v3 has to stay
explainable.

### R11 — The editor's Stats tab is honest about what it measures
Four headline numbers — `USED BY`, `RUNS (30D)`, `FINDINGS (30D)`, `ACCEPT RATE`
— plus the agents currently carrying the skill, a category donut and a severity
breakdown.

The honesty rules are part of the requirement, not polish:

- `ACCEPT RATE` renders `—`, never `0%`, when nothing has been triaged. A zero
  over zero decisions is an accusation the data never made.
- A footnote states that a run carries several skills at once, so these are
  findings from runs whose prompt **included** this skill, not findings it
  caused. The mock's `PULL FREQUENCY` card is deliberately **not** built: it
  would imply per-skill retrieval that does not exist.
- A skill never linked and never run gets the empty state, not a wall of zeros.

### R12 — A rejected save says which field and why
The global error toast expands a `validation_error`'s `details` into
`field — reason`, instead of showing only `Request validation failed`.

This is not cosmetic. The Config form posts **every** field in one patch (R4),
so an invalid value in a field the user never touched fails the save — and
without the field name the message is indistinguishable from a bug in the app.
Name and description also carry a live `{n}/{max}` counter (from the shared
`SKILL_LIMITS`) that turns red over the cap, and Save is blocked while either is
over, so a value that arrived over the cap from the API is legible rather than a
dead end.

## Acceptance criteria

1. `/skills` renders a card per skill with name, description, type, source,
   version, agent count and a working enabled toggle; searching filters on name,
   description and type. A skill nobody links shows a counted `No agents`; a
   skill whose count was not reported shows no badge at all.
2. A disabled imported skill shows `needs vetting`; the same skill enabled, and
   a disabled hand-written skill, do not.
3. Clicking a card opens the read-only side panel with the body rendered and
   navigates nowhere; `Open editor` in the panel navigates to `/skills/:id`, and
   closing it navigates nowhere either. A list that changes under an open panel
   is reflected in it. The editor's first tab is Preview and it is what `?tab=`
   defaults to.
4. Deleting a skill or an agent from its card asks in an in-app dialog with
   confirm / cancel / close; cancelling deletes nothing and opens nothing.
5. In Config, `Save` is disabled on a pristine form, enabled after any change,
   and sends name + description + type + body + enabled in one patch; `Revert`
   returns the form to pristine.
6. The `v{n+1}` note and the `unsaved` marker appear for a body edit and not for
   a name edit.
7. The import drawer cannot save before a preview exists; the preview lists
   every skipped archive entry; confirming saves `source: "imported_url"` with
   `enabled: false`; a rejected file shows inline and leaves Save disabled.
8. The agent Skills tab lists linked skills first in order; ticking appends;
   unticking removes; dragging a linked row onto another reorders it and posts
   the complete ordered set exactly once, on drop; dragging over several rows
   without dropping saves nothing, and ending the drag without a drop abandons
   the reorder; an unlinked row is not draggable and its handle is disabled;
   `↑` / `↓` on a focused handle performs the same move and saves nothing when
   it would fall off either end.
9. The run trace shows a token badge on the Skills block and none on a slot with
   no count.
10. The trace's Skills used section lists each skill with its version and token
   cost, marks a disabled one `skipped` with no token count, marks an imported
   one `untrusted`, and does not render at all for a trace that predates the
   field.
11. The Versions tab lists snapshots newest-first, marks the skill's own version
    `Current`, diffs an older one against the current body, and restoring writes
    a new version rather than rewinding.
12. The Stats tab shows `—` for an untriaged accept rate, keeps the
    co-occurrence caveat on screen, and shows the empty state for a skill with
    no links and no runs.
13. A 422 toast names the offending field and its reason; the name and
    description fields show a character counter that turns red over the cap and
    block Save while it is.
14. `pnpm typecheck` and `pnpm test` pass; the card, every editor tab, the
    import flow, the Skills tab's drag and keyboard reordering, the trace's
    token badge and Skills used section, the line diff and the error formatter
    all have coverage.
