import type React from "react";

/** The copy button never changes size — see `StepRow`. */
export const COPY_BTN_SIZE = 26;

export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies React.CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies React.CSSProperties,
  commandRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--code-bg)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 7,
    padding: "6px 7px 6px 12px",
  } satisfies React.CSSProperties,
  index: {
    width: 14,
    flexShrink: 0,
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  command: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies React.CSSProperties,
  /** Anchors the floating "Copied" pill to the button without taking space. */
  copyWrap: {
    position: "relative",
    flexShrink: 0,
    display: "inline-flex",
  } satisfies React.CSSProperties,
  copiedSlot: {
    position: "absolute",
    right: "100%",
    top: "50%",
    transform: "translateY(-50%)",
    marginRight: 6,
    pointerEvents: "none",
  } satisfies React.CSSProperties,
  copiedPill: {
    display: "inline-block",
    whiteSpace: "nowrap",
    padding: "2px 7px",
    borderRadius: 5,
    fontSize: 11.5,
    fontWeight: 500,
    color: "var(--ok)",
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  } satisfies React.CSSProperties,
  copyBtn: (copied: boolean): React.CSSProperties => ({
    width: COPY_BTN_SIZE,
    height: COPY_BTN_SIZE,
    display: "grid",
    placeItems: "center",
    padding: 0,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "var(--bg-elevated)",
    color: copied ? "var(--ok)" : "var(--text-muted)",
    cursor: "pointer",
  }),
  note: {
    margin: "0 0 2px 36px",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
};
