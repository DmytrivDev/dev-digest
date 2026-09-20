/** Pure list reordering shared by every drag-to-sort surface. */

/**
 * Move `fromId` to the position currently held by `toId`.
 *
 * Drop-onto-item semantics, which is what a pointer actually expresses: the
 * dragged item takes the target's place and everything between shifts by one.
 * Because the element is removed before it is re-inserted, dragging DOWN lands
 * it after the target and dragging UP lands it before — the behaviour a user
 * reads off the list as it moves under the cursor.
 *
 * Returns the same contents when either id is missing or they are equal, so a
 * drop on empty space or on itself is a no-op by construction rather than by a
 * guard every caller has to remember.
 *
 * Promoted here from the agent's skill picker on its second use (the skills and
 * agents grids); `SkillsTab`'s `reorderLink` is this function under its old name.
 */
export function reorderIds(ids: readonly string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
