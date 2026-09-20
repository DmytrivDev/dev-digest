/* useDragReorder — drag-to-sort behaviour for a list of identified rows.

   Extracted when the second grid needed it (skills and agents): the pure list
   math already lived in `lib/reorder.ts`, and leaving the stateful half copied
   into both views meant every later fix — touch support, keyboard reordering,
   a drop indicator — would have to be made twice and could drift.

   It owns behaviour and returns no styles: the wrapper still looks the way its
   own `styles.ts` says, so the hook never has an opinion about appearance. */
"use client";

import React from "react";
import { reorderIds } from "../reorder";

interface DragReorder<T> {
  /** The list as it should be rendered right now — saved order, or the live preview under the pointer. */
  ordered: T[];
  /** Spread onto each row's wrapper. */
  rowProps: (id: string) => {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** True for the row being dragged, so the caller can dim it. */
  isDragging: (id: string) => boolean;
}

/**
 * `enabled` false makes every row undraggable — callers switch it off while a
 * filter is active, because saving an order derived from a partial list would
 * write positions for rows nobody can see.
 *
 * Only the drag IN FLIGHT is state. `ordered` is derived from `items` on every
 * render, so an abandoned drag or a failed save cannot leave a local order
 * behind that disagrees with the server.
 */
export function useDragReorder<T extends { id: string }>(
  items: readonly T[],
  { enabled, onCommit }: { enabled: boolean; onCommit: (ids: string[]) => void },
): DragReorder<T> {
  const [drag, setDrag] = React.useState<{ from: string; over: string } | null>(null);

  const ordered = React.useMemo(() => {
    if (!drag) return [...items];
    const byId = new Map(items.map((item) => [item.id, item]));
    return reorderIds(
      items.map((item) => item.id),
      drag.from,
      drag.over,
    )
      .map((id) => byId.get(id))
      .filter((item): item is T => item !== undefined);
  }, [items, drag]);

  const rowProps = React.useCallback(
    (id: string) => ({
      draggable: enabled,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        setDrag({ from: id, over: id });
      },
      onDragOver: (e: React.DragEvent) => {
        if (!drag) return;
        // Without preventDefault the browser refuses the drop outright.
        e.preventDefault();
        if (drag.over !== id) setDrag({ from: drag.from, over: id });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (drag) onCommit(ordered.map((item) => item.id));
        setDrag(null);
      },
      // Ending a drag without a drop abandons it: nothing was saved, so
      // dropping the preview restores the saved order.
      onDragEnd: () => setDrag(null),
    }),
    [enabled, drag, ordered, onCommit],
  );

  return { ordered, rowProps, isDragging: (id: string) => drag?.from === id };
}
