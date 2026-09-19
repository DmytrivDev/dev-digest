import type { CSSProperties } from "react";
import { PAGE_MAX_WIDTH } from "./constants";

/** Co-located styles for ConventionsView (ported from the mock's artboard). */
export const s = {
  page: {
    padding: "24px 28px 44px",
    maxWidth: PAGE_MAX_WIDTH,
    margin: "0 auto",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 3,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  toolbarRight: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  banner: (tone: "error" | "success") =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 13px",
      borderRadius: 8,
      marginBottom: 16,
      fontSize: 12.5,
      color: "var(--text-secondary)",
      background: tone === "error" ? "var(--crit-bg, #2e0a0a)" : "var(--accent-bg)",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: tone === "error" ? "var(--crit)" : "var(--border)",
    }) satisfies CSSProperties,
  bannerIcon: (tone: "error" | "success") =>
    ({
      color: tone === "error" ? "var(--crit)" : "var(--accent)",
      flexShrink: 0,
    }) satisfies CSSProperties,
  bannerActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  scanHint: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 12,
  } satisfies CSSProperties,
} as const;
