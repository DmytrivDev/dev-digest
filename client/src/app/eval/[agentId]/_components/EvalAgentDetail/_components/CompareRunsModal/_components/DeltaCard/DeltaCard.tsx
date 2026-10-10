/* DeltaCard — one of the four compare cards: RECALL / PRECISION / CITATION as
   old % → new % with the change in whole points, COST as old $ → new $ with
   the change in dollars (AC-98). The text is pre-formatted by the caller. */
import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

interface Props {
  testId: string;
  label: string;
  oldText: string;
  newText: string;
  /** Colour of the new value (the metric's colour). */
  color: string;
  /** Sign of the change; null → no change shown (a side was n/a). */
  direction: "up" | "down" | "flat" | null;
  deltaText: string;
  /** Colour of the change: green/red for a metric, neutral for cost (a rise is not "good"). */
  deltaColor: string;
}

export function DeltaCard({ testId, label, oldText, newText, color, direction, deltaText, deltaColor }: Props) {
  const DeltaIcon =
    direction === "up" ? Icon.ArrowUp : direction === "down" ? Icon.ArrowDown : Icon.Slash;
  return (
    <div data-testid={testId} style={s.card}>
      <div style={s.label}>{label}</div>
      <div style={s.values}>
        <span className="tnum" style={s.oldValue}>
          {oldText}
        </span>
        <Icon.ArrowRight size={14} style={s.arrow} />
        <span className="tnum" style={s.newValue(color)}>
          {newText}
        </span>
        {direction && (
          <span style={s.delta(deltaColor)}>
            <DeltaIcon size={12} />
            <span className="tnum">{deltaText}</span>
          </span>
        )}
      </div>
    </div>
  );
}
