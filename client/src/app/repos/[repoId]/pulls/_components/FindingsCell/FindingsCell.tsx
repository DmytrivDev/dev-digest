/* FindingsCell — the PR list's FINDINGS column. Ported from screen_dashboard.jsx.

   Shows the severity breakdown of the PR's LATEST review (the same review the
   SCORE ring next to it comes from), rendering only the levels that actually
   occur. Hovering reveals a read-only preview of those findings. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import type { PrMeta } from "@/lib/types";
import { FindingsTooltip } from "../FindingsTooltip";
import { s } from "../../styles";

type Counts = NonNullable<PrMeta["findings"]>;

/** Pill severity ↔ its key in the wire payload, in display order. */
const CELL_SEVERITIES: [Severity, keyof Counts][] = [
  ["CRITICAL", "critical"],
  ["WARNING", "warning"],
  ["SUGGESTION", "suggestion"],
];

export function FindingsCell({ pr, placement = "down" }: { pr: PrMeta; placement?: "up" | "down" }) {
  const [hover, setHover] = React.useState(false);
  const counts = pr.findings;
  const present = counts ? CELL_SEVERITIES.filter(([, key]) => counts[key] > 0) : [];

  // No review yet (null) or a clean one ({0,0,0}) — both read as "nothing to show".
  if (present.length === 0) return <span style={s.muted}>—</span>;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={s.findingsCell}
    >
      {present.map(([severity, key]) => {
        const meta = SEV[severity];
        const I = Icon[meta.icon];
        return (
          <span key={severity} style={s.findingsCount(meta.c)}>
            <I size={12} />
            <span className="tnum">{counts![key]}</span>
          </span>
        );
      })}
      {hover && pr.id && <FindingsTooltip prId={pr.id} placement={placement} />}
    </div>
  );
}

export default FindingsCell;
