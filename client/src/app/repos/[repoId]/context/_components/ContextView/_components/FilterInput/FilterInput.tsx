/* FilterInput — the path filter of the Project Context page.

   The vendored TextInput suppresses the focus outline inline (an app-wide
   pattern that cannot be overridden from outside), which leaves keyboard users
   without a visible focus indicator (WCAG 2.4.7). This input keeps the same look
   but leaves the outline alone so the global :focus-visible ring applies. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function FilterInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name; there is no visible <label>. */
  label: string;
}) {
  return (
    <div style={s.box}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        style={s.input}
      />
      <Icon.Search size={14} />
    </div>
  );
}
