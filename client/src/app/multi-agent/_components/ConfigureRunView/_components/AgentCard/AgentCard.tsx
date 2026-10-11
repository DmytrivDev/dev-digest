/* AgentCard — a checkbox card for one enabled agent (SPEC-08 AC-5, AC-29).
   The whole content sits in the Checkbox label, so a click anywhere on the text
   toggles it exactly once. Agent text renders as plain text (AC-42). */
"use client";

import React from "react";
import { Checkbox, Icon } from "@devdigest/ui";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import { agentColor, cardEstimate } from "@/lib/multi-agent";
import { s } from "./styles";

export function AgentCard({
  agent,
  index,
  checked,
  estimate,
  onChange,
}: {
  agent: Agent;
  /** Position among the enabled agents; picks the palette colour. */
  index: number;
  checked: boolean;
  estimate: AgentRunEstimate | undefined;
  onChange: (checked: boolean) => void;
}) {
  const color = agentColor(index);
  return (
    <div style={s.card(checked, color)}>
      <Checkbox
        checked={checked}
        onChange={onChange}
        ariaLabel={agent.name}
        label={
          <span style={s.body}>
            <span style={s.icon(color)}>
              <Icon.Cpu size={16} />
            </span>
            <span style={s.text}>
              <div style={s.name}>{agent.name}</div>
              {agent.description && <div style={s.description}>{agent.description}</div>}
            </span>
            <span className="mono tnum" style={s.estimate}>
              {cardEstimate(estimate)}
            </span>
          </span>
        }
      />
    </div>
  );
}
