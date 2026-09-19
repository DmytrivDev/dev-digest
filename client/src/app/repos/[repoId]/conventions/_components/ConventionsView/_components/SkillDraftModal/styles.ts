import type { CSSProperties } from "react";

/** Co-located styles for SkillDraftModal. */
export const s = {
  body: { padding: "18px 22px 8px" } satisfies CSSProperties,
  explain: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 13px",
    borderRadius: 8,
    background: "var(--accent-bg)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    marginBottom: 18,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  status: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", padding: "12px 0" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
