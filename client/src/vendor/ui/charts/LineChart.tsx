/* LineChart — multi-series line chart on Recharts.

   Three optional additions, all off by default so a caller that passes none of
   them renders exactly what it always did:
   - `null` in a series is a GAP in that line (never a fake 0);
   - `dots` draws a visible dot on every point;
   - `tooltip` makes the chart keyboard- and pointer-inspectable: the wrapper
     takes focus, ArrowLeft/Right/Home/End walk the points, Escape clears, and
     `tooltip.render(index)` is shown next to the active point. The chart knows
     nothing of what it shows — the caller renders the content. */
import React from "react";
import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export interface ChartSeries {
  name: string;
  color: string;
  /** `null` leaves a gap in the line at that index. */
  data: (number | null)[];
}

export interface ChartTooltip {
  /** Accessible name of the focusable chart. */
  label: string;
  /** Content for the point at `index`, shown as React children (text, never HTML). */
  render: (index: number) => React.ReactNode;
}

/** Radius of a point's dot when `dots` is on. */
const DOT_RADIUS = 3;

export function LineChart({
  series,
  w = 620,
  h = 200,
  yMin = 0.6,
  yMax = 1.0,
  ticks,
  dots = false,
  tooltip,
}: {
  series: ChartSeries[];
  w?: number;
  h?: number;
  yMin?: number;
  yMax?: number;
  /** Explicit y ticks. Without them Recharts picks its own (e.g. 0.25 / 0.75 on a
      0–1 domain), which the one-decimal labels then round to a misleading 0.3 / 0.8. */
  ticks?: number[];
  /** Draw a dot on every point. */
  dots?: boolean;
  /** Focus + hover tooltip. Absent → the chart is not focusable and shows none. */
  tooltip?: ChartTooltip;
}) {
  const n = series[0]?.data.length ?? 0;
  const rows = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number | null> = { i };
    series.forEach((s) => {
      const v = s.data[i];
      row[s.name] = v === undefined ? 0 : v;
    });
    return row;
  });

  const [active, setActive] = React.useState<number | null>(null);
  const tooltipId = React.useId();
  // The data can shrink under an open tooltip (a poll replaced the list).
  const activeIndex = active !== null && active < n ? active : null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const at = activeIndex ?? n - 1;
    let next: number | null | undefined;
    if (e.key === "ArrowRight") next = Math.min(at + 1, n - 1);
    else if (e.key === "ArrowLeft") next = Math.max(at - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") next = null;
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
  };

  const frac = activeIndex !== null && n > 1 ? activeIndex / (n - 1) : 0;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: w,
        height: h,
        ...(tooltip ? { position: "relative" as const } : null),
      }}
      {...(tooltip
        ? {
            tabIndex: 0,
            role: "group",
            "aria-label": tooltip.label,
            "aria-describedby": activeIndex !== null ? tooltipId : undefined,
            onKeyDown,
            onFocus: () => setActive((a) => a ?? (n > 0 ? n - 1 : null)),
            onBlur: () => setActive(null),
            onMouseLeave: () => setActive(null),
          }
        : null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart
          data={rows}
          margin={{ top: 14, right: 14, bottom: 8, left: -10 }}
          onMouseMove={
            tooltip
              ? (state) => {
                  const idx = Number(state?.activeTooltipIndex);
                  if (Number.isInteger(idx) && idx >= 0) setActive(idx);
                }
              : undefined
          }
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[yMin, yMax]}
            ticks={ticks}
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            tickFormatter={(v: number) => v.toFixed(1)}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          {tooltip && activeIndex !== null && (
            <ReferenceLine x={activeIndex} stroke="var(--border-strong)" />
          )}
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={dots ? { r: DOT_RADIUS, fill: s.color, stroke: s.color } : false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
      {tooltip && activeIndex !== null && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            top: 0,
            left: `calc(28px + (100% - 42px) * ${frac})`,
            transform: `translateX(-${frac * 100}%)`,
            pointerEvents: "none",
            zIndex: 2,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            boxShadow: "var(--shadow-modal)",
            padding: "8px 10px",
            fontSize: 12,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          {tooltip.render(activeIndex)}
        </div>
      )}
    </div>
  );
}
