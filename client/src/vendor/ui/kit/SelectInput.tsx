import React from "react";
import { Icon } from "../icons";

/** REAL controlled <select>. */
export function SelectInput({
  value,
  onChange,
  options,
  mono = true,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: (string | { value: string; label: string })[];
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 7,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
        position: "relative",
      }}
    >
      <select
        className={mono ? "mono" : undefined}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          flex: 1,
          fontSize: 14,
          color: "var(--text-primary)",
          // NOT transparent: the popup the browser opens inherits the select's
          // own colours, and a transparent one falls back to the UA's white.
          // `color-scheme` on the theme root does the rest (vendor/ui/styles.css).
          backgroundColor: "var(--bg-elevated)",
          border: "none",
          outline: "none",
          appearance: "none",
          cursor: "pointer",
        }}
      >
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option
              key={v}
              value={v}
              // Chromium honours these on the option rows themselves; Firefox
              // and Safari take the colour from `color-scheme`. Both paths are
              // needed for the list to be readable in a dark theme.
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)" }}
            >
              {l}
            </option>
          );
        })}
      </select>
      <Icon.ChevronsUpDown size={14} style={{ color: "var(--text-muted)", pointerEvents: "none" }} />
    </div>
  );
}
