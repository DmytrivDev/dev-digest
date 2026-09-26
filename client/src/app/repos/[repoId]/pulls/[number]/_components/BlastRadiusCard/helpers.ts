import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import type { CSSProperties } from "react";
import { Position, type Edge, type Node } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { githubBlobUrl } from "@/lib/github-urls";
import {
  GRAPH_CHAR_WIDTH,
  GRAPH_MARGIN,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_MIN_WIDTH,
  GRAPH_NODE_PAD_X,
  GRAPH_NODE_SEP,
  GRAPH_RANK_SEP,
  GRAPH_TALL_NODE_HEIGHT,
} from "./constants";

/**
 * Pure helpers for the Blast Radius card. `callerHref` builds the exact
 * GitHub line link — the commit is the INDEX sha when one exists (the
 * caller's line was resolved against it), falling back to the PR head sha
 * otherwise (Key decision 6, docs/plans/blast-radius.plan.md). Returns
 * `null` when there is nothing to link to (no repoFullName, no sha at all).
 */
export function callerHref(
  repoFullName: string | null | undefined,
  indexedSha: string | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | null {
  if (!repoFullName) return null;
  const sha = indexedSha ?? headSha ?? undefined;
  if (!sha) return null;
  return githubBlobUrl(repoFullName, sha, file, line);
}

/** Resync is offered for a degraded index, but NOT for `files_unavailable` —
 *  that reason means "read the PR's files", not "rebuild the index", and no
 *  resync would change the answer. */
export function canResync(data: BlastRadius | undefined): boolean {
  return !!data?.degraded && data.reason !== "files_unavailable";
}

// ---- Graph layout (W7) ------------------------------------------------------

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Main line, never clipped — the node is sized to fit it. */
  label: string;
  /** Second, muted line (a caller's `file:line`). */
  detail?: string;
  /** Top-left corner, in canvas pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** Kind of the edge's target — the renderer tints edges into endpoints/crons. */
  toKind: GraphNodeKind;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Canvas size that holds every node plus `GRAPH_MARGIN` — the scroll area. */
  width: number;
  height: number;
}

/** Endpoints and crons share the right-hand column. */
function columnOf(kind: GraphNodeKind): GraphNodeKind {
  return kind === "cron" ? "endpoint" : kind;
}

/** Width that fits the longest line of a node in the mono font. */
function nodeWidth(lines: string[]): number {
  const longest = Math.max(...lines.map((l) => l.length));
  return Math.max(GRAPH_NODE_MIN_WIDTH, Math.ceil(longest * GRAPH_CHAR_WIDTH) + GRAPH_NODE_PAD_X * 2);
}

/**
 * Left-to-right layered layout (dagre) for ONE symbol's downstream impact:
 * the changed symbol, then every caller, then the endpoints/crons. Nodes are
 * sized to their FULL label, so nothing is clipped — the canvas grows instead
 * and the renderer scrolls it. An edge from a caller to an endpoint/cron is
 * drawn ONLY when that caller's own `endpoints`/`crons` (not the group's)
 * name it — so the graph never draws a relationship the data does not support.
 * Deterministic: the same impact always yields the same coordinates.
 */
export function buildGraphLayout(impact: DownstreamImpact): GraphLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: GRAPH_NODE_SEP, ranksep: GRAPH_RANK_SEP, marginx: GRAPH_MARGIN, marginy: GRAPH_MARGIN });
  g.setDefaultEdgeLabel(() => ({}));

  const meta = new Map<string, Omit<GraphNode, "x" | "y">>();
  const edges: GraphEdge[] = [];
  const addNode = (node: Omit<GraphNode, "x" | "y">) => {
    if (meta.has(node.id)) return;
    meta.set(node.id, node);
    g.setNode(node.id, { width: node.width, height: node.height });
  };
  const addEdge = (from: string, to: string, toKind: GraphNodeKind) => {
    const id = `${from}->${to}`;
    if (edges.some((e) => e.id === id)) return;
    edges.push({ id, from, to, toKind });
    g.setEdge(from, to);
  };

  const symbolId = `symbol:${impact.symbol}`;
  const symbolLabel = `${impact.symbol}()`;
  addNode({ id: symbolId, kind: "symbol", label: symbolLabel, width: nodeWidth([symbolLabel]), height: GRAPH_NODE_HEIGHT });

  for (const caller of impact.callers) {
    const callerId = `caller:${caller.file}:${caller.line}`;
    const detail = `${caller.file}:${caller.line}`;
    addNode({
      id: callerId,
      kind: "caller",
      label: caller.name,
      detail,
      width: nodeWidth([caller.name, detail]),
      height: GRAPH_TALL_NODE_HEIGHT,
    });
    addEdge(symbolId, callerId, "caller");

    for (const endpoint of caller.endpoints ?? []) {
      const id = `endpoint:${endpoint}`;
      addNode({ id, kind: "endpoint", label: endpoint, width: nodeWidth([endpoint]), height: GRAPH_NODE_HEIGHT });
      addEdge(callerId, id, "endpoint");
    }
    for (const cron of caller.crons ?? []) {
      const id = `cron:${cron}`;
      addNode({ id, kind: "cron", label: cron, width: nodeWidth([cron]), height: GRAPH_NODE_HEIGHT });
      addEdge(callerId, id, "cron");
    }
  }

  dagre.layout(g);

  // dagre reports node CENTRES; the renderer positions by top-left corner.
  const placed: GraphNode[] = [...meta.values()].map((n) => {
    const { x, y } = g.node(n.id);
    return { ...n, x: Math.round(x - n.width / 2), y: Math.round(y - n.height / 2) };
  });
  // dagre centres each column; left-aligning it reads as a list, like the tree.
  const columnLeft = new Map<GraphNodeKind, number>();
  for (const n of placed) {
    const column = columnOf(n.kind);
    columnLeft.set(column, Math.min(columnLeft.get(column) ?? Infinity, n.x));
  }
  const nodes = placed.map((n) => ({ ...n, x: columnLeft.get(columnOf(n.kind)) ?? n.x }));
  const width = Math.max(...nodes.map((n) => n.x + n.width)) + GRAPH_MARGIN;
  return { nodes, edges, width, height: Math.ceil(g.graph().height ?? 0) };
}

/** A React Flow node carrying one laid-out `GraphNode` for the custom renderer. */
export type BlastFlowNode = Node<{ node: GraphNode }, "blast">;

/**
 * Maps a `GraphLayout` onto React Flow's `nodes`/`edges`. Positions and sizes
 * are taken as-is (the layout already fixed them); `edgeStyle` tints each edge
 * by the kind of node it points into. Each node also declares its two handles
 * (left-centre in, right-centre out), so edges draw from the data alone instead
 * of waiting for React Flow to measure the DOM — which never happens while the
 * tab is hidden.
 */
export function toFlow(
  layout: GraphLayout,
  edgeStyle: (toKind: GraphNodeKind) => CSSProperties,
): { nodes: BlastFlowNode[]; edges: Edge[] } {
  return {
    nodes: layout.nodes.map((n) => ({
      id: n.id,
      type: "blast",
      position: { x: n.x, y: n.y },
      data: { node: n },
      width: n.width,
      height: n.height,
      handles: [
        { type: "target" as const, position: Position.Left, x: 0, y: n.height / 2, width: 1, height: 1 },
        { type: "source" as const, position: Position.Right, x: n.width - 1, y: n.height / 2, width: 1, height: 1 },
      ],
    })),
    edges: layout.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: "default",
      style: edgeStyle(e.toKind),
    })),
  };
}
