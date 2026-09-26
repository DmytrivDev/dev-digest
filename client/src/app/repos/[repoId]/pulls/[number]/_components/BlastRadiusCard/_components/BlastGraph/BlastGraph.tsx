"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Handle, Position, ReactFlow, type NodeProps, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import type { DownstreamImpact } from "@devdigest/shared";
import { Dropdown, Icon } from "@devdigest/ui";
import { buildGraphLayout, toFlow, type BlastFlowNode } from "../../helpers";
import { GRAPH_LEGEND_COLOR, s } from "../../styles";

interface BlastGraphProps {
  downstream: DownstreamImpact[];
}

/** Module-level so React Flow never sees a new `nodeTypes` object per render. */
const NODE_TYPES: NodeTypes = { blast: BlastGraphNode };

/** Layered graph for ONE symbol: symbol → callers → endpoints/crons, laid out
 *  by dagre and drawn by React Flow as a static picture (no pan/zoom/drag).
 *  The canvas is sized to the layout, so the wrapper's native scrollbars take
 *  over when it is wider or taller than the card. A `Dropdown` picks which
 *  symbol to draw when there is more than one. */
export function BlastGraph({ downstream }: BlastGraphProps) {
  const t = useTranslations("blast");
  const [selected, setSelected] = React.useState<string | undefined>(downstream[0]?.symbol);
  const impact = downstream.find((d) => d.symbol === selected) ?? downstream[0];

  const layout = React.useMemo(() => (impact ? buildGraphLayout(impact) : null), [impact]);
  const flow = React.useMemo(() => (layout ? toFlow(layout, s.graphEdge) : null), [layout]);

  if (!impact || !layout || !flow) {
    return <div style={s.noDownstream}>{t("graph.empty")}</div>;
  }

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

      <div role="img" aria-label={t("graph.ariaLabel")} style={s.graphViewport}>
        <div style={{ width: layout.width, height: layout.height }}>
          <ReactFlow
            key={impact.symbol}
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={NODE_TYPES}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            style={s.graphFlow}
          />
        </div>
      </div>

      <div style={s.legendRow}>
        <LegendItem color={GRAPH_LEGEND_COLOR.symbol} label={t("graph.legend.symbol")} />
        <LegendItem color={GRAPH_LEGEND_COLOR.caller} label={t("graph.legend.callers")} />
        <LegendItem color={GRAPH_LEGEND_COLOR.endpoint} label={t("graph.legend.endpoints")} />
        <LegendItem color={GRAPH_LEGEND_COLOR.cron} label={t("graph.legend.crons")} />
      </div>
    </div>
  );
}

function BlastGraphNode({ data }: NodeProps<BlastFlowNode>) {
  const { node } = data;
  return (
    <div style={s.graphNode(node.kind, node.width, node.height)} title={node.detail ?? node.label}>
      <Handle type="target" position={Position.Left} isConnectable={false} style={s.graphHandle} />
      <span style={s.graphNodeLabel(node.kind)}>{node.label}</span>
      {node.detail && <span style={s.graphNodeDetail}>{node.detail}</span>}
      <Handle type="source" position={Position.Right} isConnectable={false} style={s.graphHandle} />
    </div>
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
