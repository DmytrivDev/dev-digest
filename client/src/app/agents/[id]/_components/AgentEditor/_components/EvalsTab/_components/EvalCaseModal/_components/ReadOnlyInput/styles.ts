import type { CSSProperties } from "react";
import type { DiffLineKind } from "../../helpers";

export const s = {
  diff: {
    margin: 0,
    fontSize: 11.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  diffLine: (kind: DiffLineKind): CSSProperties => ({
    display: "block",
    backgroundColor:
      kind === "added" ? "var(--code-add)" : kind === "removed" ? "var(--code-del)" : "transparent",
    color: kind === "hunk" ? "var(--accent-text)" : "inherit",
  }),
  metaLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  metaValue: {
    fontSize: 13,
    color: "var(--text-primary)",
    marginBottom: 14,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
