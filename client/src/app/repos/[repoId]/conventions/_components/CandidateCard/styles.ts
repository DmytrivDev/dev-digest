import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";
import { STATUS_RAIL } from "./constants";

/** Co-located styles for CandidateCard (ported from the mock's ConventionCard). */
export const s = {
  // All-longhand borders on purpose: mixing `border` with `borderLeftColor`
  // makes React warn and the card flicker between renders.
  card: (status: ConventionStatus) =>
    ({
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "var(--border)",
      borderLeftWidth: 3,
      borderLeftColor: STATUS_RAIL[status],
      borderRadius: 9,
      background: "var(--bg-elevated)",
      padding: 16,
      marginBottom: 12,
      opacity: status === "rejected" ? 0.75 : 1,
    }) satisfies CSSProperties,
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  tags: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  rule: {
    fontSize: 14,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.4,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  evidence: {
    marginTop: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 10px",
    background: "var(--bg-surface)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  } satisfies CSSProperties,
  evidenceText: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 11.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    overflow: "auto",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  confidence: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  } satisfies CSSProperties,
  confidenceLabel: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  confidenceValue: { fontSize: 11, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    flexShrink: 0,
    width: 150,
  } satisfies CSSProperties,
} as const;
