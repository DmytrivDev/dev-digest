import { DIAGRAM_ROLE_STYLES, type DiagramRole } from "./constants";

/** A section's distance (px) from the top of the scroll container. */
export interface SectionTop<K extends string = string> {
  kind: K;
  top: number;
}

/**
 * The section the reader is in: the LAST one whose top has reached `offset`,
 * else the first (AC-93). `tops` is in page order. Empty input → null.
 */
export function activeSection<K extends string>(
  tops: readonly SectionTop<K>[],
  offset: number,
): K | null {
  let active: K | null = tops[0]?.kind ?? null;
  for (const { kind, top } of tops) {
    if (top <= offset) active = kind;
  }
  return active;
}

/** The known roles a diagram tags its nodes with (`A:::role`), in legend order. */
export function diagramRoles(src: string | null): DiagramRole[] {
  if (!src) return [];
  const used = new Set([...src.matchAll(/:::(\w+)/g)].map((m) => m[1]));
  return (Object.keys(DIAGRAM_ROLE_STYLES) as DiagramRole[]).filter((role) => used.has(role));
}
