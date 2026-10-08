import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseAction. */
export const s = {
  // A disabled button receives no hover events, so the tooltip (`title`) sits on
  // this wrapper instead of on the button.
  tooltipWrap: { display: "inline-flex" } satisfies CSSProperties,
} as const;
