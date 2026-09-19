/** Pure list operations for the agent's linked-skill ordering. */

/** Toggle a skill's membership. Attaching appends, so it lands last in the prompt. */
export function toggleLink(linked: readonly string[], skillId: string): string[] {
  return linked.includes(skillId)
    ? linked.filter((id) => id !== skillId)
    : [...linked, skillId];
}

/**
 * Move a linked skill one place towards the front (-1) or the back (+1).
 *
 * Returns the SAME array contents when the move would fall off either end, so
 * the caller can compare and skip a pointless save.
 */
export function moveLink(linked: readonly string[], skillId: string, delta: -1 | 1): string[] {
  const from = linked.indexOf(skillId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= linked.length) return [...linked];
  const next = [...linked];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Move `fromId` to the position currently held by `toId`.
 *
 * Drop-onto-row semantics, which is what a pointer actually expresses: the
 * dragged skill takes the target's place and everything between shifts by one.
 * Because the element is removed before it is re-inserted, dragging DOWN lands
 * it after the target and dragging UP lands it before — the behaviour a user
 * reads off the drop indicator.
 *
 * Returns the same contents when either id is not linked, so dropping onto an
 * unlinked row in the shared picker list is a no-op by construction rather than
 * by a guard the caller has to remember.
 */
export function reorderLink(linked: readonly string[], fromId: string, toId: string): string[] {
  const from = linked.indexOf(fromId);
  const to = linked.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return [...linked];
  const next = [...linked];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Order the pickable list: linked skills first in prompt order, then the rest.
 *
 * Putting the linked ones on top is what makes the order visible — it is the
 * order the blocks appear in the assembled prompt, not an alphabetical list
 * with checkmarks scattered through it.
 */
export function orderForPicker<T extends { id: string }>(
  skills: readonly T[],
  linked: readonly string[],
): T[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const head = linked.map((id) => byId.get(id)).filter((s): s is T => s !== undefined);
  const headIds = new Set(head.map((s) => s.id));
  return [...head, ...skills.filter((s) => !headIds.has(s.id))];
}
