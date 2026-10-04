import type React from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,
  /** The model's prose, at the mock's reading size. */
  prose: {
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,
  diagram: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies React.CSSProperties,
  legend: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "4px 14px",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies React.CSSProperties,
  /** A tiny node outline in the role's colour, matching the diagram. */
  swatch: (role: { color: string; dashed?: boolean }): React.CSSProperties => ({
    width: 12,
    height: 9,
    borderRadius: 3,
    borderWidth: 1.5,
    borderStyle: role.dashed ? "dashed" : "solid",
    borderColor: `var(${role.color})`,
    background: "var(--bg-surface)",
  }),
  diagramFallback: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  /** Measured facts sit under a divider: they are DevDigest's, not the model's. */
  factsBlock: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    paddingTop: 14,
    marginTop: 2,
  } satisfies React.CSSProperties,
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    columnGap: 18,
    rowGap: 10,
    margin: 0,
    fontSize: 12.5,
    alignItems: "start",
  } satisfies React.CSSProperties,
  factLabel: {
    color: "var(--text-muted)",
    paddingTop: 3,
  } satisfies React.CSSProperties,
  factValue: {
    margin: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    minWidth: 0,
  } satisfies React.CSSProperties,
  chip: {
    fontSize: 11.5,
    fontWeight: 500,
    padding: "2px 8px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  } satisfies React.CSSProperties,
};
