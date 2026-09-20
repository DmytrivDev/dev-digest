/** Pure list operations for the agent's linked-skill ordering. */

import { reorderIds } from "@/lib/reorder";

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
 * Move a linked skill to the position held by another, drop-onto-row style.
 *
 * The list operation itself lives in `lib/reorder.ts` now that the skills and
 * agents grids drag too; this keeps the name the picker's callers use and the
 * one behaviour that is specific to the picker — dropping onto an UNLINKED row
 * is a no-op, because an unlinked skill has no position in the prompt.
 */
export function reorderLink(linked: readonly string[], fromId: string, toId: string): string[] {
  return reorderIds(linked, fromId, toId);
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
