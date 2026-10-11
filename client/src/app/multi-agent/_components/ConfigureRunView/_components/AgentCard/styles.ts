import type { CSSProperties } from "react";

/** Co-located styles for AgentCard. The checked border takes the agent's palette colour. */
export const s = {
  card: (checked: boolean, color: string): CSSProperties => ({
    padding: "12px 14px",
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: checked ? color : "var(--border)",
    background: "var(--bg-elevated)",
  }),
  body: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  icon: (color: string): CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: color + "1f",
    color,
    flexShrink: 0,
  }),
  text: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  description: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginTop: 2,
    lineHeight: 1.4,
  } satisfies CSSProperties,
  estimate: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
};
