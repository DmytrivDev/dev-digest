"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { Dropdown, Icon } from "@devdigest/ui";
import { buildGraphLayout, type GraphNode } from "../../helpers";
import { GRAPH_HEIGHT, GRAPH_MAX_CALLERS, GRAPH_WIDTH } from "../../constants";
import { s } from "../../styles";

interface BlastGraphProps {
  downstream: DownstreamImpact[];
}

/** SVG three-column graph for ONE symbol: symbol → callers → endpoints/crons.
 *  A `Dropdown` picks which symbol to draw when there is more than one. */
export function BlastGraph({ downstream }: BlastGraphProps) {
  const t = useTranslations("blast");
  const [selected, setSelected] = React.useState<string | undefined>(downstream[0]?.symbol);
  const impact = downstream.find((d) => d.symbol === selected) ?? downstream[0];

  if (!impact) {
    return <div style={s.noDownstream}>{t("graph.empty")}</div>;
  }

  const { nodes, edges } = buildGraphLayout(impact, {
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    maxCallers: GRAPH_MAX_CALLERS,
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div>
      {downstream.length > 1 && (
        <Dropdown
          trigger={
            <span style={s.symbolPickerTrigger}>
              <Icon.Code size={13} />
              {t("graph.symbolPicker")}: {impact.symbol}
            </span>
          }
          items={downstream.map((d) => ({ label: d.symbol, onClick: () => setSelected(d.symbol) }))}
        />
      )}

      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        width={GRAPH_WIDTH}
        height={GRAPH_HEIGHT}
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
      >
        {edges.map((e) => {
          const from = byId.get(e.from);
          const to = byId.get(e.to);
          if (!from || !to) return null;
          return (
            <line
              key={`${e.from}->${e.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((n) => (
          <GraphNodeShape key={n.id} node={n} moreLabel={t("graph.more", { count: n.moreCount ?? 0 })} />
        ))}
      </svg>

      <div style={s.legendRow}>
        <LegendItem color="var(--text-primary)" label={t("graph.legend.symbol")} />
        <LegendItem color="var(--text-secondary)" label={t("graph.legend.callers")} />
        <LegendItem color="var(--accent)" label={t("graph.legend.endpoints")} />
        <LegendItem color="var(--warn)" label={t("graph.legend.crons")} />
      </div>
    </div>
  );
}

function GraphNodeShape({ node, moreLabel }: { node: GraphNode; moreLabel: string }) {
  const stroke =
    node.kind === "endpoint" ? "var(--accent)" : node.kind === "cron" ? "var(--warn)" : "var(--border-strong)";
  const label = node.kind === "more" ? moreLabel : node.label;
  return (
    <g>
      <circle cx={node.x} cy={node.y} r={5} fill="var(--bg-elevated)" stroke={stroke} strokeWidth={1.5} />
      <text x={node.x} y={node.y - 10} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
        {label}
      </text>
    </g>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={s.legendItem}>
      <span style={s.legendDotSwatch(color)} />
      {label}
    </span>
  );
}
