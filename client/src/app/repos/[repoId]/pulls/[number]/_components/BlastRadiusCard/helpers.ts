import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

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

export type GraphNodeKind = "symbol" | "caller" | "more" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  x: number;
  y: number;
  /** Only set for a `kind: "more"` node — the count the collapsed callers represent. */
  moreCount?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Clips a node label to `max` characters (the mock's own rule: `>16` chars → "…"). */
export function clipLabel(label: string, max = 16): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Pure three-column layout for ONE symbol's downstream impact: the changed
 * symbol on the left, its callers in the middle (capped at `maxCallers`, the
 * rest collapsed into one "+N more" node), and the endpoints/crons on the
 * right. An edge from a caller to an endpoint/cron is drawn ONLY when that
 * caller's own `endpoints`/`crons` (not the group's) name it — so the graph
 * never draws a relationship the data does not support.
 */
export function buildGraphLayout(
  impact: DownstreamImpact,
  opts: { width: number; height: number; maxCallers: number },
): GraphLayout {
  const { width, height, maxCallers } = opts;
  const colX = { symbol: width * 0.12, caller: width * 0.5, target: width * 0.88 };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const symbolId = `symbol:${impact.symbol}`;
  nodes.push({
    id: symbolId,
    label: clipLabel(`${impact.symbol}()`),
    kind: "symbol",
    x: colX.symbol,
    y: height / 2,
  });

  const shownCallers = impact.callers.slice(0, maxCallers);
  const overflow = impact.callers.length - shownCallers.length;
  const callerSlots = shownCallers.length + (overflow > 0 ? 1 : 0);
  const callerStep = callerSlots > 0 ? height / (callerSlots + 1) : 0;

  const targetNodes: GraphNode[] = [];

  shownCallers.forEach((caller, i) => {
    const callerId = `caller:${caller.file}:${caller.line}`;
    nodes.push({
      id: callerId,
      label: clipLabel(caller.name),
      kind: "caller",
      x: colX.caller,
      y: callerStep * (i + 1),
    });
    edges.push({ from: symbolId, to: callerId });

    for (const endpoint of caller.endpoints ?? []) {
      const endpointId = `endpoint:${endpoint}`;
      if (!targetNodes.some((n) => n.id === endpointId)) {
        targetNodes.push({ id: endpointId, label: clipLabel(endpoint), kind: "endpoint", x: colX.target, y: 0 });
      }
      edges.push({ from: callerId, to: endpointId });
    }
    for (const cron of caller.crons ?? []) {
      const cronId = `cron:${cron}`;
      if (!targetNodes.some((n) => n.id === cronId)) {
        targetNodes.push({ id: cronId, label: clipLabel(cron), kind: "cron", x: colX.target, y: 0 });
      }
      edges.push({ from: callerId, to: cronId });
    }
  });

  if (overflow > 0) {
    const moreId = "caller:__more__";
    nodes.push({
      id: moreId,
      label: "",
      kind: "more",
      x: colX.caller,
      y: callerStep * callerSlots,
      moreCount: overflow,
    });
    edges.push({ from: symbolId, to: moreId });
  }

  const targetStep = targetNodes.length > 0 ? height / (targetNodes.length + 1) : 0;
  targetNodes.forEach((n, i) => {
    n.y = targetStep * (i + 1);
  });

  return { nodes: [...nodes, ...targetNodes], edges };
}
