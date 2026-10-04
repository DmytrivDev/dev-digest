/** A left-to-right diagram wider than its box by more than this is redrawn top-down:
    scaled to fit, a long LR chain shrinks its labels past reading size. */
export const TOO_WIDE_RATIO = 1.15;

const LEFT_RIGHT_RE = /^(\s*(?:flowchart|graph)\s+)(LR|RL)\b/;

/** The same flowchart drawn top-down, or `null` when it is not a left-right flowchart. */
export function toTopDown(src: string): string | null {
  return LEFT_RIGHT_RE.test(src) ? src.replace(LEFT_RIGHT_RE, "$1TB") : null;
}

/** How a node class (`A:::cls`) is drawn: its border colour, optionally dashed. */
export type NodeClassStyles = Record<string, { color: string; dashed?: boolean }>;

const CLASS_NAME_RE = /^[A-Za-z][\w-]*$/;
const COLOR_RE = /^[#(),.%\w\s-]+$/;

/** Mermaid `themeCSS` that colours each class's node border. Class names and colours that
    could break out of a CSS rule are skipped rather than escaped. */
export function nodeClassCSS(classes: NodeClassStyles): string {
  return Object.entries(classes)
    .filter(([cls, v]) => CLASS_NAME_RE.test(cls) && COLOR_RE.test(v.color))
    .map(
      ([cls, v]) =>
        ` .node.${cls} rect, .node.${cls} polygon, .node.${cls} circle, .node.${cls} path` +
        ` { stroke: ${v.color} !important; stroke-width: 1.5px !important;` +
        `${v.dashed ? " stroke-dasharray: 4 3;" : ""} }`,
    )
    .join("");
}

/** Width of a rendered mermaid SVG at its natural size, from its `viewBox`. */
export function naturalWidth(svg: string): number | null {
  const m = /viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+[\d.]+"/.exec(svg);
  return m ? Number(m[1]) : null;
}
