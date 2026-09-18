/** Pure line-diff used to compare a body snapshot with the current body. */

export type DiffKind = "ctx" | "add" | "del";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/**
 * Past this many lines on either side we stop computing an exact diff.
 *
 * The LCS table below is O(n×m); a skill body may be up to 512 KB (the import
 * cap), which is tens of thousands of lines, and an unbounded table would lock
 * the browser tab rather than fail. Above the cap the changed region is
 * reported as a whole-block replacement, which is still true — just coarser.
 */
const MAX_LCS_LINES = 1200;

/**
 * Line diff of `before` → `after`.
 *
 * Common prefix and suffix are stripped first. That is not only a speed trick:
 * a restore usually changes one section of a rubric, so without it the LCS runs
 * over the whole body to rediscover that the other 90% is untouched.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const aMid = a.slice(head, a.length - tail);
  const bMid = b.slice(head, b.length - tail);

  const middle =
    aMid.length > MAX_LCS_LINES || bMid.length > MAX_LCS_LINES
      ? [
          ...aMid.map((text): DiffLine => ({ kind: "del", text })),
          ...bMid.map((text): DiffLine => ({ kind: "add", text })),
        ]
      : lcsDiff(aMid, bMid);

  return [
    ...a.slice(0, head).map((text): DiffLine => ({ kind: "ctx", text })),
    ...middle,
    ...a.slice(a.length - tail).map((text): DiffLine => ({ kind: "ctx", text })),
  ];
}

/** Classic LCS-table diff over two already-trimmed line arrays. */
function lcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  // table[i][j] = length of the LCS of a[i..] and b[j..]
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** Whether a diff contains any change at all (used to say "identical"). */
export function hasChanges(lines: readonly DiffLine[]): boolean {
  return lines.some((l) => l.kind !== "ctx");
}
