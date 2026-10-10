/* MiniBar — the bar + value of a metric cell (mock: screen_skills.jsx MiniBar,
   composed from tokens; DR-22). A null metric draws an empty track and "n/a". */
import React from "react";
import { formatMetric } from "@/lib/eval";
import { s } from "./styles";

export function MiniBar({ value, color }: { value: number | null; color: string }) {
  return (
    <div style={s.wrap}>
      <div style={s.track}>{value != null && <div data-testid="mini-bar-fill" style={s.fill(value, color)} />}</div>
      <span className="mono tnum" style={s.value}>
        {formatMetric(value)}
      </span>
    </div>
  );
}
