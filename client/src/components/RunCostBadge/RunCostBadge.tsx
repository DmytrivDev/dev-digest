import React from "react";
import { formatCost } from "@/lib/cost";

/**
 * Per-run generation cost, shown on the PR list (compact) and the Agent-runs
 * timeline (with token totals). Missing cost renders "—" (never "$0.00") so an
 * un-priced / failed / pre-tracking run reads differently from a genuine $0.
 *
 * - `compact`    → "$0.014"              (PR list COST column)
 * - `withTokens` → "9,119 tok · $0.0013" (timeline row, under the timestamp)
 */
type Props =
  | { variant: "compact"; cost: number | null | undefined }
  | {
      variant: "withTokens";
      cost: number | null | undefined;
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
    };

const mutedStyle: React.CSSProperties = { color: "var(--text-muted)" };

export function RunCostBadge(props: Props) {
  if (props.variant === "compact") {
    const hasCost = props.cost != null;
    return (
      <span className="tnum" style={hasCost ? undefined : mutedStyle}>
        {formatCost(props.cost)}
      </span>
    );
  }

  // Grouping is pinned to the UI's only locale — a bare toLocaleString()
  // follows the MACHINE locale ("9 119" here, "9,119" elsewhere).
  const total = (props.tokensIn ?? 0) + (props.tokensOut ?? 0);
  // No tokens AND no cost → nothing meaningful to show (running/failed run).
  if (total === 0 && props.cost == null) return <span style={mutedStyle}>—</span>;

  return (
    <span className="tnum" style={mutedStyle}>
      {total.toLocaleString("en-US")} tok · {formatCost(props.cost)}
    </span>
  );
}
