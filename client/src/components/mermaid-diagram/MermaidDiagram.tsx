"use client";

import React from "react";
import { useTheme } from "@/lib/theme";
import {
  TOO_WIDE_RATIO,
  naturalWidth,
  nodeClassCSS,
  toTopDown,
  type NodeClassStyles,
} from "./helpers";

const NO_NODE_CLASSES: NodeClassStyles = {};

let seq = 0;

/** Mermaid diagrams must start with a known graph keyword. Anything else
 *  (prose, JSON like {"type":"Buffer"...}, empty) is not a diagram → skip. */
const MERMAID_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context)\b/;

function looksLikeMermaid(src: string): boolean {
  return MERMAID_RE.test(src.trim());
}

/** A design token's current value; `fallback` under jsdom or before styles load. */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Mermaid's `base` theme painted with the app's own tokens (read live, so a theme toggle
 * re-colours it): surface-coloured nodes with a strong border, muted connectors and the
 * app's mono font. Nodes get rounded corners like the rest of the design system.
 */
function mermaidConfig(theme: string, nodeClasses: NodeClassStyles) {
  const dark = theme !== "light";
  // Class colours arrive as design-token names; mermaid needs concrete values.
  const resolved = Object.fromEntries(
    Object.entries(nodeClasses).map(([cls, v]) => [cls, { ...v, color: token(v.color, "#888888") }]),
  );
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    theme: "base" as const,
    darkMode: dark,
    fontFamily: token("--font-mono", "ui-monospace, monospace"),
    themeVariables: {
      darkMode: dark,
      background: "transparent",
      primaryColor: token("--bg-surface", dark ? "#1f1f1f" : "#ffffff"),
      primaryBorderColor: token("--border-strong", dark ? "#4a4a4a" : "#c8c8c8"),
      primaryTextColor: token("--text-primary", dark ? "#ededed" : "#111111"),
      lineColor: token("--text-muted", dark ? "#8a8a8a" : "#6b6b6b"),
      fontSize: "12px",
    },
    themeCSS:
      ".node rect, .node polygon { rx: 7px; ry: 7px; } .edgeLabel { font-size: 11px; }" +
      nodeClassCSS(resolved),
    flowchart: { curve: "basis" as const, nodeSpacing: 28, rankSpacing: 44, padding: 14, useMaxWidth: false },
  };
}

/**
 * Renders a mermaid diagram string to inline SVG. mermaid is imported lazily
 * (client-only). We VALIDATE with mermaid.parse({suppressErrors}) before
 * rendering — mermaid otherwise injects a "Syntax error" bomb graphic into the
 * DOM on bad input instead of throwing. Junk/unparseable input renders
 * `fallback` (default: nothing). The mermaid theme follows the app theme and a
 * toggle re-renders; `securityLevel` stays "strict" (mermaid sanitises the SVG).
 */
export function MermaidDiagram({
  chart,
  fallback = null,
  nodeClasses = NO_NODE_CLASSES,
}: {
  chart: string;
  fallback?: React.ReactNode;
  /** Border colour (a design-token name such as `--accent`) per node class (`A:::cls`). */
  nodeClasses?: NodeClassStyles;
}) {
  const { theme } = useTheme();
  const classKey = JSON.stringify(nodeClasses);
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<"pending" | "ok" | "invalid">("pending");

  React.useEffect(() => {
    let cancelled = false;
    const src = (chart ?? "").trim();
    if (!looksLikeMermaid(src)) {
      setState("invalid");
      return;
    }
    setState("pending");
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize(mermaidConfig(theme, nodeClasses));
        // parse first; suppressErrors → returns false (no throw, no DOM bomb).
        const valid = await mermaid.parse(src, { suppressErrors: true });
        if (cancelled) return;
        if (!valid) {
          setState("invalid");
          return;
        }
        let { svg } = await mermaid.render(`dd-mermaid-${seq++}`, src);
        if (cancelled) return;
        // A long left-to-right chain is shrunk to unreadable text when it is fitted to the
        // box, so it is redrawn top-down instead (once).
        // The diagram box is hidden until the SVG is in, so measure the space it will fill.
        const box = ref.current?.parentElement?.clientWidth ?? 0;
        const width = naturalWidth(svg);
        const topDown = toTopDown(src);
        if (topDown && box > 0 && width !== null && width > box * TOO_WIDE_RATIO) {
          ({ svg } = await mermaid.render(`dd-mermaid-${seq++}`, topDown));
          if (cancelled) return;
        }
        if (ref.current) {
          ref.current.innerHTML = svg;
          // Shrink to the box keeping proportions; never stretch past natural size.
          const el = ref.current.querySelector("svg");
          if (el) {
            el.style.maxWidth = "100%";
            el.style.height = "auto";
          }
        }
        setState("ok");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
    // `classKey` stands in for `nodeClasses`, so a new-but-equal object does not re-render.
  }, [chart, theme, classKey]);

  // Not a (valid) diagram → the caller's fallback (default nothing), never a broken box.
  if (state === "invalid") return <>{fallback}</>;

  return (
    <div
      ref={ref}
      style={{
        display: state === "ok" ? "flex" : "none",
        justifyContent: "center",
        background: "var(--bg-primary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "18px 16px",
        overflowX: "auto",
      }}
    />
  );
}

export default MermaidDiagram;
