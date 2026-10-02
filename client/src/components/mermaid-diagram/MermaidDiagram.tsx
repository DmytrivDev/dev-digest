"use client";

import React from "react";
import { useTheme } from "@/lib/theme";

let seq = 0;

/** Mermaid diagrams must start with a known graph keyword. Anything else
 *  (prose, JSON like {"type":"Buffer"...}, empty) is not a diagram → skip. */
const MERMAID_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context)\b/;

function looksLikeMermaid(src: string): boolean {
  return MERMAID_RE.test(src.trim());
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
}: {
  chart: string;
  fallback?: React.ReactNode;
}) {
  const { theme } = useTheme();
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
        mermaid.initialize({ startOnLoad: false, theme: theme === "light" ? "default" : "dark", securityLevel: "strict" });
        // parse first; suppressErrors → returns false (no throw, no DOM bomb).
        const valid = await mermaid.parse(src, { suppressErrors: true });
        if (cancelled) return;
        if (!valid) {
          setState("invalid");
          return;
        }
        const { svg } = await mermaid.render(`dd-mermaid-${seq++}`, src);
        if (cancelled) return;
        if (ref.current) ref.current.innerHTML = svg;
        setState("ok");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, theme]);

  // Not a (valid) diagram → the caller's fallback (default nothing), never a broken box.
  if (state === "invalid") return <>{fallback}</>;

  return (
    <div
      ref={ref}
      style={{
        display: state === "ok" ? "flex" : "none",
        justifyContent: "center",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        overflowX: "auto",
      }}
    />
  );
}

export default MermaidDiagram;
