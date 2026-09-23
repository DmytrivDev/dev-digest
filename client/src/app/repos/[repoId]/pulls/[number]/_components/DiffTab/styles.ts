import type { CSSProperties } from "react";

export const s = {
  /** Wraps the "Show/Hide notes" button + the order toggle in the section's right slot. */
  actionsRow: { display: "inline-flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  /** Wraps the two order-toggle buttons ("Smart order" / "Original order"). */
  toggleGroup: { display: "inline-flex", gap: 4 } satisfies CSSProperties,
  /** Wraps the stack of SmartDiffGroups in smart-order mode. */
  groupWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginTop: 14,
  } satisfies CSSProperties,
} as const;
