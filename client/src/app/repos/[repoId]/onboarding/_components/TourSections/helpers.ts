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
